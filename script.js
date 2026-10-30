(function () {
  const body = document.body;
  const nav = document.querySelector(".site-nav");
  const navLinks = document.querySelectorAll("[data-nav]");
  const menuToggle = document.querySelector(".menu-toggle");
  const menu = document.querySelector(".nav-links");
  const themeToggle = document.querySelector(".theme-toggle");

  function getTheme() {
    return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  }

  function applyTheme(theme) {
    const isDark = theme === "dark";
    document.documentElement.dataset.theme = isDark ? "dark" : "";
    if (!isDark) document.documentElement.removeAttribute("data-theme");

    if (themeToggle) {
      themeToggle.setAttribute("aria-pressed", String(isDark));
      themeToggle.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
    }
  }

  function setupTheme() {
    applyTheme(getTheme());
    if (!themeToggle) return;

    themeToggle.addEventListener("click", () => {
      const nextTheme = getTheme() === "dark" ? "light" : "dark";
      const commitTheme = () => {
        applyTheme(nextTheme);
        try {
          localStorage.setItem("annay-theme", nextTheme);
        } catch (error) {}
      };

      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (document.startViewTransition && !reducedMotion) {
        const rect = themeToggle.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
        const root = document.documentElement;
        root.style.setProperty("--vt-x", x + "px");
        root.style.setProperty("--vt-y", y + "px");
        root.style.setProperty("--vt-r", radius + "px");
        root.classList.add("theme-vt");
        const transition = document.startViewTransition(commitTheme);
        transition.finished.finally(() => root.classList.remove("theme-vt"));
      } else {
        commitTheme();
      }
      closeMenu();
    });
  }

  function setActiveNav() {
    const page = body.dataset.page;
    navLinks.forEach((link) => {
      link.classList.toggle("active", link.dataset.nav === page);
    });
  }

  function setNavState() {
    if (!nav) return;
    nav.classList.toggle("scrolled", window.scrollY > 8);
    if (body.dataset.page !== "home") {
      nav.classList.add("show-brand");
      return;
    }

    const homeName = document.querySelector(".scholar-copy h1");
    if (!homeName) {
      nav.classList.add("show-brand");
      return;
    }

    const navBottom = nav.getBoundingClientRect().bottom;
    const nameBottom = homeName.getBoundingClientRect().bottom;
    nav.classList.toggle("show-brand", nameBottom <= navBottom + 8);
  }

  function closeMenu() {
    if (!menu || !menuToggle) return;
    menu.classList.remove("open");
    body.classList.remove("menu-open");
    menuToggle.setAttribute("aria-expanded", "false");
  }

  function setupMenu() {
    if (!menu || !menuToggle) return;

    menuToggle.addEventListener("click", () => {
      const isOpen = menu.classList.toggle("open");
      body.classList.toggle("menu-open", isOpen);
      menuToggle.setAttribute("aria-expanded", String(isOpen));
    });

    navLinks.forEach((link) => {
      link.addEventListener("click", closeMenu);
    });

    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeMenu();
    });
  }

  let revealObserver = null;

  function observeReveals(scope) {
    const revealItems = (scope || document).querySelectorAll(".reveal:not(.visible)");
    if (!revealItems.length) return;

    if (!("IntersectionObserver" in window)) {
      revealItems.forEach((item) => item.classList.add("visible"));
      return;
    }

    if (!revealObserver) {
      revealObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add("visible");
              revealObserver.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
      );
    }

    revealItems.forEach((item) => revealObserver.observe(item));
  }

  function setupReveal() {
    observeReveals(document);
  }

  function setupCvFallback() {
    const frame = document.querySelector(".cv-frame");
    const fallback = document.querySelector(".cv-fallback");
    if (!frame || !fallback) return;

    const src = frame.getAttribute("src") || "";
    if (src.includes("FILE_ID")) {
      frame.setAttribute("hidden", "hidden");
      fallback.hidden = false;
    }
  }

  function setupCursorGlow() {
    let frame = 0;
    let nextX = window.innerWidth * 0.45;
    let nextY = window.innerHeight * 0.22;
    const moveGlow = (event) => {
      nextX = event.clientX;
      nextY = event.clientY;
      if (frame) return;

      frame = window.requestAnimationFrame(() => {
        body.style.setProperty("--cursor-x", `${nextX}px`);
        body.style.setProperty("--cursor-y", `${nextY}px`);
        frame = 0;
      });
    };

    window.addEventListener("pointermove", moveGlow, { passive: true });
    window.addEventListener("mousemove", moveGlow, { passive: true });
  }

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function setupStagger() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    document.querySelectorAll(".content-section.reveal").forEach((section) => {
      section.querySelectorAll(".plain-list > article, .clean-list > article, .publication-list > article").forEach((item, index) => {
        item.classList.add("stagger-item");
        item.style.transitionDelay = Math.min(index * 70, 420) + "ms";
      });
    });
  }

  function hydrateEndeavours() {
    if (body.dataset.page !== "home") return;
    const flow = document.querySelector(".endeavour-flow");
    if (!flow) return;

    fetch("data/endeavours.json", { cache: "no-cache" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!data || !Array.isArray(data.items) || !data.items.length) return;
        flow.innerHTML = data.items.map((item) => "<p>" + formatInline(item) + "</p>").join("");
      })
      .catch(() => {});
  }

  /* Inline formatting for JSON-driven text: **bold**, *italic*, and
     [label](url) links (http/https/mailto). Works in every text field, so
     any phrase anywhere can be linked, including two links in one line.
     Input is escaped before any markup is applied. */
  function formatInline(text) {
    return escapeHtml(text)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)/g, function (match, label, url) {
        const newTab = /^https?:/.test(url) ? ' target="_blank" rel="noreferrer"' : "";
        return '<a href="' + url + '"' + newTab + ">" + label + "</a>";
      });
  }

  /* Button-style links. Any entry without a URL is dropped entirely, so
     nothing shows unless a real link was provided. */
  function renderLinks(links) {
    const row = (links || [])
      .filter((link) => link && link.url)
      .map((link) => {
        const external = /^https?:/.test(link.url);
        return (
          '<a class="action-link" href="' + escapeHtml(link.url) + '"' +
          (external ? ' target="_blank" rel="noreferrer"' : "") + ">" +
          escapeHtml(link.label) +
          (external ? '<span class="ext" aria-hidden="true">&#8599;</span>' : "") +
          "</a>"
        );
      })
      .join("");
    return row ? '<div class="link-row">' + row + "</div>" : "";
  }

  function renderPageItem(item) {
    const paragraphs = String(item.text || "")
      .split(/\n\s*\n/)
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => "<p>" + formatInline(part) + "</p>")
      .join("");
    return (
      '<article class="publication-item">' +
      (item.kicker ? '<div class="publication-meta">' + formatInline(item.kicker) + "</div>" : "") +
      "<h3>" + formatInline(item.title || "") + "</h3>" +
      paragraphs +
      (item.meta ? '<div class="list-meta">' + formatInline(item.meta) + "</div>" : "") +
      renderLinks(item.links) +
      "</article>"
    );
  }

  function hydratePages() {
    const page = body.dataset.page;
    if (!["projects", "teaching", "writings", "more"].includes(page)) return;
    const root = document.getElementById("page-sections");
    if (!root) return;

    fetch("data/pages.json", { cache: "no-cache" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        const doc = data && data[page];
        if (!doc || !Array.isArray(doc.sections) || !doc.sections.length) return;

        const headingEl = document.querySelector(".page-heading h1");
        if (headingEl && doc.title) headingEl.textContent = doc.title;

        root.innerHTML = doc.sections
          .map(
            (section) =>
              '<section class="content-section reveal">' +
              '<h2 class="section-title">' + formatInline(section.title || "") + "</h2>" +
              '<div class="plain-list">' + (section.items || []).map(renderPageItem).join("") + "</div>" +
              "</section>"
          )
          .join("");
        observeReveals(root);
      })
      .catch(() => {});
  }

  function hydrateSite() {
    const page = body.dataset.page;
    if (page === "admin") return;

    fetch("data/site.json", { cache: "no-cache" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!data) return;

        if (data.nav) {
          const brandEl = document.querySelector(".nav-name");
          const captionEl = document.querySelector(".nav-caption");
          if (brandEl && data.nav.brand) brandEl.textContent = data.nav.brand;
          if (captionEl && data.nav.caption) captionEl.textContent = data.nav.caption;
          if (data.nav.labels) {
            document.querySelectorAll("[data-nav]").forEach((link) => {
              const label = data.nav.labels[link.dataset.nav];
              const span = link.querySelector("span");
              if (label && span) span.textContent = label;
            });
          }
        }

        if (data.footer) {
          const linksEl = document.querySelector(".footer-links");
          if (linksEl && Array.isArray(data.footer.social)) {
            linksEl.innerHTML = data.footer.social
              .map((entry) => {
                const label = escapeHtml(entry.label);
                return entry.url
                  ? '<a href="' + escapeHtml(entry.url) + '" target="_blank" rel="noreferrer" aria-label="' + label + '">' + label + "</a>"
                  : '<span class="disabled" aria-label="' + label + '">' + label + "</span>";
              })
              .join("");
          }
          const bottomEl = document.querySelector(".footer-bottom");
          if (bottomEl && data.footer.email) {
            const emails = String(data.footer.email)
              .split(/\s*[●•|,]\s*/)
              .map((entry) => entry.trim())
              .filter(Boolean);
            const emailHtml = emails
              .map((entry) => '<strong class="footer-email">' + escapeHtml(entry) + "</strong>")
              .join(' <span class="footer-sep" aria-hidden="true">●</span> ');
            bottomEl.innerHTML = emailHtml + (data.footer.note ? " - " + formatInline(data.footer.note) : "");
            setupEmailCopy();
          }
        }

        if (data.theme) {
          const validHex = (value) => (/^#[0-9a-fA-F]{6}$/.test(value || "") ? value : null);
          const headingLight = validHex(data.theme.headingLight);
          const headingDark = validHex(data.theme.headingDark);
          if (headingLight || headingDark) {
            const style = document.createElement("style");
            style.textContent =
              (headingLight ? ":root{--heading:" + headingLight + ";}" : "") +
              (headingDark ? 'html[data-theme="dark"]{--heading:' + headingDark + ";}" : "");
            document.head.appendChild(style);
          }
        }

        if (page === "home" && data.home) {
          const home = data.home;
          const copyEl = document.querySelector(".scholar-copy");
          if (copyEl) {
            const roles = (home.roles || [])
              .map((role, index) => {
                const linked = role.url
                  ? '<a href="' + escapeHtml(role.url) + '" target="_blank" rel="noreferrer">' + formatInline(role.text) + "</a>"
                  : formatInline(role.text || "");
                return '<p class="name-line' + (index > 0 ? " secondary" : "") + '">' + formatInline(role.prefix || "") + linked + "</p>";
              })
              .join("");
            const bio = (home.bio || []).map((part) => "<p>" + formatInline(part) + "</p>").join("");
            copyEl.innerHTML = "<h1>" + formatInline(home.heading || "") + "</h1>" + roles + bio;
          }
          if (home.portrait) {
            const img = document.querySelector(".portrait-card img");
            if (img && home.portrait.src) {
              img.src = home.portrait.src;
              if (home.portrait.alt) img.alt = home.portrait.alt;
            }
            const caption = document.querySelector(".portrait-card figcaption");
            if (caption && home.portrait.caption) {
              const captionUrl = home.portrait.captionUrl || "";
              const newTab = /^https?:/.test(captionUrl) ? ' target="_blank" rel="noreferrer"' : "";
              caption.innerHTML = captionUrl
                ? '<a href="' + escapeHtml(captionUrl) + '"' + newTab + ">" + escapeHtml(home.portrait.caption) + "</a>"
                : escapeHtml(home.portrait.caption);
            }
          }
          const workHeading = document.getElementById("current-work-heading");
          if (workHeading && home.endeavoursTitle) workHeading.textContent = home.endeavoursTitle;
        }

        if (page === "cv" && data.cv && data.cv.embedUrl) {
          const frame = document.querySelector(".cv-frame");
          if (frame && frame.getAttribute("src") !== data.cv.embedUrl) {
            frame.setAttribute("src", data.cv.embedUrl);
          }
        }
      })
      .catch(() => {});
  }

  function setupEmailCopy() {
    if (!navigator.clipboard) return;

    const targets = document.querySelectorAll(".footer-email:not(.copyable), .footer-bottom > strong:not(.footer-email):not(.copyable)");
    targets.forEach((emailEl) => {
      emailEl.classList.add("copyable");
      emailEl.setAttribute("role", "button");
      emailEl.setAttribute("tabindex", "0");
      emailEl.setAttribute("aria-label", "Copy " + emailEl.textContent.trim());

      let timer = 0;
      const copy = () => {
        navigator.clipboard
          .writeText(emailEl.textContent.trim())
          .then(() => {
            emailEl.classList.add("copied");
            window.clearTimeout(timer);
            timer = window.setTimeout(() => emailEl.classList.remove("copied"), 1600);
          })
          .catch(() => {});
      };

      emailEl.addEventListener("click", copy);
      emailEl.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          copy();
        }
      });
    });
  }

  setActiveNav();
  setupTheme();
  setupMenu();
  setupStagger();
  setupReveal();
  setupCvFallback();
  setupCursorGlow();
  hydrateEndeavours();
  hydratePages();
  hydrateSite();
  setupEmailCopy();
  setNavState();
  window.addEventListener("scroll", setNavState, { passive: true });
})();
