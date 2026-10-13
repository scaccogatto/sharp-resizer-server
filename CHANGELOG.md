# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.0.0] - 2026-10-13

This is a major release because of the breaking changes below.

### Changed
- **Breaking:** Node.js 22 or newer is now required (`chalk` 6 and `p-queue` 10 dropped Node.js 20, which is end-of-life).
- **Breaking:** `/json` manifest: `srcset` `w` descriptors are now the real pixel widths of each variant (folder × multiplier, e.g. `1920w, 1382w`) instead of the folder labels (`100w, 72w`), which made browsers always download the largest file. The invalid `sizes` field (`"100w"`) is replaced by `width`, the pixel width of the largest variant. Set the `sizes` attribute in your markup.
- **Breaking:** `/json` manifest: every URL now ends with a `?v=` token derived from the file's modification time, and file names are percent-encoded.
- **Breaking:** Output files are now served as `immutable` only through the versioned `?v=` URLs. Plain URLs get `Cache-Control: no-cache` and revalidate through `ETag`/`Last-Modified`, because a re-render rewrites the file in place.
- **Breaking:** `-o, --output` is now served under its last path segment (`-o public/images` → `/images/images/...`, previously `/images/public/images/...`, and an absolute path produced a broken route). The segment must be URL-safe.
- **Breaking:** `-m`, `-t` and `-p` must be positive integers (`-p` at most 65535), and `-e` must be made of URL-safe segments. Invalid values now fail with a clear CLI error instead of crashing at startup.
- Dependencies refreshed: `chalk` 6, `p-queue` 10, `express` 5.3, `sharp` 0.35.5, `vitest` 5, `supertest` 7.3.
- CI actions bumped to `actions/checkout` v7 and `actions/setup-node` v7. Dependabot config added (weekly npm and GitHub Actions updates).
- `package.json` gains a `files` allowlist, so a pack ships only the runtime code and docs.
- CI tests the Node.js 22 floor and Node.js 24, runs `oxlint` and `tsc` (strict `checkJs` on the JSDoc types), builds the Docker image, cancels superseded runs and has a timeout. Pushes run CI on `master` only.
- Dependabot also updates the Docker base image, and its patch and minor updates (except `0.x` minors) are auto-merged once CI passes.

### Fixed
- Overwriting a source image in place now re-renders it (the watcher ignored `change` events).
- Deleting a source image now also deletes its `--formats` `.webp`/`.avif` siblings, which previously stayed on disk and showed up as orphan manifest entries.
- Deleting a source image no longer deletes outputs that a same-named image in another source folder still produces: those are re-rendered from the remaining source. A warning is logged when the same image name exists in several source folders.
- README: the package is not published on npm, so it now documents `npx github:scaccogatto/sharp-resizer-server` instead of `npx sharp-resizer-server`, which never worked.

### Security
- The Docker image runs as the unprivileged `node` user and its `node:24-slim` base image is pinned by digest (kept current by Dependabot).

## [1.1.0] — 2026-07-17

### New features
- `--formats <list>` flag: also emit `webp`/`avif` variants (default quality) alongside the original for every resized image, named `<basename>.<format>`. The `/json` manifest gains a per-image `formats` map (`{ webp: {...}, avif: {...} }`), each entry including the correct `type` MIME so a frontend can build `<picture><source type=...>`. The original entry's `sizes`/`srcset`/`src` fields are unchanged for backward compatibility.
- `npx` support: added a `bin` entry (`sharp-resizer-server`) and a `#!/usr/bin/env node` shebang, so the CLI can be run via `npx sharp-resizer-server` without a local install.
- `Dockerfile`: `node:24-slim` image, production-only deps, `input`/`output` volumes, and an `ENTRYPOINT`/`CMD` split so flags are overridable at `docker run` time. See the README's [Docker](README.md#docker) section.

### Improvements
- Extended the Vitest suite to cover format generation, format-tagged manifest entries, and no-flag backward compatibility.
- README documents `--formats`, `npx`, and Docker usage.

## [1.0.0] — 2026-06-28

### Breaking changes
- **ESM**: the project now uses `"type": "module"`. Any `require('sharp-resizer-server')` call will break; import it or use it as a CLI only.
- **Removed `fork` architecture**: resize operations now run in-process via async sharp + p-queue. No more child processes for `image-resizer.js` or `directory-watcher.js`.
- **`-m` multiplier argument** now accepts the true pixel-width-of-folder-100 value (unchanged from the old default `1920`), but internally it is stored as a float (`1920 / 100 = 19.2`). The public CLI is identical.

### New features
- `--allow-upscale` flag: resizes images into folders larger than their source folder (closes [#2](https://github.com/scaccogatto/sharp-resizer-server/issues/2)).
- In-memory ETag cache on `GET /images/json`; invalidated on every resize completion or source deletion (closes [#8](https://github.com/scaccogatto/sharp-resizer-server/issues/8)).

### Improvements
- Replaced `minimist` with `commander` — full `--help`, typed options, validation (closes [#7](https://github.com/scaccogatto/sharp-resizer-server/issues/7)).
- Added Vitest test suite (24 tests) covering srcset logic, resizer, and HTTP endpoint (closes [#3](https://github.com/scaccogatto/sharp-resizer-server/issues/3)).
- GitHub Actions CI on Node 20 and 22 added.
- README rewritten with badges, CLI table, output format, and HTML usage example (closes [#1](https://github.com/scaccogatto/sharp-resizer-server/issues/1)).
- Fixed the static file mount path — was missing a leading `/`, breaking `<img src>` links in some environments.

### Bug fixes
- `resizeImage` now catches sharp errors and returns `false` instead of crashing the process (closes [#4](https://github.com/scaccogatto/sharp-resizer-server/issues/4)).

### Dependency upgrades
| Package | Old | New |
|---|---|---|
| sharp | 0.18.3 (broken — bintray gone) | 0.35.2 |
| express | 4.15.4 | 5.2.1 |
| chokidar | 1.7.0 | 5.0.0 |
| p-queue | 2.2.0 | 9.3.0 |
| chalk | 2.1.0 | 5.6.2 |
| minimist | 1.2.0 | → commander 15.0.0 |
| lodash | 4.17.4 | removed (native JS) |
| fs-extra | 4.0.2 | removed (node:fs/promises) |
| recursive-readdir | 2.2.1 | removed (node:fs/promises) |

[Unreleased]: https://github.com/scaccogatto/sharp-resizer-server/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/scaccogatto/sharp-resizer-server/compare/v1.1.0...v2.0.0
[1.1.0]: https://github.com/scaccogatto/sharp-resizer-server/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/scaccogatto/sharp-resizer-server/releases/tag/v1.0.0
