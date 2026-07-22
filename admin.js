(function () {
  const REPO_OWNER = "annay-de";
  const REPO_NAME = "annay.de";
  const API_ROOT = "https://api.github.com";
  const TOKEN_KEY = "annay-admin-token";

  const FILES = {
    posts: "data/posts.json",
    projects: "data/projects.json",
    endeavours: "data/endeavours.json"
  };

  const state = {
    token: null,
    branch: null,
    user: null,
    data: { posts: null, projects: null, endeavours: null },
    shas: {},
    editingSlug: null
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
      .replace(/[^a-z0-9]+/g, "-")
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
        state.data[key] = key === "posts" ? { posts: [] } : key === "projects" ? { sections: [] } : { items: [] };
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
    await Promise.all([loadFile("posts"), loadFile("projects"), loadFile("endeavours")]);
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
    renderProjectsPanel();
    renderEndeavoursPanel();
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
                  state.data.posts.posts = state.data.posts.posts.filter((entry) => entry.slug !== post.slug);
                  try {
                    await commit("posts", "Delete blog post: " + post.title, event.currentTarget);
                    renderPostsPanel();
                  } catch (error) {
                    state.data.posts.posts = posts;
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
    state.editingSlug = slug;
    const slot = $("post-editor-slot");
    slot.innerHTML = "";
    const existing = slug ? state.data.posts.posts.find((post) => post.slug === slug) : null;

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

  function field(labelText, input) {
    return el("label", { class: "field" }, [el("span", { class: "field-label", text: labelText }), input]);
  }

  function fieldRow(fields) {
    return el("div", { class: "field-row" }, fields);
  }

  /* ---------- projects panel ---------- */

  function renderProjectsPanel() {
    const panel = $("panel-projects");
    panel.innerHTML = "";
    const sections = state.data.projects.sections;

    panel.appendChild(
      el("p", {
        class: "panel-hint",
        text: "Everything below renders on the Research page in this order. Links use one “Label | https://url” per line."
      })
    );

    sections.forEach((section, sectionIndex) => {
      const card = el("div", { class: "admin-card section-card" });
      const titleInput = el("input", { type: "text", value: section.title || "" });
      titleInput.addEventListener("input", () => {
        section.title = titleInput.value;
      });
      card.appendChild(field("Section title", titleInput));

      section.items.forEach((item, itemIndex) => {
        card.appendChild(projectItemEditor(section, item, itemIndex));
      });

      card.appendChild(
        el("div", { class: "admin-actions" }, [
          el("button", {
            class: "btn ghost",
            type: "button",
            text: "Add project",
            onclick: () => {
              section.items.push({ kicker: "", title: "", description: "", links: [] });
              renderProjectsPanel();
            }
          }),
          el("button", {
            class: "btn ghost danger",
            type: "button",
            text: "Remove section",
            onclick: () => {
              if (!window.confirm('Remove the whole "' + (section.title || "untitled") + '" section? Remember to save after.')) return;
              sections.splice(sectionIndex, 1);
              renderProjectsPanel();
            }
          })
        ])
      );
      panel.appendChild(card);
    });

    const saveButton = el("button", {
      class: "btn primary",
      type: "button",
      text: "Save research page",
      onclick: (event) => commit("projects", "Update research projects", event.currentTarget).then(() => {}, () => {})
    });

    panel.appendChild(
      el("div", { class: "admin-actions sticky-actions" }, [
        saveButton,
        el("button", {
          class: "btn ghost",
          type: "button",
          text: "Add section",
          onclick: () => {
            sections.push({ id: "section-" + (sections.length + 1), title: "", items: [] });
            renderProjectsPanel();
          }
        })
      ])
    );
  }

  function projectItemEditor(section, item, itemIndex) {
    const kickerInput = el("input", { type: "text", value: item.kicker || "", placeholder: "Kicker, e.g. “With … · 2025”" });
    const titleInput = el("input", { type: "text", value: item.title || "", placeholder: "Project title" });
    const descriptionInput = el("textarea", { rows: "4", placeholder: "Project description" });
    descriptionInput.value = item.description || "";
    const linksInput = el("textarea", { rows: "2", class: "mono", placeholder: "Website | https://example.com" });
    linksInput.value = (item.links || []).map((link) => link.label + " | " + link.url).join("\n");

    kickerInput.addEventListener("input", () => (item.kicker = kickerInput.value));
    titleInput.addEventListener("input", () => (item.title = titleInput.value));
    descriptionInput.addEventListener("input", () => (item.description = descriptionInput.value));
    linksInput.addEventListener("input", () => {
      item.links = linksInput.value
        .split("\n")
        .map((line) => {
          const split = line.split("|");
          if (split.length < 2) return null;
          const label = split[0].trim();
          const url = split.slice(1).join("|").trim();
          return label && url ? { label: label, url: url } : null;
        })
        .filter(Boolean);
    });

    return el("div", { class: "admin-subcard" }, [
      el("div", { class: "subcard-head" }, [
        el("span", { class: "publication-meta", text: "Project " + (itemIndex + 1) }),
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
                  renderProjectsPanel();
                }
              })
            : null,
          el("button", {
            class: "btn ghost danger",
            type: "button",
            text: "Remove",
            onclick: () => {
              section.items.splice(itemIndex, 1);
              renderProjectsPanel();
            }
          })
        ])
      ]),
      field("Kicker", kickerInput),
      field("Title", titleInput),
      field("Description", descriptionInput),
      field("Links (Label | URL, one per line)", linksInput)
    ]);
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

  /* ---------- tabs + wiring ---------- */

  document.querySelectorAll(".admin-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".admin-tab").forEach((other) => {
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
