import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { htmlToMarkdown, validateUrl } from "../src/convert";

const fixture = readFileSync(
  join(import.meta.dir, "../fixtures/sample-article.html"),
  "utf8",
);

describe("validateUrl", () => {
  test("accepts https URLs", () => {
    const r = validateUrl("https://example.com/a");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.url.href).toBe("https://example.com/a");
  });

  test("rejects non-http(s)", () => {
    const r = validateUrl("ftp://example.com/a");
    expect(r.ok).toBe(false);
  });

  test("rejects empty", () => {
    expect(validateUrl("").ok).toBe(false);
    expect(validateUrl(null).ok).toBe(false);
  });
});

describe("htmlToMarkdown (fixture)", () => {
  test("extracts title and markdown from sample HTML", () => {
    const result = htmlToMarkdown(fixture, "https://example.com/widgets");

    expect(result.sourceUrl).toBe("https://example.com/widgets");
    expect(result.title).toContain("Widgets");
    expect(result.markdown).toContain("Sample Article About Widgets");
    expect(result.markdown).toContain("Key points");
    expect(result.markdown).toMatch(/Strip scripts and styles/);
    expect(result.markdown).toContain("official docs");
    expect(result.markdown).toContain("https://example.com/docs");
    // scripts should not leak as content
    expect(result.markdown).not.toContain("alert(");
    expect(result.markdown).not.toContain("color: red");
    // emphasis / structure survived
    expect(result.markdown.toLowerCase()).toMatch(/\*\*emphasis\*\*|\*\*emphasis\*\*/);
  });

  test("produces non-empty markdown with headings", () => {
    const { markdown } = htmlToMarkdown(fixture, "https://example.com/widgets");
    expect(markdown.length).toBeGreaterThan(80);
    expect(markdown).toMatch(/^#\s+/m);
  });
});
