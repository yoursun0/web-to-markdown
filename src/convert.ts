/**
 * Shared HTML → Markdown conversion (Workers-safe).
 * Uses linkedom + @mozilla/readability + turndown.
 *
 * Important: pass DOM nodes into Turndown (not HTML strings). The browser
 * Turndown build calls `document` when parsing strings, which does not exist
 * on the Workers runtime.
 */
import { parseHTML } from "linkedom";
import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";

export const MAX_HTML_BYTES = 2_000_000; // ~2 MB
export const FETCH_TIMEOUT_MS = 15_000;

export type ConvertResult = {
  title: string;
  markdown: string;
  sourceUrl: string;
};

export type ConvertError = {
  error: string;
  code?: string;
};

/** Validate and normalize a user-supplied URL (http/https only). */
export function validateUrl(
  raw: unknown,
): { ok: true; url: URL } | { ok: false; error: string } {
  if (typeof raw !== "string" || !raw.trim()) {
    return { ok: false, error: "Missing or empty url" };
  }
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, error: "Invalid URL" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "Only http and https URLs are allowed" };
  }
  return { ok: true, url };
}

/** Strip script/style/noscript tags before parsing. */
function stripDangerous(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, "");
}

function createTurndown(): TurndownService {
  const turndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
  });

  turndown.addRule("removeEmptyLinks", {
    filter: (node) =>
      node.nodeName === "A" && !(node as HTMLElement).textContent?.trim(),
    replacement: () => "",
  });

  return turndown;
}

/**
 * Convert raw HTML document string into clean Markdown.
 * `sourceUrl` is used as the base for relative links and as the article URL for Readability.
 */
export function htmlToMarkdown(html: string, sourceUrl: string): ConvertResult {
  const cleaned = stripDangerous(html);
  const { document } = parseHTML(cleaned);

  // Ensure a base URI so relative links resolve when possible
  try {
    const base = document.createElement("base");
    base.setAttribute("href", sourceUrl);
    const head = document.querySelector("head");
    if (head) head.insertBefore(base, head.firstChild);
    else {
      const h = document.createElement("head");
      h.appendChild(base);
      document.documentElement.insertBefore(h, document.documentElement.firstChild);
    }
  } catch {
    // ignore base injection failures
  }

  // Readability expects a Document-like object
  const docForReadability = document as unknown as Document;
  try {
    Object.defineProperty(docForReadability, "documentURI", {
      value: sourceUrl,
      configurable: true,
    });
  } catch {
    // ignore
  }

  const reader = new Readability(docForReadability, { charThreshold: 80 });
  const article = reader.parse();

  const title =
    article?.title?.trim() ||
    document.querySelector("title")?.textContent?.trim() ||
    "Untitled";

  const contentHtml =
    article?.content ||
    document.querySelector("article")?.innerHTML ||
    document.querySelector("main")?.innerHTML ||
    document.body?.innerHTML ||
    "";

  // Re-parse article HTML with linkedom and pass a Node to Turndown
  // (avoids Turndown's string path that requires global `document`)
  const { document: contentDoc } = parseHTML(
    `<!DOCTYPE html><html><body>${contentHtml}</body></html>`,
  );
  const root = contentDoc.body;

  const turndown = createTurndown();
  let markdown = root ? turndown.turndown(root as never).trim() : "";

  // Prepend title as H1 if not already present
  if (markdown && !/^#\s+/m.test(markdown.slice(0, 80))) {
    markdown = `# ${title}\n\n${markdown}`;
  } else if (!markdown) {
    markdown = `# ${title}`;
  }

  return { title, markdown, sourceUrl };
}
