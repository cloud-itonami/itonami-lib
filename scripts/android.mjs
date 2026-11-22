// `itonami-app android`: build the debug Android APK (aarch64) of the series
// app in the current app/ directory, then run every verify-apk check on it.
// Requires: Android SDK (build-tools, NDK 27), JDK 21, a Rust toolchain with
// the aarch64-linux-android target.
//
// gen/android is generated, never edited and not in git: every build starts
// from a fresh `tauri android init`, then
// 1. the manifest is prepared (uiMode must be in configChanges; INTERNET is
//    removed, see android-manifest.mjs),
// 2. MainActivity.kt is this lib's android/MainActivity.kt with the package
//    taken from tauri.conf.json, so the APK comes from pinned commits only,
// 3. the old APK outputs are removed (AGP packages incrementally into them),
// 4. the build runs as `nice -n 10` with CARGO_BUILD_JOBS (default 4).
// Every tauri call goes through `npm run tauri --`: tauri records the command
// it was started with in gen/android, and Gradle runs it again from src-tauri.
// `tauri android dev` does not run this, so a dev build keeps INTERNET.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { build } from "./build.mjs";
import { prepareManifest } from "./android-manifest.mjs";
import { androidTools, mainActivityFor, verifyApk } from "./verify-apk.mjs";

/** Paths under gen/android removed before every build. */
export const STALE_OUTPUTS = ["app/build/outputs/apk", "app/build/intermediates/apk", "app/build/intermediates/incremental"];
export const APK = "app/build/outputs/apk/universal/debug/app-universal-debug.apk";

function sh(cmd, args, opts) {
  const r = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed (${r.status ?? r.signal})`);
}

export async function android(appRoot = process.cwd(), env = process.env, { log = console.error } = {}) {
  const app = resolve(appRoot);
  const tools = androidTools(env);
  for (const tool of ["cargo", "rustc"]) {
    try {
      execFileSync(tool, ["--version"], { stdio: "ignore" });
    } catch {
      throw new Error(`${tool} is not on PATH; install a Rust toolchain (rustup) and put its cargo/rustc on PATH`);
    }
  }
  const runEnv = { ...env, ANDROID_HOME: tools.home, NDK_HOME: tools.ndk, CARGO_BUILD_JOBS: env.CARGO_BUILD_JOBS || "4" };
  if (!existsSync(join(app, "node_modules/.bin/tauri"))) sh("npm", ["ci"], { cwd: app, env: runEnv });
  const t0 = Date.now();
  await build(app, env);
  const t1 = Date.now();

  const gen = join(app, "src-tauri/gen/android");
  await rm(gen, { recursive: true, force: true });
  sh("npm", ["run", "tauri", "--", "android", "init", "--ci"], { cwd: app, env: runEnv });
  const t2 = Date.now();

  const pkg = JSON.parse(await readFile(join(app, "src-tauri/tauri.conf.json"), "utf8")).identifier;
  const activityText = mainActivityFor(pkg);
  const main = join(gen, "app/src/main");
  const activity = join(main, "java", ...pkg.split("."), "MainActivity.kt");
  if (!existsSync(activity)) throw new Error(`tauri android init wrote no ${activity}`);
  const manifest = join(main, "AndroidManifest.xml");
  await writeFile(manifest, prepareManifest(await readFile(manifest, "utf8")));
  await writeFile(activity, activityText);
  for (const dir of STALE_OUTPUTS) await rm(join(gen, dir), { recursive: true, force: true });

  sh("nice", ["-n", "10", "npm", "run", "tauri", "--", "android", "build", "--debug", "--apk", "--target", "aarch64", "--ci"], { cwd: app, env: runEnv });
  const t3 = Date.now();
  const apk = join(gen, APK);
  if (!existsSync(apk)) throw new Error(`no APK at ${apk}`);
  const verdict = await verifyApk(apk, { pkg, activity, tools });
  for (const c of verdict.checks) log(`${c.ok ? "ok  " : "FAIL"} ${c.name}: ${c.detail}`);
  const seconds = { build: Math.round((t1 - t0) / 1000), init: Math.round((t2 - t1) / 1000), android: Math.round((t3 - t2) / 1000), total: Math.round((t3 - t0) / 1000) };
  if (!verdict.ok) throw new Error(`the APK failed: ${verdict.checks.filter((c) => !c.ok).map((c) => c.name).join(", ")} (${apk})`);
  return { apk, pkg, ...verdict, seconds };
}
