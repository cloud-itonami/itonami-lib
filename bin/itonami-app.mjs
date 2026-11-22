#!/usr/bin/env node
// itonami-app: the one command a classification-series repository runs.
//   itonami-app init [repo-root] [--repo <name>] [--lib-rev <sha> | --lib-path <dir>] [--no-icons] [--migrate]
//   itonami-app build            (in app/) write dist/ and dist/release.json
//   itonami-app test             (in app/) build, then this lib's checks of the repository
//   itonami-app android          (in app/) build the debug APK and verify it
//   itonami-app verify-apk <apk> (in app/) verify an APK against this app
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { LIB, build } from "../scripts/build.mjs";

const [command, ...args] = process.argv.slice(2);
const usage = "usage: itonami-app <init|build|test|android|verify-apk> [...]";

async function main() {
  switch (command) {
    case "init": {
      const { init, parseInitArgs } = await import("../scripts/init.mjs");
      const { root, opts } = parseInitArgs(args);
      const { identity, app } = await init(root, opts);
      console.log(`${identity.title} (${identity.id}) written into ${app}`);
      return 0;
    }
    case "build": {
      const { identity, release } = await build(resolve(args[0] ?? "."));
      console.log(`${identity.title} (${identity.id}) static build: ${Object.keys(release.files).length} pinned files from ${Object.keys(release.sources).length} sources`);
      return 0;
    }
    case "test": {
      const app = resolve(args[0] ?? ".");
      const { identity } = await build(app);
      console.log(`built ${identity.id}`);
      const dir = join(LIB, "test/app");
      const files = readdirSync(dir).filter((f) => f.endsWith(".test.mjs")).sort().map((f) => join(dir, f));
      const r = spawnSync(process.execPath, ["--test", "--test-concurrency=1", ...files], { stdio: "inherit", env: { ...process.env, ITONAMI_APP_DIR: app } });
      return r.status ?? 1;
    }
    case "android": {
      const { android } = await import("../scripts/android.mjs");
      const r = await android(resolve(args[0] ?? "."));
      console.log(JSON.stringify({ apk: r.apk, sha256: r.sha256, package: r.pkg, seconds: r.seconds, checks: Object.fromEntries(r.checks.map((c) => [c.name, c.ok])) }));
      return 0;
    }
    case "verify-apk": {
      const { verifyApk } = await import("../scripts/verify-apk.mjs");
      const apk = args[0];
      if (!apk) throw new Error("usage: itonami-app verify-apk <apk> [app-dir]");
      const pkg = JSON.parse(readFileSync(join(resolve(args[1] ?? "."), "src-tauri/tauri.conf.json"), "utf8")).identifier;
      const v = await verifyApk(resolve(apk), { pkg });
      for (const c of v.checks) console.log(`${c.ok ? "ok  " : "FAIL"} ${c.name}: ${c.detail}`);
      console.log(`sha256 ${v.sha256}`);
      return v.ok ? 0 : 1;
    }
    default:
      console.error(usage);
      return 2;
  }
}

try {
  process.exitCode = await main();
} catch (error) {
  console.error(`itonami-app ${command ?? ""}: ${error.message}`);
  process.exitCode = 1;
}
