(function () {
  /* The repository the admin commits to. When the site is served from a
     *.github.io domain (a GitHub Pages user site), the repository is derived
     from the hostname — e.g. annay-de.github.io serves the repo of the same
     name. The fallback covers local previews and any custom domain. */
  const host = window.location.hostname;
  const isUserSite = /\.github\.io$/.test(host);
  const REPO_OWNER = isUserSite ? host.split(".")[0] : "annay-de";
  const REPO_NAME = isUserSite ? host : "annay-de.github.io";
  const API_ROOT = "https://api.github.com";
  const TOKEN_KEY = "annay-admin-token";
  const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

  const FILES = {
    posts: "data/posts.json",
    pages: "data/pages.json",
    site: "data/site.json",
    endeavours: "data/endeavours.json"
  };

  const PAGE_KEYS = [
    { key: "projects", label: "Research" },
    { key: "teaching", label: "Teaching" },
    { key: "writings", label: "Writings" },
    { key: "more", label: "More" }
  ];

  const state = {
    token: null,
    branch: null,
    user: null,
    data: { posts: null, pages: null, site: null, endeavours: null },
    shas: {},
    activePage: "projects"
  };

  const loginView = document.getElementById("admin-login");
  const appView = document.getElementById("admin-app");
  if (!loginView || !appView) return;

  /* ---------- helpers ---------- */

  function $(id) {
    return document.getElementById(id);
  }

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([key, value]) => {
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value);
    });
    (children || []).forEach((child) => child && node.appendChild(child));
    return node;
  }

  function field(labelText, input) {
    return el("label", { class: "field" }, [el("span", { class: "field-label", text: labelText }), input]);
  }

  function fieldRow(fields) {
    return el("div", { class: "field-row" }, fields);
  }

  function textInput(value, placeholder, oninput) {
    const input = el("input", { type: "text", value: value || "", placeholder: placeholder || "" });
    if (oninput) input.addEventListener("input", () => oninput(input.value));
    return input;
  }

  function textArea(value, rows, placeholder, oninput) {
    const input = el("textarea", { rows: String(rows || 3), placeholder: placeholder || "" });
    input.value = value || "";
    if (oninput) input.addEventListener("input", () => oninput(input.value));
    return input;
  }

  function toBase64(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary);
  }

  function fromBase64(b64) {
    const binary = atob(String(b64).replace(/\s/g, ""));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function slugify(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9.]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
  }

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function setStatus(message, kind) {
    const bar = $("admin-statusbar");
    if (!bar) return;
    bar.hidden = !message;
    bar.textContent = message || "";
    bar.dataset.kind = kind || "info";
    if (kind === "ok") {
      window.clearTimeout(setStatus.timer);
      setStatus.timer = window.setTimeout(() => {
        bar.hidden = true;
      }, 5000);
    }
  }

  /* ---------- GitHub API ---------- */

  async function api(path, options) {
    const response = await fetch(API_ROOT + path, {
      ...(options || {}),
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: "Bearer " + state.token,
        "X-GitHub-Api-Version": "2022-11-28",
        ...((options || {}).headers || {})
      }
    });
    if (!response.ok) {
      let detail = "";
      try {
        detail = (await response.json()).message || "";
      } catch (error) {}
      const err = new Error(detail || "GitHub API error " + response.status);
      err.status = response.status;
      throw err;
    }
    return response.status === 204 ? null : response.json();
  }

  function emptyDoc(key) {
    if (key === "posts") return { posts: [] };
    if (key === "pages") return {};
    if (key === "site") return {};
    return { items: [] };
  }

  async function loadFile(key) {
    try {
      const file = await api(
        "/repos/" + REPO_OWNER + "/" + REPO_NAME + "/contents/" + FILES[key] + "?ref=" + encodeURIComponent(state.branch)
      );
      state.shas[key] = file.sha;
      state.data[key] = JSON.parse(fromBase64(file.content));
    } catch (error) {
      if (error.status === 404) {
        state.shas[key] = null;
        state.data[key] = emptyDoc(key);
      } else {
        throw error;
      }
    }
  }

  async function saveFile(key, message) {
    const body = {
      message: message,
      content: toBase64(JSON.stringify(state.data[key], null, 2) + "\n"),
      branch: state.branch
    };
    if (state.shas[key]) body.sha = state.shas[key];
    const result = await api("/repos/" + REPO_OWNER + "/" + REPO_NAME + "/contents/" + FILES[key], {
      method: "PUT",
      body: JSON.stringify(body)
    });
    state.shas[key] = result.content.sha;
  }

  async function commit(key, message, busyButton) {
    if (busyButton) busyButton.disabled = true;
    setStatus("Saving…", "info");
    try {
      await saveFile(key, message);
      setStatus("Saved. The live site updates once GitHub Pages finishes rebuilding (usually under a minute).", "ok");
    } catch (error) {
      if (error.status === 409) {
        setStatus("Save conflict: the file changed on GitHub since it was loaded. Reload the page and try again.", "error");
      } else {
        setStatus("Could not save: " + error.message, "error");
      }
      throw error;
    } finally {
      if (busyButton) busyButton.disabled = false;
    }
  }

  function uploadImage(file) {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith("image/")) {
        reject(new Error("Please choose an image file."));
        return;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        reject(new Error("Image is larger than 5 MB. Please resize it first."));
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Could not read the file."));
      reader.onload = async () => {
        try {
          const base64 = String(reader.result).split(",")[1];
          const stamp = today().replace(/-/g, "");
          const path = "assets/uploads/" + stamp + "-" + (slugify(file.name) || "image");
          await api("/repos/" + REPO_OWNER + "/" + REPO_NAME + "/contents/" + path, {
            method: "PUT",
            body: JSON.stringify({
              message: "Upload image: " + file.name,
              content: base64,
              branch: state.branch
            })
          });
          resolve(path);
        } catch (error) {
          if (error.status === 422) {
            reject(new Error("A file with this name was already uploaded today. Rename the file and try again."));
          } else {
            reject(error);
          }
        }
      };
      reader.readAsDataURL(file);
    });
  }

  /* Image picker: path input + upload button + thumbnail preview. */
  function imageField(labelText, getValue, setValue) {
    const input = textInput(getValue(), "assets/uploads/… or https://…", (value) => {
      setValue(value.trim());
      refresh();
    });
    const preview = el("img", { class: "image-preview", alt: "" });
    const fileInput = el("input", { type: "file", accept: "image/*", hidden: "hidden" });

    function refresh() {
      const value = getValue();
      preview.src = value || "";
      preview.hidden = !value;
    }

    fileInput.addEventListener("change", async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      setStatus("Uploading image…", "info");
      try {
        const path = await uploadImage(file);
        setValue(path);
        input.value = path;
        refresh();
        setStatus("Image uploaded. Remember to save this tab to use it.", "ok");
      } catch (error) {
        setStatus("Upload failed: " + error.message, "error");
      }
      fileInput.value = "";
    });

    refresh();
    return el("div", { class: "field image-picker" }, [
      el("span", { class: "field-label", text: labelText }),
      el("div", { class: "image-picker-row" }, [
        input,
        el("button", { class: "btn ghost", type: "button", text: "Upload", onclick: () => fileInput.click() }),
        el("button", {
          class: "btn ghost",
          type: "button",
          text: "Clear",
          onclick: () => {
            setValue("");
            input.value = "";
            refresh();
          }
        })
      ]),
      preview,
      fileInput
    ]);
  }

  /* ---------- auth ---------- */

  async function signIn(token) {
    state.token = token;
    const repo = await api("/repos/" + REPO_OWNER + "/" + REPO_NAME);
    if (!repo.permissions || !repo.permissions.push) {
      throw new Error("This token does not have write access to " + REPO_OWNER + "/" + REPO_NAME + ".");
    }
    state.branch = repo.default_branch;
    try {
      state.user = (await api("/user")).login;
    } catch (error) {
      state.user = null;
    }
    await Promise.all([loadFile("posts"), loadFile("pages"), loadFile("site"), loadFile("endeavours")]);
  }

  function storedToken() {
    try {
      return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
    } catch (error) {
      return null;
    }
  }

  function storeToken(token, persist) {
    try {
      sessionStorage.setItem(TOKEN_KEY, token);
      if (persist) localStorage.setItem(TOKEN_KEY, token);
    } catch (error) {}
  }

  function clearToken() {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(TOKEN_KEY);
    } catch (error) {}
  }

  function showApp() {
    loginView.hidden = true;
    appView.hidden = false;
    $("admin-signed").textContent =
      (state.user ? "Signed in as " + state.user + " · " : "") + "committing to " + REPO_OWNER + "/" + REPO_NAME + " (" + state.branch + ")";
    renderPostsPanel();
    renderPagesPanel();
    renderHomePanel();
    renderEndeavoursPanel();
    renderSitePanel();
  }

  /* ---------- posts panel ---------- */

  function renderPostsPanel() {
    const panel = $("panel-posts");
    panel.innerHTML = "";
    const posts = state.data.posts.posts;

    panel.appendChild(
      el("div", { class: "panel-head" }, [
        el("p", { class: "panel-hint", text: posts.length + (posts.length === 1 ? " post" : " posts") + " published." }),
        el("button", { class: "btn primary", type: "button", text: "New post", onclick: () => openPostEditor(null) })
      ])
    );

    const list = el("div", { class: "admin-list" });
    posts
      .slice()
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .forEach((post) => {
        list.appendChild(
          el("div", { class: "admin-row" }, [
            el("div", { class: "admin-row-main" }, [
              el("div", { class: "publication-meta", text: (post.date || "undated") + (post.tags && post.tags.length ? " · " + post.tags.join(", ") : "") }),
              el("h3", { text: post.title })
            ]),
            el("div", { class: "admin-row-actions" }, [
              el("button", { class: "btn ghost", type: "button", text: "Edit", onclick: () => openPostEditor(post.slug) }),
              el("button", {
                class: "btn ghost danger",
                type: "button",
                text: "Delete",
                onclick: async (event) => {
                  if (!window.confirm('Delete "' + post.title + '"? This commits immediately.')) return;
                  const previous = state.data.posts.posts;
                  state.data.posts.posts = previous.filter((entry) => entry.slug !== post.slug);
                  try {
                    await commit("posts", "Delete blog post: " + post.title, event.currentTarget);
                    renderPostsPanel();
                  } catch (error) {
                    state.data.posts.posts = previous;
                  }
                }
              })
            ])
          ])
        );
      });
    panel.appendChild(list);
    panel.appendChild(el("div", { id: "post-editor-slot" }));
  }

  function openPostEditor(slug) {
    const slot = $("post-editor-slot");
    slot.innerHTML = "";
    const existing = slug ? state.data.posts.posts.find((post) => post.slug === slug) : null;
    const draft = { cover: existing ? existing.cover || "" : "" };

    const titleInput = el("input", { type: "text", value: existing ? existing.title : "", placeholder: "Post title" });
    const slugInput = el("input", { type: "text", value: existing ? existing.slug : "", placeholder: "url-slug (auto)" });
    const dateInput = el("input", { type: "date", value: existing ? existing.date : today() });
    const tagsInput = el("input", { type: "text", value: existing && existing.tags ? existing.tags.join(", ") : "", placeholder: "tags, comma, separated" });
    const summaryInput = el("textarea", { rows: "2", placeholder: "One or two sentence summary shown on the blog index." });
    summaryInput.value = existing ? existing.summary || "" : "";
    const contentInput = el("textarea", { rows: "16", class: "mono", placeholder: "Write in markdown: ## headings, **bold**, *italic*, [links](https://…), - lists, > quotes, ``` code fences." });
    contentInput.value = existing ? existing.content || "" : "";

    let slugTouched = Boolean(existing);
    titleInput.addEventListener("input", () => {
      if (!slugTouched) slugInput.value = slugify(titleInput.value);
    });
    slugInput.addEventListener("input", () => {
      slugTouched = true;
    });

    const preview = el("div", { class: "post-body admin-preview", hidden: "hidden" });
    const previewToggle = el("button", {
      class: "btn ghost",
      type: "button",
      text: "Preview",
      onclick: () => {
        const showing = !preview.hidden;
        preview.hidden = showing;
        previewToggle.textContent = showing ? "Preview" : "Hide preview";
        if (!showing) preview.innerHTML = window.renderMarkdown(contentInput.value);
      }
    });
    contentInput.addEventListener("input", () => {
      if (!preview.hidden) preview.innerHTML = window.renderMarkdown(contentInput.value);
    });

    const saveButton = el("button", {
      class: "btn primary",
      type: "button",
      text: existing ? "Save changes" : "Publish post",
      onclick: async () => {
        const title = titleInput.value.trim();
        const postSlug = slugify(slugInput.value.trim() || titleInput.value);
        if (!title || !postSlug) {
          setStatus("A post needs at least a title.", "error");
          return;
        }
        const duplicate = state.data.posts.posts.some((post) => post.slug === postSlug && (!existing || post.slug !== existing.slug));
        if (duplicate) {
          setStatus('A post with the slug "' + postSlug + '" already exists.', "error");
          return;
        }
        const post = {
          slug: postSlug,
          title: title,
          date: dateInput.value || today(),
          tags: tagsInput.value.split(",").map((tag) => tag.trim()).filter(Boolean),
          summary: summaryInput.value.trim(),
          cover: draft.cover,
          content: contentInput.value
        };
        const previous = state.data.posts.posts.slice();
        if (existing) {
          state.data.posts.posts = state.data.posts.posts.map((entry) => (entry.slug === existing.slug ? post : entry));
        } else {
          state.data.posts.posts.push(post);
        }
        try {
          await commit("posts", (existing ? "Update" : "Add") + " blog post: " + title, saveButton);
          renderPostsPanel();
        } catch (error) {
          state.data.posts.posts = previous;
        }
      }
    });

    slot.appendChild(
      el("div", { class: "admin-card editor-card" }, [
        el("h3", { class: "editor-title", text: existing ? "Edit post" : "New post" }),
        fieldRow([field("Title", titleInput), field("Slug", slugInput)]),
        fieldRow([field("Date", dateInput), field("Tags", tagsInput)]),
        field("Summary", summaryInput),
        imageField("Cover photo (optional, shown faded behind the post title)", () => draft.cover, (value) => {
          draft.cover = value;
        }),
        field("Content", contentInput),
        preview,
        el("div", { class: "admin-actions" }, [
          saveButton,
          previewToggle,
          el("button", {
            class: "btn ghost",
            type: "button",
            text: "Cancel",
            onclick: () => {
              slot.innerHTML = "";
            }
          })
        ])
      ])
    );
    slot.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  /* ---------- pages panel (Research / Teaching / Writings / More) ---------- */

  function renderPagesPanel() {
    const panel = $("panel-pages");
    panel.innerHTML = "";

    const switcher = el("div", { class: "admin-tabs sub-tabs" });
    PAGE_KEYS.forEach((entry) => {
      switcher.appendChild(
        el("button", {
          class: "admin-tab" + (state.activePage === entry.key ? " active" : ""),
          type: "button",
          text: entry.label,
          onclick: () => {
            state.activePage = entry.key;
            renderPagesPanel();
          }
        })
      );
    });
    panel.appendChild(switcher);

    if (!state.data.pages[state.activePage]) {
      state.data.pages[state.activePage] = { title: "", sections: [] };
    }
    const doc = state.data.pages[state.activePage];
    doc.sections = doc.sections || [];

    panel.appendChild(
      el("p", {
        class: "panel-hint",
        text: "Sections render on the page in this order. In text fields you can use **bold**, *italic*, and [label](https://url). Links use one “Label | https://url” per line; leave the URL empty to show a greyed-out pending link."
      })
    );

    const titleInput = textInput(doc.title, "Page heading", (value) => {
      doc.title = value;
    });
    panel.appendChild(el("div", { class: "admin-card slim-card" }, [field("Page heading (H1)", titleInput)]));

    doc.sections.forEach((section, sectionIndex) => {
      const card = el("div", { class: "admin-card section-card" });
      card.appendChild(
        field("Section title", textInput(section.title, "", (value) => {
          section.title = value;
        }))
      );

      (section.items || []).forEach((item, itemIndex) => {
        card.appendChild(pageItemEditor(section, item, itemIndex));
      });

      card.appendChild(
        el("div", { class: "admin-actions" }, [
          el("button", {
            class: "btn ghost",
            type: "button",
            text: "Add entry",
            onclick: () => {
              section.items = section.items || [];
              section.items.push({ kicker: "", title: "", text: "", meta: "", links: [] });
              renderPagesPanel();
            }
          }),
          sectionIndex > 0
            ? el("button", {
                class: "btn ghost",
                type: "button",
                text: "Move section up",
                onclick: () => {
                  const sections = doc.sections;
                  [sections[sectionIndex - 1], sections[sectionIndex]] = [sections[sectionIndex], sections[sectionIndex - 1]];
                  renderPagesPanel();
                }
              })
            : null,
          el("button", {
            class: "btn ghost danger",
            type: "button",
            text: "Remove section",
            onclick: () => {
              if (!window.confirm('Remove the whole "' + (section.title || "untitled") + '" section? Remember to save after.')) return;
              doc.sections.splice(sectionIndex, 1);
              renderPagesPanel();
            }
          })
        ])
      );
      panel.appendChild(card);
    });

    panel.appendChild(
      el("div", { class: "admin-actions sticky-actions" }, [
        el("button", {
          class: "btn primary",
          type: "button",
          text: "Save this page",
          onclick: (event) => {
            const label = (PAGE_KEYS.find((entry) => entry.key === state.activePage) || {}).label || state.activePage;
            commit("pages", "Update " + label + " page", event.currentTarget).then(() => {}, () => {});
          }
        }),
        el("button", {
          class: "btn ghost",
          type: "button",
          text: "Add section",
          onclick: () => {
            doc.sections.push({ title: "", items: [] });
            renderPagesPanel();
          }
        })
      ])
    );
  }

  function pageItemEditor(section, item, itemIndex) {
    const linksValue = (item.links || []).map((link) => link.label + " | " + (link.url || "")).join("\n");

    return el("div", { class: "admin-subcard" }, [
      el("div", { class: "subcard-head" }, [
        el("span", { class: "publication-meta", text: "Entry " + (itemIndex + 1) }),
        el("div", { class: "admin-row-actions" }, [
          itemIndex > 0
            ? el("button", {
                class: "btn ghost",
                type: "button",
                text: "↑",
                "aria-label": "Move up",
                onclick: () => {
                  const items = section.items;
                  [items[itemIndex - 1], items[itemIndex]] = [items[itemIndex], items[itemIndex - 1]];
                  renderPagesPanel();
                }
              })
            : null,
          el("button", {
            class: "btn ghost danger",
            type: "button",
            text: "Remove",
            onclick: () => {
              section.items.splice(itemIndex, 1);
              renderPagesPanel();
            }
          })
        ])
      ]),
      field("Kicker (small line above the title, optional)", textInput(item.kicker, "e.g. “With … · 2025”", (value) => {
        item.kicker = value;
      })),
      field("Title", textInput(item.title, "Entry title", (value) => {
        item.title = value;
      })),
      field("Text (optional; blank line starts a new paragraph)", textArea(item.text, 3, "", (value) => {
        item.text = value;
      })),
      field("Meta line (small grey line below, optional)", textInput(item.meta, "e.g. “Since 2025”", (value) => {
        item.meta = value;
      })),
      field("Links (Label | URL, one per line; empty URL = pending)", textArea(linksValue, 2, "Website | https://example.com", (value) => {
        item.links = value
          .split("\n")
          .map((line) => {
            if (!line.trim()) return null;
            const split = line.split("|");
            const label = split[0].trim();
            const url = split.slice(1).join("|").trim();
            return label ? { label: label, url: url } : null;
          })
          .filter(Boolean);
      }))
    ]);
  }

  /* ---------- home panel ---------- */

  function renderHomePanel() {
    const panel = $("panel-home");
    panel.innerHTML = "";
    if (!state.data.site.home) state.data.site.home = {};
    const home = state.data.site.home;
    home.roles = home.roles || [];
    home.portrait = home.portrait || {};

    panel.appendChild(
      el("p", { class: "panel-hint", text: "Everything on the homepage except the Current Endeavours list (which has its own tab)." })
    );

    const card = el("div", { class: "admin-card section-card" });
    card.appendChild(field("Name / main heading", textInput(home.heading, "Annay De", (value) => {
      home.heading = value;
    })));

    const rolesWrap = el("div", { class: "roles-editor" });
    function renderRoles() {
      rolesWrap.innerHTML = "";
      home.roles.forEach((role, index) => {
        rolesWrap.appendChild(
          el("div", { class: "admin-subcard" }, [
            el("div", { class: "subcard-head" }, [
              el("span", { class: "publication-meta", text: "Role line " + (index + 1) }),
              el("div", { class: "admin-row-actions" }, [
                index > 0
                  ? el("button", {
                      class: "btn ghost",
                      type: "button",
                      text: "↑",
                      "aria-label": "Move up",
                      onclick: () => {
                        [home.roles[index - 1], home.roles[index]] = [home.roles[index], home.roles[index - 1]];
                        renderRoles();
                      }
                    })
                  : null,
                el("button", {
                  class: "btn ghost danger",
                  type: "button",
                  text: "Remove",
                  onclick: () => {
                    home.roles.splice(index, 1);
                    renderRoles();
                  }
                })
              ])
            ]),
            fieldRow([
              field("Plain text before the link", textInput(role.prefix, "Junior Research Fellow, ", (value) => {
                role.prefix = value;
              })),
              field("Linked text", textInput(role.text, "Ashoka University", (value) => {
                role.text = value;
              }))
            ]),
            field("Link URL (empty = no link)", textInput(role.url, "https://…", (value) => {
              role.url = value;
            }))
          ])
        );
      });
    }
    renderRoles();
    card.appendChild(
      el("div", { class: "field" }, [el("span", { class: "field-label", text: "Role lines under your name" }), rolesWrap])
    );
    card.appendChild(
      el("div", { class: "admin-actions" }, [
        el("button", {
          class: "btn ghost",
          type: "button",
          text: "Add role line",
          onclick: () => {
            home.roles.push({ prefix: "", text: "", url: "" });
            renderRoles();
          }
        })
      ])
    );

    card.appendChild(
      field(
        "Bio (blank line starts a new paragraph; **bold**, *italic*, [label](url) work)",
        textArea((home.bio || []).join("\n\n"), 6, "", (value) => {
          home.bio = value.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
        })
      )
    );

    card.appendChild(imageField("Portrait photo", () => home.portrait.src || "", (value) => {
      home.portrait.src = value;
    }));
    card.appendChild(
      fieldRow([
        field("Portrait caption", textInput(home.portrait.caption, "email or a short line", (value) => {
          home.portrait.caption = value;
        })),
        field("Caption link (e.g. mailto:you@…)", textInput(home.portrait.captionUrl, "mailto:…", (value) => {
          home.portrait.captionUrl = value;
        }))
      ])
    );
    card.appendChild(field("Endeavours section heading", textInput(home.endeavoursTitle, "Current Endeavours", (value) => {
      home.endeavoursTitle = value;
    })));

    panel.appendChild(card);
    panel.appendChild(
      el("div", { class: "admin-actions sticky-actions" }, [
        el("button", {
          class: "btn primary",
          type: "button",
          text: "Save homepage",
          onclick: (event) => commit("site", "Update homepage content", event.currentTarget).then(() => {}, () => {})
        })
      ])
    );
  }

  /* ---------- endeavours panel ---------- */

  function renderEndeavoursPanel() {
    const panel = $("panel-endeavours");
    panel.innerHTML = "";
    const items = state.data.endeavours.items;

    panel.appendChild(
      el("p", { class: "panel-hint", text: "These lines appear under “Current Endeavours” on the homepage, in this order." })
    );

    const list = el("div", { class: "admin-list" });
    items.forEach((item, index) => {
      const input = el("textarea", { rows: "2" });
      input.value = item;
      input.addEventListener("input", () => {
        items[index] = input.value;
      });
      list.appendChild(
        el("div", { class: "admin-row endeavour-row" }, [
          input,
          el("div", { class: "admin-row-actions" }, [
            index > 0
              ? el("button", {
                  class: "btn ghost",
                  type: "button",
                  text: "↑",
                  "aria-label": "Move up",
                  onclick: () => {
                    [items[index - 1], items[index]] = [items[index], items[index - 1]];
                    renderEndeavoursPanel();
                  }
                })
              : null,
            el("button", {
              class: "btn ghost danger",
              type: "button",
              text: "Remove",
              onclick: () => {
                items.splice(index, 1);
                renderEndeavoursPanel();
              }
            })
          ])
        ])
      );
    });
    panel.appendChild(list);

    panel.appendChild(
      el("div", { class: "admin-actions sticky-actions" }, [
        el("button", {
          class: "btn primary",
          type: "button",
          text: "Save endeavours",
          onclick: (event) => {
            state.data.endeavours.items = items.map((item) => item.trim()).filter(Boolean);
            commit("endeavours", "Update current endeavours", event.currentTarget).then(
              () => renderEndeavoursPanel(),
              () => {}
            );
          }
        }),
        el("button", {
          class: "btn ghost",
          type: "button",
          text: "Add line",
          onclick: () => {
            items.push("");
            renderEndeavoursPanel();
          }
        })
      ])
    );
  }

  /* ---------- site & footer panel ---------- */

  function renderSitePanel() {
    const panel = $("panel-site");
    panel.innerHTML = "";
    const site = state.data.site;
    site.nav = site.nav || {};
    site.nav.labels = site.nav.labels || {};
    site.cv = site.cv || {};
    site.footer = site.footer || {};
    site.footer.social = site.footer.social || [
      { label: "LinkedIn", url: "" },
      { label: "GitHub", url: "" },
      { label: "X / Twitter", url: "" }
    ];

    panel.appendChild(
      el("p", { class: "panel-hint", text: "Navigation bar labels, the CV embed, and the footer, shared by every page." })
    );

    const navCard = el("div", { class: "admin-card section-card" });
    navCard.appendChild(el("h3", { class: "editor-title", text: "Navigation bar" }));
    navCard.appendChild(
      fieldRow([
        field("Brand name (top left)", textInput(site.nav.brand, "Annay De", (value) => {
          site.nav.brand = value;
        })),
        field("Brand caption (used in page metadata)", textInput(site.nav.caption, "", (value) => {
          site.nav.caption = value;
        }))
      ])
    );
    const labelDefs = [
      ["home", "Home tab"],
      ["teaching", "Teaching tab"],
      ["cv", "CV tab"],
      ["writings", "Writings tab"],
      ["projects", "Research tab"],
      ["blog", "Blog tab"],
      ["more", "More tab"]
    ];
    for (let i = 0; i < labelDefs.length; i += 2) {
      const pair = labelDefs.slice(i, i + 2).map(([key, label]) =>
        field(label, textInput(site.nav.labels[key], "", (value) => {
          site.nav.labels[key] = value;
        }))
      );
      navCard.appendChild(pair.length === 2 ? fieldRow(pair) : pair[0]);
    }
    panel.appendChild(navCard);

    const cvCard = el("div", { class: "admin-card section-card" });
    cvCard.appendChild(el("h3", { class: "editor-title", text: "CV page" }));
    cvCard.appendChild(
      field("Google Drive embed URL (share the PDF, then use its /preview link)", textInput(site.cv.embedUrl, "https://drive.google.com/file/d/…/preview", (value) => {
        site.cv.embedUrl = value;
      }))
    );
    panel.appendChild(cvCard);

    const footerCard = el("div", { class: "admin-card section-card" });
    footerCard.appendChild(el("h3", { class: "editor-title", text: "Footer" }));
    footerCard.appendChild(
      fieldRow([
        field("Email shown in the footer", textInput(site.footer.email, "", (value) => {
          site.footer.email = value;
        })),
        field("Note after the email", textInput(site.footer.note, "Last updated …", (value) => {
          site.footer.note = value;
        }))
      ])
    );
    site.footer.social.forEach((entry) => {
      footerCard.appendChild(
        field(entry.label + " URL (empty = greyed out)", textInput(entry.url, "https://…", (value) => {
          entry.url = value;
        }))
      );
    });
    panel.appendChild(footerCard);

    panel.appendChild(
      el("div", { class: "admin-actions sticky-actions" }, [
        el("button", {
          class: "btn primary",
          type: "button",
          text: "Save site settings",
          onclick: (event) => commit("site", "Update site settings", event.currentTarget).then(() => {}, () => {})
        })
      ])
    );
  }

  /* ---------- tabs + wiring ---------- */

  document.querySelectorAll(".admin-tabs:not(.sub-tabs) > .admin-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".admin-tabs:not(.sub-tabs) > .admin-tab").forEach((other) => {
        other.classList.toggle("active", other === tab);
        other.setAttribute("aria-selected", String(other === tab));
      });
      document.querySelectorAll(".admin-panel").forEach((panel) => {
        panel.hidden = panel.id !== "panel-" + tab.dataset.tab;
      });
    });
  });

  $("login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const token = $("token-input").value.trim();
    if (!token) return;
    const status = $("login-status");
    const button = $("login-button");
    button.disabled = true;
    status.textContent = "Checking token…";
    try {
      await signIn(token);
      storeToken(token, $("remember-check").checked);
      status.textContent = "";
      showApp();
    } catch (error) {
      status.textContent =
        error.status === 401 ? "GitHub rejected that token. Check that it is current and scoped to this repository." : error.message;
    } finally {
      button.disabled = false;
    }
  });

  $("logout-button").addEventListener("click", () => {
    clearToken();
    window.location.reload();
  });

  const existingToken = storedToken();
  if (existingToken) {
    $("login-status").textContent = "Signing in…";
    signIn(existingToken).then(
      () => showApp(),
      () => {
        clearToken();
        $("login-status").textContent = "";
      }
    );
  }
})();
