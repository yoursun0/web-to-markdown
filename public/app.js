(() => {
  const form = document.getElementById("convert-form");
  const input = document.getElementById("url-input");
  const btn = document.getElementById("convert-btn");
  const statusEl = document.getElementById("status");
  const preview = document.getElementById("preview");
  const markdownEl = document.getElementById("markdown");
  const downloadBtn = document.getElementById("download-btn");

  let lastMarkdown = "";
  let lastTitle = "page";

  function setStatus(message, isError = false) {
    if (!message) {
      statusEl.hidden = true;
      statusEl.textContent = "";
      statusEl.classList.remove("error");
      return;
    }
    statusEl.hidden = false;
    statusEl.textContent = message;
    statusEl.classList.toggle("error", isError);
  }

  function setLoading(loading) {
    btn.disabled = loading;
    btn.textContent = loading ? "Converting…" : "Convert";
    input.disabled = loading;
  }

  function slugify(title) {
    return (
      String(title || "page")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60) || "page"
    );
  }

  function renderResult({ title, markdown }) {
    lastMarkdown = markdown;
    lastTitle = title || "page";
    markdownEl.textContent = markdown;
    downloadBtn.disabled = !markdown;

    if (typeof marked !== "undefined") {
      preview.innerHTML = marked.parse(markdown, { breaks: false });
    } else {
      preview.textContent = markdown;
    }
  }

  downloadBtn.addEventListener("click", () => {
    if (!lastMarkdown) return;
    const blob = new Blob([lastMarkdown], { type: "text/markdown;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${slugify(lastTitle)}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const url = input.value.trim();
    if (!url) return;

    setLoading(true);
    setStatus("Fetching and converting…");
    downloadBtn.disabled = true;

    try {
      const res = await fetch("/api/convert", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      renderResult(data);
      setStatus(`Converted: ${data.title || data.sourceUrl}`);
    } catch (err) {
      setStatus(err.message || "Conversion failed", true);
    } finally {
      setLoading(false);
    }
  });
})();
