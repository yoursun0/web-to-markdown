import {
  validateUrl,
  htmlToMarkdown,
  MAX_HTML_BYTES,
  FETCH_TIMEOUT_MS,
  type ConvertError,
} from "../../src/convert";

type Env = Record<string, never>;

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type",
    },
  });

const err = (message: string, status: number, code?: string): Response =>
  json({ error: message, ...(code ? { code } : {}) } satisfies ConvertError, status);

export const onRequestOptions: PagesFunction<Env> = async () =>
  new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type",
    },
  });

export const onRequestPost: PagesFunction<Env> = async (context) => {
  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return err("Request body must be JSON", 400, "bad_json");
  }

  const urlField =
    body && typeof body === "object" && "url" in body
      ? (body as { url: unknown }).url
      : undefined;

  const validated = validateUrl(urlField);
  if (!validated.ok) {
    return err(validated.error, 400, "invalid_url");
  }

  const { url } = validated;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent":
          "WebToMarkdown/0.1 (+https://github.com/yoursun0/web-to-markdown)",
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
      },
    });
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return err(
      aborted ? "Fetch timed out (15s limit)" : "Failed to fetch URL",
      aborted ? 504 : 502,
      aborted ? "timeout" : "fetch_failed",
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    return err(`Upstream returned HTTP ${response.status}`, 502, "upstream_error");
  }

  const contentType = response.headers.get("content-type") || "";
  if (
    contentType &&
    !/text\/html|application\/xhtml\+xml|text\/plain/i.test(contentType)
  ) {
    return err("URL did not return HTML content", 415, "unsupported_type");
  }

  const contentLength = response.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_HTML_BYTES) {
    return err("Page exceeds size limit (2 MB)", 413, "too_large");
  }

  const buf = await response.arrayBuffer();
  if (buf.byteLength > MAX_HTML_BYTES) {
    return err("Page exceeds size limit (2 MB)", 413, "too_large");
  }

  const html = new TextDecoder("utf-8").decode(buf);

  try {
    const result = htmlToMarkdown(html, url.toString());
    if (!result.markdown.trim()) {
      return err("Could not extract readable content", 422, "empty_content");
    }
    return json(result);
  } catch (e) {
    console.error("convert error", e);
    return err("Conversion failed", 500, "convert_failed");
  }
};

// Method guard for non-POST
export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === "OPTIONS") {
    return onRequestOptions(context);
  }
  if (context.request.method === "POST") {
    return onRequestPost(context);
  }
  return err("Method not allowed", 405, "method_not_allowed");
};
