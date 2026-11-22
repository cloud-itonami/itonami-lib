# Changelog

Every entry names any change to the shape of `dist/release.json` (the Store
catalog, awai-os `series-catalog.py`, reads it; tell Itonami before such a
change lands).

## v0.1.0 (2026-11-22)

First release, made from the series template of
`cloud-itonami/app-itonami-cloud-itonami-isco-2423` at `134c9e7b`.

- JS package `@itonami/series-app` with the `itonami-app` CLI (`init`,
  `build`, `test`, `android`, `verify-apk`); `init` replaces `scripts/scaffold.mjs`
  and `android` replaces `scripts/android-apk.sh`.
- Rust crates `itonami-series-host` (`run(ctx)`, `awai_host_info`) and
  `itonami-series-build` (app id, 16 KB page link arg, Tauri build).
- The host's `awai_host_info` takes the app id from the generated context's
  config (the same `tauri.conf.json` identifier as before).
- Attribution lines in one place (`scripts/attribution.mjs`), keyed by the
  classification key: ISCO-08 (unchanged wording) and, new, UNSPSC.
- New-app checks: no deprecated SPDX id.
- `verify-apk`: 16 KB LOAD alignment, zipalign, no INTERNET, package, MainActivity.
- `data.js` / guest data: `identity` gains `classificationKey` and `attribution`.

release.json shape: unchanged (`schema`, `id`, `source`, `version`, `tauri`,
`profile`, `runtimePins`, `sources`, `files`, `guest` for restricted-wasm-v1,
`source_commit`, `dirty`).
