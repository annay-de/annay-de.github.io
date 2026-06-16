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
      applyTheme(nextTheme);
      try {
        localStorage.setItem("annay-theme", nextTheme);
      } catch (error) {}
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

  function setupReveal() {
    const revealItems = document.querySelectorAll(".reveal");
    if (!revealItems.length) return;

    if (!("IntersectionObserver" in window)) {
      revealItems.forEach((item) => item.classList.add("visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );

    revealItems.forEach((item) => observer.observe(item));
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
    const supportsFinePointer = window.matchMedia("(pointer: fine)").matches;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!supportsFinePointer || reducedMotion) return;

    let frame = 0;
    let nextX = window.innerWidth * 0.45;
    let nextY = window.innerHeight * 0.22;

    window.addEventListener(
      "pointermove",
      (event) => {
        nextX = event.clientX;
        nextY = event.clientY;
        if (frame) return;

        frame = window.requestAnimationFrame(() => {
          body.style.setProperty("--cursor-x", `${nextX}px`);
          body.style.setProperty("--cursor-y", `${nextY}px`);
          frame = 0;
        });
      },
      { passive: true }
    );
  }

  setActiveNav();
  setupTheme();
  setupMenu();
  setupReveal();
  setupCvFallback();
  setupCursorGlow();
  setNavState();
  window.addEventListener("scroll", setNavState, { passive: true });
})();
