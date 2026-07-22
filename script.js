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
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) return;

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
        flow.innerHTML = data.items.map((item) => "<p>" + escapeHtml(item) + "</p>").join("");
      })
      .catch(() => {});
  }

  function hydrateProjects() {
    if (body.dataset.page !== "projects") return;
    const root = document.getElementById("projects-root");
    if (!root) return;

    fetch("data/projects.json", { cache: "no-cache" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!data || !Array.isArray(data.sections) || !data.sections.length) return;
        root.innerHTML = data.sections
          .map((section) => {
            const items = (section.items || [])
              .map((item) => {
                const links = (item.links || [])
                  .map(
                    (link) =>
                      '<a class="action-link" href="' + escapeHtml(link.url) + '" target="_blank" rel="noreferrer">' +
                      escapeHtml(link.label) +
                      '<span class="ext" aria-hidden="true">&#8599;</span></a>'
                  )
                  .join("");
                return (
                  '<article class="project-card">' +
                  (item.kicker ? '<div class="project-kicker">' + escapeHtml(item.kicker) + "</div>" : "") +
                  "<h3>" + escapeHtml(item.title) + "</h3>" +
                  (item.description ? "<p>" + escapeHtml(item.description) + "</p>" : "") +
                  (links ? '<div class="link-row">' + links + "</div>" : "") +
                  "</article>"
                );
              })
              .join("");
            return (
              '<section' + (section.id ? ' id="' + escapeHtml(section.id) + '"' : "") + ' class="content-section reveal">' +
              '<h2 class="section-title">' + escapeHtml(section.title) + "</h2>" +
              '<div class="plain-list">' + items + "</div>" +
              "</section>"
            );
          })
          .join("");
        observeReveals(root);
      })
      .catch(() => {});
  }

  function setupEmailCopy() {
    const emailEl = document.querySelector(".footer-bottom strong");
    if (!emailEl || !navigator.clipboard) return;

    emailEl.classList.add("copyable");
    emailEl.setAttribute("role", "button");
    emailEl.setAttribute("tabindex", "0");
    emailEl.setAttribute("aria-label", "Copy email address");

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
  }

  setActiveNav();
  setupTheme();
  setupMenu();
  setupStagger();
  setupReveal();
  setupCvFallback();
  setupCursorGlow();
  hydrateEndeavours();
  hydrateProjects();
  setupEmailCopy();
  setNavState();
  window.addEventListener("scroll", setNavState, { passive: true });
})();
