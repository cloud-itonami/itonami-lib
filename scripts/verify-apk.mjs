// `itonami-app verify-apk`: the checks every series APK must pass before it
// leaves the build (AWAI-3393). Any failed check fails the whole verdict.
// - every LOAD segment of every native library is aligned to 16 KB
//   (`llvm-readelf -lW`, Align 0x4000);
// - `zipalign -c -P 16 -v 4` accepts the APK;
// - the APK asks for no android.permission.INTERNET (aapt2);
// - the package name is the app's identifier (aapt2);
// - MainActivity is this lib's template with the package filled in: the
//   generated source has the template's digest, and the dex holds its class
//   and its applySystemBarAppearance method.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { LIB } from "./build.mjs";

export const MAIN_ACTIVITY = join(LIB, "android/MainActivity.kt");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const latest = (dir) => (existsSync(dir) ? readdirSync(dir).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).pop() : undefined);

/** Android SDK tools this lib uses: { home, ndk, aapt2, zipalign, readelf }. Throws when one is missing. */
export function androidTools(env = process.env) {
  const home = env.ANDROID_HOME || join(homedir(), "Library/Android/sdk");
  const ndk = env.NDK_HOME || (latest(join(home, "ndk")) ? join(home, "ndk", latest(join(home, "ndk"))) : null);
  const bt = latest(join(home, "build-tools"));
  const aapt2 = bt ? join(home, "build-tools", bt, "aapt2") : null;
  const zipalign = bt ? join(home, "build-tools", bt, "zipalign") : null;
  const prebuilt = ndk ? join(ndk, "toolchains/llvm/prebuilt") : null;
  const host = prebuilt ? latest(prebuilt) : undefined;
  const readelf = host ? join(prebuilt, host, "bin/llvm-readelf") : null;
  for (const [what, file] of [["aapt2", aapt2], ["zipalign", zipalign], ["llvm-readelf (NDK)", readelf]]) {
    if (!file || !existsSync(file)) throw new Error(`no ${what} under ${home}: install the Android build-tools and NDK, or set ANDROID_HOME / NDK_HOME`);
  }
  return { home, ndk, aapt2, zipalign, readelf };
}

/** The MainActivity.kt text for a package: the template with its one placeholder line filled. */
export function mainActivityFor(pkg, template = readFileSync(MAIN_ACTIVITY, "utf8")) {
  if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(pkg)) throw new Error(`'${pkg}' is not a Java package name`);
  if ((template.match(/^package __PACKAGE__$/gm) ?? []).length !== 1) throw new Error("android/MainActivity.kt has no single 'package __PACKAGE__' line");
  return template.replace(/^package __PACKAGE__$/m, `package ${pkg}`);
}

/** LOAD segments whose Align is not 0x4000, from `llvm-readelf -lW` output. */
export function misalignedLoads(readelfOutput) {
  return readelfOutput.split("\n").filter((l) => /^\s*LOAD\s/.test(l)).filter((l) => l.trim().split(/\s+/).pop() !== "0x4000");
}

/** Verify one APK. Returns { ok, checks: [{ name, ok, detail }], sha256 }. */
export async function verifyApk(apk, { pkg, activity = null, tools = androidTools() } = {}) {
  const checks = [];
  const check = (name, ok, detail = "") => checks.push({ name, ok: Boolean(ok), detail });
  const run = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 << 20 });

  const badging = run(tools.aapt2, ["dump", "badging", apk]);
  const name = /^package: name='([^']*)'/m.exec(badging)?.[1] ?? null;
  check("package", name === pkg, `package ${name}`);
  const perms = run(tools.aapt2, ["dump", "permissions", apk]);
  check("no-internet", !/android\.permission\.INTERNET/.test(perms), perms.split("\n").filter((l) => l.includes("permission:")).map((l) => l.trim()).join("; "));

  let zip = true;
  try {
    run(tools.zipalign, ["-c", "-P", "16", "-v", "4", apk]);
  } catch {
    zip = false;
  }
  check("zipalign", zip, "zipalign -c -P 16 -v 4");

  const dir = await mkdtemp(join(tmpdir(), "itonami-apk-"));
  try {
    const list = run("unzip", ["-Z1", apk]).split("\n").filter(Boolean);
    const libs = list.filter((f) => /^lib\/[^/]+\/[^/]+\.so$/.test(f));
    run("unzip", ["-q", "-o", apk, ...libs, ...list.filter((f) => /^classes\d*\.dex$/.test(f)), "-d", dir]);
    const bad = [];
    for (const so of libs) {
      const out = run(tools.readelf, ["-lW", join(dir, so)]);
      if (!/^\s*LOAD\s/m.test(out)) bad.push(`${so}: no LOAD`);
      for (const l of misalignedLoads(out)) bad.push(`${so}: ${l.trim()}`);
    }
    check("16kb", libs.length > 0 && bad.length === 0, `${libs.length} .so${bad.length ? `; ${bad.join("; ")}` : "; all LOAD Align 0x4000"}`);

    const want = mainActivityFor(pkg);
    if (activity !== null) {
      const got = await readFile(activity, "utf8");
      check("mainactivity-source", sha(got) === sha(want), `sha256 ${sha(got).slice(0, 12)} vs template ${sha(want).slice(0, 12)}`);
    }
    const klass = `L${pkg.replaceAll(".", "/")}/MainActivity;`;
    const dexes = list.filter((f) => /^classes\d*\.dex$/.test(f));
    const holder = dexes.find((f) => {
      const bytes = readFileSync(join(dir, f));
      return bytes.includes(klass) && bytes.includes("applySystemBarAppearance");
    });
    check("mainactivity-dex", holder !== undefined, holder ? `${klass} with applySystemBarAppearance in ${holder}` : `${klass} not found with the template's method`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  const digest = sha(await readFile(apk));
  return { ok: checks.every((c) => c.ok), checks, sha256: digest };
}
