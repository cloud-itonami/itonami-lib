// `itonami-app init`: give one classification-series repository its app.
// The repository name (from --repo, else its git remote origin) is the source
// of identity; blueprint.edn is checked against it and must exist. init writes
// the identity files (package.json, src-tauri/tauri.conf.json, icon/app.svg,
// icons) and the thin shell that is the same in every repository
// (src-tauri/Cargo.toml, build.rs, src/lib.rs, src/main.rs,
// capabilities/main.json, .gitignore, README.md, .github/workflows/app.yml).
// Everything else comes from this package, pinned by commit SHA.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, rm, rmdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve } from "node:path";
import { LIB, cspFor, isExisting, profileOf } from "./build.mjs";
import { iconSvg } from "./icon.mjs";
import { deriveIdentity, readBlueprint } from "./identity.mjs";
import { checkLicense } from "./license.mjs";

export const LIB_REPO = "cloud-itonami/itonami-lib";
export const LIB_GIT = `https://github.com/${LIB_REPO}`;
export const PACKAGE = "@itonami/series-app";
const SHA = /^[0-9a-f]{40}$/;
const SHELL = join(LIB, "templates/shell");
/** The @tauri-apps/cli version this lib pins (its own package.json). */
export const TAURI_CLI = JSON.parse(readFileSync(join(LIB, "package.json"), "utf8")).dependencies["@tauri-apps/cli"];

/** Shell files: [path under the shell template, path under app/]. Byte-identical in every repository. */
export const SHELL_FILES = [
  ["gitignore", ".gitignore"],
  ["README.md", "README.md"],
  ["build.rs", "src-tauri/build.rs"],
  ["src/lib.rs", "src-tauri/src/lib.rs"],
  ["src/main.rs", "src-tauri/src/main.rs"],
  ["capabilities/main.json", "src-tauri/capabilities/main.json"],
];

/**
 * The files the copied template (before this lib) put under app/. `init
 * --migrate` removes them; after that the repository keeps only its identity
 * and the shell.
 */
export const LEGACY_TEMPLATE_FILES = [
  "android/MainActivity.kt",
  "scripts/android-apk.sh",
  "scripts/android-manifest.mjs",
  "scripts/build.mjs",
  "scripts/console.mjs",
  "scripts/edn.mjs",
  "scripts/icon.mjs",
  "scripts/identity.mjs",
  "scripts/scaffold.mjs",
  "scripts/trusted-page-v1-existing.txt",
  "src/app.js",
  "src/guest.html",
  "src/guest.js",
  "src/host.css",
  "src/host.html",
  "src/host.js",
  "src/index.html",
  "src/style.css",
  "src/view.js",
  "test/android-manifest.test.mjs",
  "test/attribution.test.mjs",
  "test/build.test.mjs",
  "test/cargo-lock.test.mjs",
  "test/console.test.mjs",
  "test/identity.test.mjs",
  "test/layout.test.mjs",
  "test/profile.test.mjs",
  "test/release-source.test.mjs",
  "test/scaffold.test.mjs",
  "test/view.test.mjs",
  "vendor/PINS.json",
  "vendor/kotoba-client-consent.css",
  "vendor/kotoba-client-runtime.js",
  "vendor/restricted-wasm-v1/kotoba-client-consent.css",
  "vendor/restricted-wasm-v1/kotoba-client-runtime.js",
];

/** Desktop icon files taken from the `tauri icon` output directory. */
export const ICON_FILES = ["32x32.png", "128x128.png", "128x128@2x.png", "icon.icns", "icon.ico", "icon.png"];

const CONF_ICONS = ["icons/32x32.png", "icons/128x128.png", "icons/128x128@2x.png", "icons/icon.icns", "icons/icon.ico"];

/**
 * How the repository depends on this lib: { rev } pins a commit of
 * cloud-itonami/itonami-lib (the only form for a real repository), { path }
 * points at a local checkout (the lib's own tests). Never a branch or a tag.
 */
export function libSpec({ rev = null, path = null } = {}) {
  if ((rev === null) === (path === null)) throw new Error("give exactly one of --lib-rev <40-hex commit> or --lib-path <dir>");
  if (rev !== null) {
    if (!SHA.test(rev)) throw new Error(`--lib-rev must be a 40-hex commit SHA, not ${JSON.stringify(rev)} (a branch or tag can move)`);
    return { rev, npm: `github:${LIB_REPO}#${rev}`, cargo: `{ git = "${LIB_GIT}", rev = "${rev}" }`, workflow: rev };
  }
  return { path: resolve(path), npm: null, cargo: null, workflow: null };
}

