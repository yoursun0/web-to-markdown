# Web to Markdown

Paste a URL, get clean Markdown.

Minimal Cloudflare Pages app: static UI + `POST /api/convert` Pages Function. Fetches a public HTML page, extracts the main article with Readability, and converts it to Markdown.

## Features

- `POST /api/convert` with `{ "url": "https://..." }` → `{ "title", "markdown", "sourceUrl" }`
- Light SaaS UI: URL input, Convert, Preview + Markdown panels, Download `.md`
- http(s) only, ~15s fetch timeout, ~2 MB size cap, scripts/styles stripped
- No auth, no history

Out of scope: PDF, SPA/JS-rendered apps, batch convert.

## Quick start (local)

```bash
bun install          # or: npm install
bun test             # fixture unit tests
bun run dev          # wrangler pages dev → http://localhost:8788
```

Open the UI, paste a public article URL, click **Convert**.

## API

```bash
curl -s -X POST http://localhost:8788/api/convert \
  -H 'content-type: application/json' \
  -d '{"url":"https://example.com"}'
```

Success:

```json
{
  "title": "...",
  "markdown": "# ...\n\n...",
  "sourceUrl": "https://example.com"
}
```

Error (JSON): `{ "error": "...", "code": "..." }` with appropriate HTTP status.

## Deploy (Cloudflare Pages)

1. Connect this repo in the [Cloudflare dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → **Create** → **Pages** → connect Git, **or** deploy from CLI:

   ```bash
   npx wrangler pages deploy public --project-name=web-to-markdown
   ```

2. Build settings (if using Git integration):
   - **Build command:** (none / empty — static `public/`)
   - **Build output directory:** `public`
   - **Root directory:** `/` (repo root)
   - Pages Functions are picked up automatically from `functions/` (including `functions/api/convert.ts`)

3. Compatibility: `wrangler.toml` sets `pages_build_output_dir = "public"` and a recent `compatibility_date`.

Dependencies (`@mozilla/readability`, `linkedom`, `turndown`) are bundled by Wrangler for the Function; keep `package.json` at the repo root so Pages can install and bundle them.

## Tests

Fixture-based unit test (no live network):

```bash
bun test
```

Covers URL validation and HTML → Markdown extraction using `fixtures/sample-article.html`.

## Project layout

```
public/                 # static UI (Pages assets)
  index.html
  styles.css
  app.js
functions/api/convert.ts  # POST /api/convert
src/convert.ts          # shared extraction (Readability + Turndown)
fixtures/               # sample HTML for tests
test/convert.test.ts
wrangler.toml
```

## Stack

- Cloudflare Pages + Pages Functions (Workers runtime)
- `@mozilla/readability` + `linkedom` + `turndown`
- Frontend: vanilla HTML/CSS/JS + `marked` (CDN) for Preview
