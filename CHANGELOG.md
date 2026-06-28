# Changelog

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
