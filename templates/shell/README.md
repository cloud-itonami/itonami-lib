# Series app

The app of this repository is built by `@itonami/series-app` from
[cloud-itonami/itonami-lib](https://github.com/cloud-itonami/itonami-lib),
pinned by commit SHA in `package.json` and `src-tauri/Cargo.toml`. The files
here are the repository's identity (`package.json`, `src-tauri/tauri.conf.json`,
icons) and a thin shell that is the same in every repository; `itonami-app init`
writes them. Run `npm ci && npm test`; `npm run android` builds the debug APK.
