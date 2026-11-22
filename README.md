# itonami-lib

The shared app of the Itonami classification-series repositories
(`cloud-itonami/app-itonami-cloud-itonami-<scheme>-<code>`). Each series
repository keeps only its identity and a thin shell, and pins this repository
by **commit SHA**. Everything else (the build, the view, the restricted host
and guest, the Android steps and the checks) lives here, once.

| Part | What it is |
| --- | --- |
| `@itonami/series-app` (repository root) | JS package with the `itonami-app` CLI, `scripts/`, the view in `src/`, the canonical runtimes in `vendor/` (pinned in `vendor/PINS.json`), the Android `android/MainActivity.kt`, the shell templates in `templates/shell/`, the per-repository checks in `test/app/` |
| `crates/itonami-series-host` | `run(ctx)` and the one read-only command `awai_host_info` |
| `crates/itonami-series-build` | the whole `build.rs`: app id from `tauri.conf.json`, the 16 KB page link arg on Android, Tauri's build step |
| `.github/workflows/app.yml` | reusable workflow (`npm ci && npm test` in `app/`) that series repositories call |
| `.github/workflows/app-host.yml` | reusable workflow: `cargo check --locked` of the Tauri host in `app/src-tauri` |
| `scripts/bump-series.mjs` | opens one PR per series repository to move it to a new lib commit |

## How a series repository uses it

What stays in the repository:

- identity: `blueprint.edn`, `physics.edn`, `docs/samples/`, `app/package.json`
  (`itonami.id`, `itonami.title`, `itonami.source`, `itonami.runtime`, the lib
  pin), `app/src-tauri/tauri.conf.json`, `app/src-tauri/icons/`, `app/icon/app.svg`;
- the shell, the same in every repository: `app/src-tauri/Cargo.toml`,
  `build.rs` (1 line), `src/lib.rs` (3 lines), `src/main.rs`,
  `capabilities/main.json`, `app/.gitignore`, `app/README.md`, and
  `.github/workflows/app.yml` and `app-host.yml` (a few lines each that call
  this lib's workflows; `app-host.yml` runs on changes to `app/src-tauri/**`
  and the pins). Many series repositories have Actions disabled, so these do
  not run everywhere; that gap is covered by the Tatara move (Dev item 58);
- the lock files `app/package-lock.json` and `app/src-tauri/Cargo.lock`,
  committed.

The pins, always a 40-hex commit (a tag can be moved, so it is only a name
for people):

```json
"devDependencies": { "@itonami/series-app": "github:cloud-itonami/itonami-lib#<sha>" }
```

```toml
itonami-series-build = { git = "https://github.com/cloud-itonami/itonami-lib", rev = "<sha>" }
itonami-series-host = { git = "https://github.com/cloud-itonami/itonami-lib", rev = "<sha>" }
```

```yaml
jobs:
  test:
    uses: cloud-itonami/itonami-lib/.github/workflows/app.yml@<sha>
```

No token is needed: the repository is public, and npm and cargo fetch it over
https. `tauri` stays pinned in the shell's `Cargo.toml` as `=3.0.0-alpha.6`,
the same as in `itonami-series-host`, because `generate_context!()` expands in
the repository's own crate. A bump changes both at once.

## The CLI

Run in the repository's `app/` directory (`npm run …` maps to these):

