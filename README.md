# sharp-resizer-server

[![CI](https://github.com/scaccogatto/sharp-resizer-server/actions/workflows/ci.yml/badge.svg)](https://github.com/scaccogatto/sharp-resizer-server/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node ≥20](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](package.json)

Watch a directory tree of source images and automatically produce responsive,
srcset-ready resized copies — then serve them (and a JSON manifest) over HTTP.

## How it works

```
input/
  100/  ← drop images here; they're resized to every folder ≤ 100
    hero.jpg
  72/
  37/
  26/
  16/

output/           ← generated automatically
  100/hero.jpg    (1920 px wide by default)
  72/hero.jpg     (1382 px)
  37/hero.jpg     (710 px)
  26/hero.jpg     (499 px)
  16/hero.jpg     (307 px)
```

1. Folder names are **numbers** — they act as breakpoint labels (e.g., `100` for desktop, `16` for small mobile).
2. The server derives pixel widths as `folder × multiplier` (default multiplier = `1920 / 100 = 19.2`).
3. Placing an image in `input/N/` resizes it into every folder `M ≤ N` (i.e., it won't upscale by default).
4. `GET /images/json` returns a srcset-ready JSON manifest — see [Output format](#output-format).

## Prerequisites

| Requirement | Version |
|---|---|
| Node.js | ≥ 20 |
| libvips | bundled via `sharp` prebuilt — no extra install needed on Linux/macOS/Windows |

## Install and run

```bash
git clone https://github.com/scaccogatto/sharp-resizer-server.git
cd sharp-resizer-server
npm install
npm start
```

Then add folders and images to `input/` — the server watches for changes and resizes on the fly.

Or run it without installing, via `npx`:

```bash
npx sharp-resizer-server -i src/images -o public/images
```

## CLI options

| Flag | Default | Description |
|---|---|---|
| `-i, --input <dir>` | `input` | Source directory to watch |
| `-o, --output <dir>` | `output` | Output directory for resized images |
| `-m, --multiplier <n>` | `1920` | Pixel width of folder-100 images (e.g. `1920` → folder 100 = 1920 px wide, folder 72 = 1382 px) |
| `-t, --threads <n>` | `1` | Max concurrent resize operations |
| `-p, --port <n>` | `4080` | HTTP port |
| `-e, --entry <path>` | `images` | URL entry-point prefix |
| `--allow-upscale` | off | Also resize images into folders **larger** than their source folder |
| `--formats <list>` | none | Comma-separated extra formats to also emit alongside the original: `webp`, `avif` (e.g. `--formats webp,avif`) |
| `-h, --help` | — | Show help |

**Example:**

```bash
node index.js -i src/images -o public/images -m 1280 -t 4 -p 3000 -e assets --formats webp,avif
```

## Output format

`GET http://localhost:4080/images/json`

```json
{
  "hero.jpg": {
    "sizes": "100w",
    "srcset": "/images/output/100/hero.jpg 100w, /images/output/72/hero.jpg 72w, /images/output/37/hero.jpg 37w, /images/output/26/hero.jpg 26w, /images/output/16/hero.jpg 16w",
    "src": "/images/output/100/hero.jpg"
  }
}
```

| Field | Description |
|---|---|
| `sizes` | Largest folder label (`Nw`) |
| `srcset` | All variants, largest-first — ready for `<img srcset>` or `<source srcset>` |
| `src` | Fallback URL pointing to the largest variant |
| `formats` | Present only with `--formats`; `{ webp: {...}, avif: {...} }`, each shaped like the entry above plus a `type` MIME string |

With `--formats webp,avif`, the manifest entry above gains:

```json
{
  "hero.jpg": {
    "sizes": "100w",
    "srcset": "/images/output/100/hero.jpg 100w, ...",
    "src": "/images/output/100/hero.jpg",
    "formats": {
      "webp": { "sizes": "100w", "srcset": "/images/output/100/hero.webp 100w, ...", "src": "/images/output/100/hero.webp", "type": "image/webp" },
      "avif": { "sizes": "100w", "srcset": "/images/output/100/hero.avif 100w, ...", "src": "/images/output/100/hero.avif", "type": "image/avif" }
    }
  }
}
```

**Frontend usage:**

```html
<picture>
  <source
    sizes="100vw"
    type="image/avif"
    srcset="/images/output/100/hero.avif 100w,
            /images/output/72/hero.avif 72w" />
  <source
    sizes="100vw"
    type="image/webp"
    srcset="/images/output/100/hero.webp 100w,
            /images/output/72/hero.webp 72w" />
  <source
    sizes="100vw"
    srcset="/images/output/100/hero.jpg 100w,
            /images/output/72/hero.jpg 72w,
            /images/output/37/hero.jpg 37w" />
  <img src="/images/output/100/hero.jpg" alt="Hero" />
</picture>
```

Or fetch the manifest and render dynamically:

```js
const manifest = await fetch('/images/json').then(r => r.json())
// manifest['hero.jpg'].srcset → ready-made srcset string
```

Static files are also served at `http://localhost:4080/images/output/<size>/<filename>`.

## Docker

```bash
docker build -t sharp-resizer-server .
docker run -p 4080:4080 -v $(pwd)/input:/app/input -v $(pwd)/output:/app/output sharp-resizer-server
```

Override the default flags via `CMD`, e.g. `docker run ... sharp-resizer-server -p 4080 --formats webp,avif`.

## Performance notes

- Resize operations run through a `p-queue` (default concurrency 1; raise with `-t`).
- The `/json` endpoint is cached in memory and invalidated automatically whenever a resize completes or a source image is deleted.  ETag + `304 Not Modified` support is included for efficient polling clients.

## Contributing

Open issues are the best starting point:

| # | Title | Status |
|---|---|---|
| [#1](https://github.com/scaccogatto/sharp-resizer-server/issues/1) | Better README | Resolved in v1.0.0 |
| [#2](https://github.com/scaccogatto/sharp-resizer-server/issues/2) | Upscaling | Resolved — `--allow-upscale` flag |
| [#3](https://github.com/scaccogatto/sharp-resizer-server/issues/3) | Testing | Resolved — Vitest suite added |
| [#4](https://github.com/scaccogatto/sharp-resizer-server/issues/4) | Error parsing | Resolved — try/catch in resizer |
| [#7](https://github.com/scaccogatto/sharp-resizer-server/issues/7) | Better args | Resolved — Commander replaces minimist |
| [#8](https://github.com/scaccogatto/sharp-resizer-server/issues/8) | Cache reply | Resolved — ETag + in-memory cache |
| [#5](https://github.com/scaccogatto/sharp-resizer-server/issues/5) | Output template | Closed — not planned |
| [#6](https://github.com/scaccogatto/sharp-resizer-server/issues/6) | Output mode | Closed — not planned |
