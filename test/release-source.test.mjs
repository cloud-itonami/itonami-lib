// release.json says which commit the build was made from (source_commit,
// dirty), and the Android activity that makes the APK is a committed file.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { build, sourceState } from "../scripts/build.mjs";

const LIB = fileURLToPath(new URL("../", import.meta.url));
const COMMIT = /^[0-9a-f]{40}$/;
const NO_ENV = {};

const git = (dir, ...args) =>
  execFileSync("git", ["-C", dir, "-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

async function checkout(t) {
  const dir = await mkdtemp(join(tmpdir(), "itonami-source-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  git(dir, "init", "-q");
  await writeFile(join(dir, ".gitignore"), "/ignored/\n");
  await writeFile(join(dir, "blueprint.edn"), "[]\n");
  git(dir, "add", ".");
  git(dir, "commit", "-q", "-m", "first");
  return dir;
}

test("a clean git checkout gives its HEAD and dirty false", async (t) => {
  const dir = await checkout(t);
  const state = sourceState(dir, NO_ENV);
  assert.ok(COMMIT.test(state.source_commit));
  assert.equal(state.source_commit, git(dir, "rev-parse", "HEAD").trim());
  assert.equal(state.dirty, false);
});

test("an ignored file keeps the checkout clean", async (t) => {
  const dir = await checkout(t);
  execFileSync("mkdir", [join(dir, "ignored")]);
  await writeFile(join(dir, "ignored/out.txt"), "x");
  assert.equal(sourceState(dir, NO_ENV).dirty, false);
});

test("an untracked file or a tracked change makes it dirty", async (t) => {
  const dir = await checkout(t);
  await writeFile(join(dir, "new.txt"), "x");
  assert.equal(sourceState(dir, NO_ENV).dirty, true);
  await rm(join(dir, "new.txt"));
  await writeFile(join(dir, "blueprint.edn"), "[{}]\n");
  assert.equal(sourceState(dir, NO_ENV).dirty, true);
});

test("git wins over the environment inside a checkout", async (t) => {
  const dir = await checkout(t);
  const env = { ITONAMI_SOURCE_COMMIT: "0".repeat(40), ITONAMI_SOURCE_DIRTY: "true" };
  assert.deepEqual(sourceState(dir, env), { source_commit: git(dir, "rev-parse", "HEAD").trim(), dirty: false });
});

test("without git both are null", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "itonami-nogit-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  assert.deepEqual(sourceState(dir, NO_ENV), { source_commit: null, dirty: null });
});

test("a directory inside another checkout does not take its commit", async (t) => {
  const dir = await checkout(t);
  execFileSync("mkdir", [join(dir, "unpacked")]);
  assert.deepEqual(sourceState(join(dir, "unpacked"), NO_ENV), { source_commit: null, dirty: null });
});

test("without git the environment gives the values", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "itonami-nogit-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const commit = "0123456789abcdef0123456789abcdef01234567";
  assert.deepEqual(sourceState(dir, { ITONAMI_SOURCE_COMMIT: commit, ITONAMI_SOURCE_DIRTY: "false" }), { source_commit: commit, dirty: false });
  assert.deepEqual(sourceState(dir, { ITONAMI_SOURCE_DIRTY: "true" }), { source_commit: null, dirty: true });
  assert.throws(() => sourceState(dir, { ITONAMI_SOURCE_COMMIT: "abc" }), /40-hex/);
  assert.throws(() => sourceState(dir, { ITONAMI_SOURCE_COMMIT: commit.toUpperCase() }), /40-hex/);
  assert.throws(() => sourceState(dir, { ITONAMI_SOURCE_DIRTY: "1" }), /"true" or "false"/);
});

test("the lib MainActivity is the x402 form with a package placeholder", async () => {
  const kt = await readFile(join(LIB, "android/MainActivity.kt"), "utf8");
  assert.equal(kt.split("\n")[0], "package __PACKAGE__");
  assert.equal(kt.match(/^package /gm).length, 1);
  for (const part of [
    "ViewCompat.setOnApplyWindowInsetsListener(content)",
    "WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()",
    "max(bars.bottom,ime.bottom)",
    "ViewCompat.requestApplyInsets(content)",
    "override fun onConfigurationChanged(newConfig: Configuration)",
    "applySystemBarAppearance(newConfig)",
    "window.isNavigationBarContrastEnforced=false",
    "isAppearanceLightStatusBars=light",
    "isAppearanceLightNavigationBars=light",
  ]) {
    assert.ok(kt.includes(part), `MainActivity has ${part}`);
  }
  // The decor colours are the page's own --bg, light and dark.
  const css = await readFile(join(LIB, "src/style.css"), "utf8");
  const bg = [...css.matchAll(/--bg:\s*#([0-9a-f]{6})/gi)].map((m) => m[1].toUpperCase());
  assert.deepEqual(bg, ["FFFFFF", "141414"]);
  assert.ok(kt.includes(`if (light) 0xFF${bg[0]}.toInt() else 0xFF${bg[1]}.toInt()`));
});

test("itonami-app android writes the lib activity, checks uiMode and verifies the APK", async () => {
  const js = await readFile(join(LIB, "scripts/android.mjs"), "utf8");
  // tauri records how it was started, and Gradle runs that again from src-tauri.
  assert.ok(js.includes('"npm", ["run", "tauri", "--", "android", "init", "--ci"]'));
  assert.ok(js.includes('"nice", ["-n", "10", "npm", "run", "tauri", "--", "android", "build", "--debug", "--apk", "--target", "aarch64", "--ci"]'));
  assert.ok(js.includes('CARGO_BUILD_JOBS: env.CARGO_BUILD_JOBS || "4"'));
  assert.ok(!/node_modules\/\.bin\/tauri"\s*,\s*\[/.test(js), "no direct node_modules/.bin/tauri call");
  assert.ok(js.indexOf('"cargo", "rustc"') < js.indexOf("await build(app"), "cargo and rustc are checked first");
  assert.ok(js.indexOf("androidTools(env)") < js.indexOf("await build(app"), "the SDK tools are required before anything is built");
  const init = js.indexOf('"android", "init"');
  const manifest = js.indexOf("prepareManifest(await readFile(manifest");
  const activity = js.indexOf("await writeFile(activity, activityText)");
  const stale = js.indexOf("for (const dir of STALE_OUTPUTS)");
  const buildAt = js.indexOf('"android", "build"');
  const verify = js.indexOf("await verifyApk(apk");
  assert.ok(init > 0 && manifest > init && activity > init && stale > activity && buildAt > stale && verify > buildAt, "init, manifest and activity, clean outputs, build, verify");
  const { STALE_OUTPUTS } = await import("../scripts/android.mjs");
  assert.deepEqual(STALE_OUTPUTS, ["app/build/outputs/apk", "app/build/intermediates/apk", "app/build/intermediates/incremental"]);
  const ignore = await readFile(join(LIB, "templates/shell/gitignore"), "utf8");
  assert.ok(ignore.split("\n").includes("/src-tauri/gen/android/"));
});