- `itonami-app init [repo-root] [--repo <name>] [--lib-rev <sha>] [--no-icons] [--migrate]`:
  write the identity files and the shell. The name comes from `--repo`, else
  the git remote origin (never the directory name). `blueprint.edn` must exist
  (a repository with only `kotoba.app.edn` is not read). A re-run keeps the
  version, the runtime profile and the lib pin unless `--lib-rev` is given.
  `--migrate` removes the files the old copied template put under `app/`.
  `--lib-path <dir>` points at a local checkout (this lib's own tests only).
- `itonami-app build`: write `dist/` and `dist/release.json`.
- `itonami-app test`: build, then run this lib's checks of the repository
  (`test/app/`): build pins, `release.json` shape and commit, attribution,
  operator-console sample, `Cargo.lock` order, the shell files, the SHA pins and
  that the package id follows from the repository name.
- `itonami-app android`: build the debug APK (aarch64) and verify it. Needs
  the Android SDK (build-tools, NDK 27), JDK 21 and a Rust toolchain with
  `aarch64-linux-android`. Each run starts from a fresh `tauri android init`
  (`src-tauri/gen/android/` is not in git), requires `uiMode` in the
  manifest's `configChanges`, removes `android.permission.INTERNET`
  (`tools:node="remove"`; `tauri android dev` keeps it), writes this lib's
  `android/MainActivity.kt` with the package from `tauri.conf.json`, removes the
  old APK outputs, and builds with `nice -n 10` and `CARGO_BUILD_JOBS`
  (default 4).
- `itonami-app verify-apk <apk>`: the APK checks. Every `.so` LOAD segment is
  `Align 0x4000` (`llvm-readelf -lW`), `zipalign -c -P 16 -v 4` passes, no
  INTERNET permission, the package is the app id, and MainActivity is this
  lib's template (source digest, and its class and method in the dex). Any
  failure fails the build.

## Identity and the blueprint schema

The repository name is the source of identity. The package id is
`network.itonami.<slug>` from the name alone (`isco-2423` → `isco2423`,
`cofog-03.2` → `cofog032`); neither the edition nor the level of the
classification is part of it, so correcting a blueprint never changes the id
the Store catalog matches on. The lib's tests pin this.

`blueprint.edn` holds exactly one classification key; the key carries the
edition and the code's shape gives the level:

| Key | Edition | Levels by shape |
| --- | --- | --- |
| `:itonami.blueprint/isic-rev4`, `:itonami.blueprint/isic-rev5` | ISIC Rev.4 / Rev.5 | section (A–U), division (2), group (3), class (4) |
| `:itonami.blueprint/isco-08` | ISCO-08 | major (1), sub-major (2), minor (3), unit group (4) |
| `:itonami.blueprint/jsic-code` | JSIC | division (A–T), major group (2), group (3), industry (4) |
| `:itonami.blueprint/cofog` | COFOG | division (`03`), group (`03.2`), class (`03.2.1`) |
| `:itonami.blueprint/unspsc-segment` | UNSPSC | segment (2) |

The value is the code as a string and must equal the code in the repository
name. A new app (one that is not in `scripts/trusted-page-v1-existing.txt`)
may not name a deprecated SPDX id in `:itonami.blueprint/license` (for
example `AGPL-3.0`; use `AGPL-3.0-only` or `AGPL-3.0-or-later`).

## Attribution

`scripts/attribution.mjs` is the one place the source lines live, chosen by
the classification key: ISCO-08 (Legal's final ILO wording) and UNSPSC (source
and trademark). The app shows them in "この app について" with the repository's
own code. No ILO logo, no UNDP emblem, and for UNSPSC one code and its name per
app: the lib holds no named list of codes. ISIC, JSIC and COFOG lines are added
here after Legal has given them.

## Runtime profiles (KOTOBA-159)

- `restricted-wasm-v1` for every new app (`itonami-app init` writes it). The
  page is a trusted host with the canonical runtime from
  `vendor/restricted-wasm-v1/` (kotoba #1367); the guest is verified against
  the digest and source commit pinned at build time and mounted in an
  opaque-origin sandbox. The build needs the source commit (a git checkout, or
  `ITONAMI_SOURCE_COMMIT`).
- `trusted-page-v1` only for the existing apps listed in
  `scripts/trusted-page-v1-existing.txt`, and only through 2027-03-31 (UTC).
  That list is also the one test of "existing".

## Forms in a restricted-wasm-v1 guest

The guest sandbox is `allow-scripts` only (no `allow-forms`), so a form's
`submit` event never fires. Use `bindForm` from `src/form.js`
(`import { bindForm } from "@itonami/series-app/form"`; the restricted build
inlines it into the guest script):

```js
bindForm(form, onSubmit) // → unbind()
// onSubmit(values, form): values is a plain object of the form's named, enabled fields
```

- Submit controls in the form (a button of type submit or with no type, an
  input of type submit) become `type="button"` with `data-submit`; a click on
  any `[data-submit]` control runs `onSubmit`. Write new forms with
  `<button type="button" data-submit>`.
- Enter in a single-line `<input>` runs the same handler (keydown). Never in a
  `<textarea>`, and never during IME composition (`isComposing` or keyCode 229).
- Both call `preventDefault`, so nothing navigates.
- Native validation stays: `form.reportValidity()` (else `checkValidity()`)
  must pass first.
- Values: a text-like field gives its string; a lone checkbox gives a boolean,
  several checkboxes of one name the array of checked values; a radio group
  gives the checked value or `null`; a multiple select an array; repeated names
  an array. Buttons, file inputs and disabled fields are left out.
- Sending the values anywhere goes through the broker operation; that is the
  caller's job.

The restricted build refuses a guest that relies on a submit event (a submit
listener, `onsubmit=`, `requestSubmit()`, `form.submit()`, or a type=submit
control). `test/form-browser.test.mjs` checks click, Enter, IME Enter and
validation in headless Chrome inside a `sandbox="allow-scripts"` iframe.

## release.json

`dist/release.json` (`awai.app.artifact.v1`) pins every source and output
file by SHA-256 and records `source_commit` (the 40-hex `git rev-parse HEAD`
of the repository) and `dirty` (`git status --porcelain` not empty). Without
git, `ITONAMI_SOURCE_COMMIT` / `ITONAMI_SOURCE_DIRTY` give them, else both are
`null`. The Store catalog reads this file, so its shape is tested and every
change to it is announced in `CHANGELOG.md` first.

A worker's scratch directory inside the checkout makes the build `dirty`. Keep
it outside the repository, or add it to `.git/info/exclude` before building.

## Moving repositories to a new lib commit

`scripts/bump-series.mjs --lib <sha> --repos <file> --results <tsv>` opens one
PR per repository. It writes the new SHA into the three pins, regenerates both
lock files, re-runs `itonami-app init`, refuses when `itonami.id` or the
`tauri.conf.json` identifier changes, runs `npm ci && npm test`, and records
each result in the TSV. Only repositories whose tests pass get a PR. A
repository left on an older commit keeps working: its own lock files fix it.

## Developing the lib

`npm ci && npm test` runs the lib's tests, end-to-end checks on fixture apps
made by `itonami-app init --lib-path`, and `scripts/check-public.mjs`, which
fails on any secret, internal host or machine path in a tracked file.
`cargo test --workspace` tests the crates.

## Licence

AGPL-3.0-or-later, the licence of the series apps. See `LICENSE`.
