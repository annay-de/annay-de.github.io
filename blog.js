(function () {
  const indexEl = document.getElementById("blog-index");
  const postEl = document.getElementById("blog-post");
  const headingEl = document.getElementById("blog-heading");
  if (!indexEl || !postEl) return;

  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function formatDate(iso) {
    const parts = String(iso || "").split("-");
    if (parts.length < 3) return iso || "";
    const month = MONTHS[Number(parts[1]) - 1] || "";
    return month + " " + Number(parts[2]) + ", " + parts[0];
  }

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function sortedPosts(posts) {
    return posts.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }

  function renderIndex(posts) {
    if (!posts.length) {
      indexEl.innerHTML = '<p class="blog-status">Nothing here yet. First post coming soon.</p>';
      return;
    }

    const groups = new Map();
    sortedPosts(posts).forEach((post) => {
      const year = String(post.date || "").slice(0, 4) || "Undated";
      if (!groups.has(year)) groups.set(year, []);
      groups.get(year).push(post);
    });

    const html = [];
    groups.forEach((groupPosts, year) => {
      html.push('<section class="year-group"><h3>' + escapeHtml(year) + "</h3>");
      groupPosts.forEach((post) => {
        const tags = (post.tags || [])
          .map((tag) => '<span class="tag">' + escapeHtml(tag) + "</span>")
          .join("");
        html.push(
          '<a class="blog-entry" href="blog.html?post=' + encodeURIComponent(post.slug) + '">' +
            '<time datetime="' + escapeHtml(post.date) + '">' + escapeHtml(formatDate(post.date)) + "</time>" +
            "<div>" +
              "<h3>" + escapeHtml(post.title) + '<span class="entry-arrow" aria-hidden="true">&rarr;</span></h3>' +
              (post.summary ? "<p>" + escapeHtml(post.summary) + "</p>" : "") +
              (tags ? '<div class="tag-grid">' + tags + "</div>" : "") +
            "</div>" +
          "</a>"
        );
      });
      html.push("</section>");
    });

    indexEl.innerHTML = html.join("");
  }

  function renderPost(post) {
    document.title = post.title + " | Annay's Blog | Annay De";
    headingEl.hidden = true;
    indexEl.hidden = true;
    postEl.hidden = false;

    const meta = [formatDate(post.date)].concat(post.tags || []).filter(Boolean);
    document.getElementById("post-meta").textContent = meta.join(" · ");
    document.getElementById("post-title").textContent = post.title;
    document.getElementById("post-body").innerHTML = window.renderMarkdown(post.content);
    postEl.classList.add("reveal", "visible");
    setupReadingProgress();
  }

  function setupReadingProgress() {
    const progress = document.querySelector(".read-progress");
    if (!progress) return;
    const bar = progress.querySelector("span");
    progress.classList.add("active");

    let frame = 0;
    function update() {
      frame = 0;
      const doc = document.documentElement;
      const total = doc.scrollHeight - window.innerHeight;
      const ratio = total > 0 ? Math.min(1, Math.max(0, window.scrollY / total)) : 0;
      bar.style.transform = "scaleX(" + ratio + ")";
    }

    window.addEventListener(
      "scroll",
      () => {
        if (!frame) frame = window.requestAnimationFrame(update);
      },
      { passive: true }
    );
    update();
  }

  fetch("data/posts.json", { cache: "no-cache" })
    .then((response) => {
      if (!response.ok) throw new Error("HTTP " + response.status);
      return response.json();
    })
    .then((data) => {
      const posts = Array.isArray(data.posts) ? data.posts : [];
      const slug = new URLSearchParams(window.location.search).get("post");
      const post = slug ? posts.find((entry) => entry.slug === slug) : null;

      if (slug && post) {
        renderPost(post);
      } else if (slug) {
        indexEl.innerHTML = '<p class="blog-status">That post could not be found. <a class="text-link" href="blog.html">See all posts</a></p>';
      } else {
        renderIndex(posts);
      }
    })
    .catch(() => {
      indexEl.innerHTML = '<p class="blog-status">Posts could not be loaded right now. Please try again shortly.</p>';
    });
})();
