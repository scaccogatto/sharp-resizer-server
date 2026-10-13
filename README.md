# sharp-resizer-server

[![CI](https://github.com/scaccogatto/sharp-resizer-server/actions/workflows/ci.yml/badge.svg)](https://github.com/scaccogatto/sharp-resizer-server/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node ≥22](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](package.json)

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
   Overwriting a source re-renders it, and deleting a source deletes its outputs (including `--formats` siblings).
   Keep image names unique across source folders: `input/100/a.jpg` and `input/72/a.jpg` share the same output files.
4. `GET /images/json` returns a srcset-ready JSON manifest — see [Output format](#output-format).

## Prerequisites

| Requirement | Version |
|---|---|
| Node.js | ≥ 22 |
| libvips | bundled via `sharp` prebuilt — no extra install needed on Linux/macOS/Windows |

## Install and run

```bash
git clone https://github.com/scaccogatto/sharp-resizer-server.git
cd sharp-resizer-server
npm install
npm start
```

Then add folders and images to `input/` — the server watches for changes and resizes on the fly.

Or run it straight from GitHub, via `npx` (the package is not published on npm):

```bash
npx github:scaccogatto/sharp-resizer-server -i src/images -o public/images
```

## CLI options

| Flag | Default | Description |
|---|---|---|
| `-i, --input <dir>` | `input` | Source directory to watch |
| `-o, --output <dir>` | `output` | Output directory for resized images, served under its last path segment (`public/images` → `/images/images/...`) |
| `-m, --multiplier <n>` | `1920` | Positive integer: pixel width of folder-100 images (e.g. `1920` → folder 100 = 1920 px wide, folder 72 = 1382 px) |
| `-t, --threads <n>` | `1` | Max concurrent resize operations (positive integer) |
| `-p, --port <n>` | `4080` | HTTP port (1-65535) |
| `-e, --entry <path>` | `images` | URL entry-point prefix (letters, digits, `.`, `_`, `~`, `-`, segments separated by `/`) |
| `--allow-upscale` | off | Also resize images into folders **larger** than their source folder |
| `--formats <list>` | none | Comma-separated extra formats to also emit alongside the original: `webp`, `avif` (e.g. `--formats webp,avif`) |
| `-h, --help` | | Show help |

**Example:**

```bash
node index.js -i src/images -o public/images -m 1280 -t 4 -p 3000 -e assets --formats webp,avif
```

Images are then served at `http://localhost:3000/assets/images/<size>/<filename>`.

## Output format

`GET http://localhost:4080/images/json`

```json
{
  "hero.jpg": {
    "width": 1920,
    "srcset": "/images/output/100/hero.jpg?v=mv6syibj 1920w, /images/output/72/hero.jpg?v=mv6syib9 1382w, /images/output/37/hero.jpg?v=mv6syib4 710w, /images/output/26/hero.jpg?v=mv6syiaz 499w, /images/output/16/hero.jpg?v=mv6syiat 307w",
    "src": "/images/output/100/hero.jpg?v=mv6syibj"
  }
}
```

| Field | Description |
|---|---|
| `width` | Pixel width of the largest variant |
| `srcset` | All variants, largest first, with their real pixel widths as `w` descriptors: ready for `<img srcset>` or `<source srcset>` |
| `src` | Fallback URL pointing to the largest variant |
| `formats` | Present only with `--formats`: `{ webp: {...}, avif: {...} }`, each shaped like the entry above plus a `type` MIME string |

The manifest has no `sizes` value: how wide an image renders depends on your page layout, so set the `sizes` attribute yourself (for example `100vw` for a full-width hero).

Every URL carries a `?v=` token derived from the file's modification time, so it changes whenever the image is re-rendered.
File names are percent-encoded, so names with spaces or commas stay valid inside `srcset`.

With `--formats webp,avif`, the manifest entry above gains:

```json
{
  "hero.jpg": {
    "width": 1920,
    "srcset": "/images/output/100/hero.jpg?v=mv6syibj 1920w, ...",
    "src": "/images/output/100/hero.jpg?v=mv6syibj",
    "formats": {
      "webp": { "width": 1920, "srcset": "/images/output/100/hero.webp?v=mv6syicd 1920w, ...", "src": "/images/output/100/hero.webp?v=mv6syicd", "type": "image/webp" },
      "avif": { "width": 1920, "srcset": "/images/output/100/hero.avif?v=mv6syice 1920w, ...", "src": "/images/output/100/hero.avif?v=mv6syice", "type": "image/avif" }
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
    srcset="/images/output/100/hero.avif?v=mv6syice 1920w,
            /images/output/72/hero.avif?v=mv6syibe 1382w" />
  <source
    sizes="100vw"
    type="image/webp"
    srcset="/images/output/100/hero.webp?v=mv6syicd 1920w,
            /images/output/72/hero.webp?v=mv6syibc 1382w" />
  <source
    sizes="100vw"
    srcset="/images/output/100/hero.jpg?v=mv6syibj 1920w,
            /images/output/72/hero.jpg?v=mv6syib9 1382w,
            /images/output/37/hero.jpg?v=mv6syib4 710w" />
  <img src="/images/output/100/hero.jpg?v=mv6syibj" width="1920" alt="Hero" />
</picture>
```

Or fetch the manifest and render dynamically:

```js
const manifest = await fetch('/images/json').then(r => r.json())
// manifest['hero.jpg'].srcset → ready-made srcset string
```

Static files are also served at `http://localhost:4080/images/output/<size>/<filename>`.

### Caching

| URL | `Cache-Control` |
|---|---|
| `/images/json` | `no-cache` with an `ETag` (`304 Not Modified` when unchanged) |
| Output file with the manifest's `?v=` token | `public, max-age=31536000, immutable` |
| Output file without `?v=` | `no-cache`: revalidated through `ETag`/`Last-Modified`, since the file is rewritten when its source changes |

## Docker

```bash
docker build -t sharp-resizer-server .
docker run -p 4080:4080 -v $(pwd)/input:/app/input -v $(pwd)/output:/app/output sharp-resizer-server
```

Override the default flags via `CMD`, e.g. `docker run ... sharp-resizer-server -p 4080 --formats webp,avif`.

The container runs as the unprivileged `node` user (uid 1000). With bind mounts, make the host `output` directory writable by that uid, or run the container as your own user with `--user "$(id -u):$(id -g)"`.

## Performance notes

- Resize operations run through a `p-queue` (default concurrency 1; raise with `-t`).
- The `/json` endpoint is cached in memory and invalidated automatically whenever a resize completes or a source image is deleted. ETag + `304 Not Modified` support is included for efficient polling clients.

## Development

```bash
npm ci
npm run lint       # oxlint
npm run typecheck  # tsc on the JSDoc types (checkJs, strict)
npm test           # vitest
```

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