/** The lib commit an existing app/package.json pins, or null. */
export function pinnedRev(pkg) {
  const spec = pkg?.devDependencies?.[PACKAGE] ?? pkg?.dependencies?.[PACKAGE];
  const m = typeof spec === "string" ? /^github:cloud-itonami\/itonami-lib#([0-9a-f]{40})$/.exec(spec) : null;
  return m ? m[1] : null;
}

/**
 * The series repository name: the --repo value when given, else the last
 * path segment of the git remote origin URL (with a `.git` suffix removed).
 * The directory name is never used: worktrees are named after tasks.
 */
export function repoNameFromRemote(repoRoot) {
  let url;
  try {
    url = execFileSync("git", ["-C", repoRoot, "remote", "get-url", "origin"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch {
    throw new Error(`cannot determine the repository name for ${repoRoot}: pass --repo <name> or set a git remote origin`);
  }
  const segment = url.trim().replace(/\/+$/, "").split(/[/:]/).pop() ?? "";
  const name = segment.endsWith(".git") ? segment.slice(0, -".git".length) : segment;
  if (!name) throw new Error(`git remote origin for ${repoRoot} gives no repository name: pass --repo <name>`);
  return name;
}

const fill = (text, values) => text.replace(/\{\{([A-Z_]+)\}\}/g, (_, k) => {
  if (!Object.hasOwn(values, k)) throw new Error(`shell template has an unfilled placeholder {{${k}}}`);
  return values[k];
});

export async function init(repoRoot, { icons = true, repo: repoName = null, libRev = null, libPath = null, migrate = false } = {}) {
  const repo = resolve(repoRoot);
  const name = repoName ?? repoNameFromRemote(repo);
  const blueprintFile = join(repo, "blueprint.edn");
  if (!existsSync(blueprintFile)) throw new Error(`${blueprintFile} not found: init needs the repository's blueprint.edn (the profile side adds it)`);
  const blueprint = readBlueprint(await readFile(blueprintFile, "utf8"));
  const identity = deriveIdentity(name, blueprint);
  checkLicense(blueprint, { existing: isExisting(identity.source) });
  const app = join(repo, "app");
  await mkdir(join(app, "icon"), { recursive: true });
  await mkdir(join(app, "src-tauri/src"), { recursive: true });
  await mkdir(join(app, "src-tauri/capabilities"), { recursive: true });

  // A fresh app starts at 0.1.0 with restricted-wasm-v1 (KOTOBA-159). A
  // re-run keeps the version, the profile and, unless told otherwise, the
  // lib pin: an existing app without itonami.runtime predates the field and
  // stays on trusted-page-v1 (build.mjs accepts that only for the listed apps).
  let version = "0.1.0";
  let runtime = "restricted-wasm-v1";
  let prev = null;
  try {
    prev = JSON.parse(await readFile(join(app, "package.json"), "utf8"));
  } catch {
    prev = null;
  }
  if (prev !== null) {
    if (typeof prev.version === "string" && prev.version) version = prev.version;
    runtime = profileOf(prev);
  }
  if (libRev === null && libPath === null) libRev = pinnedRev(prev);
  if (libRev === null && libPath === null) throw new Error(`app/package.json pins no ${PACKAGE} commit: pass --lib-rev <40-hex commit>`);
  const lib = libSpec({ rev: libRev, path: libPath });

  if (migrate) {
    for (const file of LEGACY_TEMPLATE_FILES) await rm(join(app, file), { force: true });
    for (const dir of ["android", "scripts", "src", "test", "vendor/restricted-wasm-v1", "vendor"]) {
      // Only an emptied directory goes; anything else in it stays for review.
      await rmdir(join(app, dir)).catch(() => {});
    }
  }

  const npmDep = lib.npm ?? `file:${relative(app, lib.path)}`;
  const pkg = {
    name: `@itonami/${identity.slug}`,
    version,
    private: true,
    type: "module",
    itonami: { id: identity.id, title: identity.title, source: identity.source, runtime },
    scripts: {
      build: "itonami-app build",
      test: "itonami-app test",
      tauri: "tauri",
      android: "itonami-app android",
      "build:desktop": "itonami-app build && tauri build --no-bundle",
    },
    // The tauri CLI is named here too, at the lib's pin, so node_modules/.bin/tauri
    // exists whatever npm hoists (Gradle runs `npm run tauri` again from src-tauri).
    devDependencies: { [PACKAGE]: npmDep, "@tauri-apps/cli": TAURI_CLI },
  };
  await writeFile(join(app, "package.json"), JSON.stringify(pkg, null, 2) + "\n");

  const conf = {
    $schema: "https://schema.tauri.app/config/3",
    productName: identity.productName,
    version,
    identifier: identity.id,
    build: { frontendDist: "../dist" },
    app: {
      withGlobalTauri: true,
      windows: [{ label: "main", title: identity.title, width: 1100, height: 780, minWidth: 360, minHeight: 480 }],
      security: { csp: cspFor(runtime) },
    },
    bundle: { active: false, icon: CONF_ICONS },
  };
  await writeFile(join(app, "src-tauri/tauri.conf.json"), JSON.stringify(conf, null, 2) + "\n");

  const cargoDep = lib.cargo ?? null;
  const dep = (crate) => cargoDep ?? `{ path = "${join(lib.path, "crates", crate)}" }`;
  const cargo = (await readFile(join(SHELL, "Cargo.toml.tmpl"), "utf8"))
    .replace("itonami-series-build = {{LIB_DEP}}", `itonami-series-build = ${dep("itonami-series-build")}`)
    .replace("itonami-series-host = {{LIB_DEP}}", `itonami-series-host = ${dep("itonami-series-host")}`);
  if (cargo.includes("{{")) throw new Error("templates/shell/Cargo.toml.tmpl has an unfilled placeholder");
  await writeFile(join(app, "src-tauri/Cargo.toml"), cargo);
  for (const [from, to] of SHELL_FILES) {
    await mkdir(dirname(join(app, to)), { recursive: true });
    await copyFile(join(SHELL, from), join(app, to));
  }

  await writeFile(join(app, "icon/app.svg"), iconSvg(identity));
  if (icons) {
    if (!existsSync(join(app, "node_modules/.bin/tauri"))) {
      execFileSync("npm", ["install", "--no-audit", "--no-fund"], { cwd: app, stdio: "inherit" });
    }
    const out = await mkdtemp(join(tmpdir(), "itonami-icons-"));
    try {
      execFileSync(join(app, "node_modules/.bin/tauri"), ["icon", join(app, "icon/app.svg"), "--output", out], { cwd: app, stdio: "inherit" });
      await mkdir(join(app, "src-tauri/icons"), { recursive: true });
      for (const icon of ICON_FILES) await copyFile(join(out, icon), join(app, "src-tauri/icons", icon));
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  }

  // The caller workflows (app.yml: npm test; app-host.yml: cargo check of the
  // host): a few lines each that run this lib's reusable workflow at
  // the pinned commit. A local --lib-path fixture gets none.
  if (lib.workflow) {
    await mkdir(join(repo, ".github/workflows"), { recursive: true });
    for (const name of ["app", "app-host"]) {
      await writeFile(join(repo, `.github/workflows/${name}.yml`), fill(await readFile(join(SHELL, `${name}.yml.tmpl`), "utf8"), { LIB_REV: lib.workflow }));
    }
  }
  return { identity, app, version, lib };
}

/** Parse `init` CLI arguments. */
export function parseInitArgs(args) {
  const opts = { icons: true, repo: null, libRev: null, libPath: null, migrate: false };
  const rest = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const take = (flag) => { if (a === flag) { i += 1; return args[i] ?? null; } return a.slice(flag.length + 1); };
    if (a === "--repo" || a.startsWith("--repo=")) opts.repo = take("--repo");
    else if (a === "--lib-rev" || a.startsWith("--lib-rev=")) opts.libRev = take("--lib-rev");
    else if (a === "--lib-path" || a.startsWith("--lib-path=")) opts.libPath = take("--lib-path");
    else if (a === "--no-icons") opts.icons = false;
    else if (a === "--migrate") opts.migrate = true;
    else if (a.startsWith("--")) throw new Error(`unknown option ${a}`);
    else rest.push(a);
  }
  return { root: rest[0] ?? ".", opts };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { root, opts } = parseInitArgs(process.argv.slice(2));
  const { identity, app } = await init(root, opts);
  console.log(`${identity.title} (${identity.id}) written into ${app}`);
}
