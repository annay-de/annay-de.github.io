/* Minimal, safe markdown renderer shared by the blog and the admin preview.
   All raw text is HTML-escaped before any markup is applied. */
(function () {
  function escapeHtml(text) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderInline(text) {
    return text
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, function (match, label, url) {
        return '<a href="' + url + '" target="_blank" rel="noreferrer">' + label + "</a>";
      });
  }

  function renderMarkdown(source) {
    const lines = escapeHtml(String(source || "")).replace(/\r\n/g, "\n").split("\n");
    const html = [];
    let list = null;
    let quote = [];
    let code = null;

    function closeList() {
      if (!list) return;
      html.push("<" + list.tag + ">" + list.items.map((item) => "<li>" + renderInline(item) + "</li>").join("") + "</" + list.tag + ">");
      list = null;
    }

    function closeQuote() {
      if (!quote.length) return;
      html.push("<blockquote><p>" + quote.map(renderInline).join("<br>") + "</p></blockquote>");
      quote = [];
    }

    lines.forEach((line) => {
      if (code !== null) {
        if (/^```/.test(line)) {
          html.push("<pre><code>" + code.join("\n") + "</code></pre>");
          code = null;
        } else {
          code.push(line);
        }
        return;
      }

      if (/^```/.test(line)) {
        closeList();
        closeQuote();
        code = [];
        return;
      }

      const heading = line.match(/^(#{1,4})\s+(.*)$/);
      if (heading) {
        closeList();
        closeQuote();
        const level = Math.min(heading[1].length + 1, 4);
        html.push("<h" + level + ">" + renderInline(heading[2]) + "</h" + level + ">");
        return;
      }

      if (/^(---|\*\*\*)\s*$/.test(line)) {
        closeList();
        closeQuote();
        html.push("<hr>");
        return;
      }

      const quoted = line.match(/^&gt;\s?(.*)$/);
      if (quoted) {
        closeList();
        quote.push(quoted[1]);
        return;
      }

      const bullet = line.match(/^[-*]\s+(.*)$/);
      const numbered = line.match(/^\d+\.\s+(.*)$/);
      if (bullet || numbered) {
        closeQuote();
        const tag = bullet ? "ul" : "ol";
        if (!list || list.tag !== tag) {
          closeList();
          list = { tag: tag, items: [] };
        }
        list.items.push((bullet || numbered)[1]);
        return;
      }

      if (!line.trim()) {
        closeList();
        closeQuote();
        return;
      }

      closeList();
      closeQuote();
      html.push("<p>" + renderInline(line) + "</p>");
    });

    if (code !== null) html.push("<pre><code>" + code.join("\n") + "</code></pre>");
    closeList();
    closeQuote();
    return html.join("\n");
  }

  window.renderMarkdown = renderMarkdown;
})();
