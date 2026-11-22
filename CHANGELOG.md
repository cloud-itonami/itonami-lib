# Changelog

Every entry names any change to the shape of `dist/release.json` (the Store
catalog, awai-os `series-catalog.py`, reads it; tell Itonami before such a
change lands).

## v0.1.2 (2026-11-22)

- `formValues` (and so `bindForm`'s values): the shape follows from the form's
  structure. A name held by more than one enabled, non-button control is
  always an array, so two same-name checkboxes with one checked give `["x"]`,
  not `"x"` (found by Itonami in 7ac52696); repeated text names follow the
  same rule. A lone checkbox stays a boolean, a radio group a value or `null`,
  a multiple select an array. The restricted guest CSP hash changes.

release.json shape: unchanged.

## v0.1.1 (2026-11-22)

- Reusable workflow `.github/workflows/app-host.yml`: `cargo check --locked` of
  the host in `app/src-tauri` (a review on isco-2423#17: the old per-repository
  `app-host.yml` was the only host compile). `itonami-app init` writes the
  caller `app-host.yml` (on changes to `app/src-tauri/**` and the pins) next to
  `app.yml`, and no longer deletes it on `--migrate`.
- `bindForm(form, onSubmit)` in `src/form.js` (export `@itonami/series-app/form`)
  for forms in the restricted-wasm-v1 guest, where a submit event never fires;
  inlined into the guest script (the restricted CSP hash changes). The
  restricted build refuses guest code that relies on a submit event.

release.json shape: unchanged.

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
- `init` names `@tauri-apps/cli` in the app's devDependencies at the lib's pin.
- `verify-apk`: 16 KB LOAD alignment, zipalign, no INTERNET, package, MainActivity.
- `data.js` / guest data: `identity` gains `classificationKey` and `attribution`.

release.json shape: unchanged (`schema`, `id`, `source`, `version`, `tauri`,
`profile`, `runtimePins`, `sources`, `files`, `guest` for restricted-wasm-v1,
`source_commit`, `dirty`).
