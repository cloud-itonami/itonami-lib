// Static build: dist/ is the whole app (HTML, CSS, JS) for the Tauri v3 shell
// and for a plain static host. No bundler and no dependency. Everything the
// app shows is read here from the repository's own files (blueprint.edn,
// physics.edn, docs/samples/operator-console.html) and pinned by digest in
// release.json; the app carries no second, hand-written copy.
//
// Two directories take part. LIB is this package (@itonami/series-app: the
// view in src/, the runtimes in vendor/, the allow-list in scripts/), the
// same commit in every repository that pins it. The app directory is the
// repository's own app/ (package.json, src-tauri/tauri.conf.json); dist/ is
// written there and blueprint.edn is read from its parent.
import { mkdir, copyFile, readFile, writeFile, rm } from "node:fs/promises";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { readAll } from "./edn.mjs";
import { readBlueprint, deriveIdentity } from "./identity.mjs";
import { checkLicense } from "./license.mjs";
import { extractConsole } from "./console.mjs";

export const TAURI = "3.0.0-alpha.6";
// The page talks to nothing but the Tauri IPC bridge. There is no external
// operation, so no other origin appears here.
const policy = (script, style) => `default-src 'none'; script-src ${script}; style-src ${style}; img-src 'self' data:; connect-src ipc: http://ipc.localhost; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'`;
/** The trusted-page-v1 policy: same-document app, no inline script or style. */
export const CSP = policy("'self'", "'self'");

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
/** The root of this package (src/, vendor/, scripts/). */
export const LIB = fileURLToPath(new URL("../", import.meta.url));

/**
 * Client runtime profiles (kotoba.app.client-runtime.v1, KOTOBA-159, owner
 * decision 2026-11-22). package.json `itonami.runtime` names one; a
 * package.json without it predates the field and is read as trusted-page-v1.
 * New repositories get restricted-wasm-v1 from `itonami-app init`.
 * trusted-page-v1 builds only for an existing series app listed in
 * scripts/trusted-page-v1-existing.txt, and only through TRUSTED_PAGE_V1_LAST_DAY.
 */
export const PROFILES = ["trusted-page-v1", "restricted-wasm-v1"];
export const TRUSTED_PAGE_V1_LAST_DAY = "2027-03-31";
export const TRUSTED_PAGE_V1_LIST = "scripts/trusted-page-v1-existing.txt";

export function profileOf(meta) {
  const profile = meta?.itonami?.runtime ?? "trusted-page-v1";
  if (!PROFILES.includes(profile)) throw new Error(`package.json itonami.runtime is ${JSON.stringify(profile)}; use one of ${PROFILES.join(", ")}`);
  return profile;
}

/** The itonami.source of every existing series app (the 2026-11-22 list). */
export function existingApps(lib = LIB) {
  return readFileSync(resolve(lib, TRUSTED_PAGE_V1_LIST), "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
}

/** True when `source` is an existing series app: this list is the one test of "existing". */
export function isExisting(source, lib = LIB) {
  return existingApps(lib).includes(source);
}

/** Throws unless `source` may build with `profile` on the UTC day of `now`. */
export function checkProfile(profile, source, now = new Date(), lib = LIB) {
  if (profile !== "trusted-page-v1") return;
  const day = now.toISOString().slice(0, 10);
  if (day > TRUSTED_PAGE_V1_LAST_DAY) {
    throw new Error(`trusted-page-v1 was accepted through ${TRUSTED_PAGE_V1_LAST_DAY} (UTC); set package.json itonami.runtime to "restricted-wasm-v1"`);
  }
  if (!isExisting(source, lib)) {
    throw new Error(`${source} is not an existing series app in ${TRUSTED_PAGE_V1_LIST}, so it cannot use trusted-page-v1; set package.json itonami.runtime to "restricted-wasm-v1"`);
  }
}

const RESTRICTED_RUNTIME = "vendor/restricted-wasm-v1/kotoba-client-runtime.js";
const VIEW_IMPORT = /^import \{[^}]*\} from "\.\/view\.js";\n/m;

/**
 * The guest's one inline script: view.js and form.js without their `export`
 * keywords, then guest.js without its view.js import. All are lib files, so
 * the text (and its CSP hash) is the same for every app of one lib commit.
 */
export function guestScript(lib = LIB) {
  const view = readFileSync(resolve(lib, "src/view.js"), "utf8");
  const form = readFileSync(resolve(lib, "src/form.js"), "utf8");
  const guest = readFileSync(resolve(lib, "src/guest.js"), "utf8");
  if (/^\s*import\b/m.test(view)) throw new Error("src/view.js must not import: it is inlined into the restricted guest");
  if (/^\s*import\b/m.test(form)) throw new Error("src/form.js must not import: it is inlined into the restricted guest");
  if (!VIEW_IMPORT.test(guest)) throw new Error("src/guest.js must import from ./view.js on one line");
  const script = view.replace(/^export /gm, "") + "\n" + form.replace(/^export /gm, "") + "\n" + guest.replace(VIEW_IMPORT, "");
  if (/^\s*(import|export)\b/m.test(script)) throw new Error("the restricted guest script still has an import or export");
  if (/<\/script/i.test(script)) throw new Error("the restricted guest script contains </script");
  checkNoSubmit(script, "the restricted guest script");
  return script;
}

/**
 * The restricted sandbox has no allow-forms: a submit event never fires.
 * Throws when guest code relies on one (a submit listener, onsubmit,
 * requestSubmit or form.submit()) or markup has a type=submit control. Use
 * bindForm (src/form.js) and <button type="button" data-submit> instead.
 */
export function checkNoSubmit(text, what) {
  const rules = [
    [/addEventListener\(\s*["'`]submit["'`]/, "a submit listener"],
    [/\bonsubmit\s*=/, "an onsubmit handler"],
    [/\.requestSubmit\s*\(/, "requestSubmit()"],
    [/\.submit\s*\(\s*\)/, "form.submit()"],
    [/<(button|input)\b[^>]*\btype\s*=\s*["']?submit\b/i, "a type=submit control"],
  ];
  for (const [re, name] of rules) {
    if (re.test(text)) throw new Error(`${what} relies on ${name}, which never fires in the restricted-wasm-v1 sandbox; use bindForm and <button type="button" data-submit>`);
  }
}

export function guestStyle(lib = LIB) {
  const style = readFileSync(resolve(lib, "src/style.css"), "utf8");
  if (/<\/style/i.test(style)) throw new Error("src/style.css contains </style");
  return style;
}

/** The inline script mountRestrictedClientApp puts before the guest (R6). */
export function guestPreamble(lib = LIB) {
  const m = /^const GUEST_PREAMBLE = '<script>([^'\\]*)<\/script>';$/m.exec(readFileSync(resolve(lib, RESTRICTED_RUNTIME), "utf8"));
  if (!m) throw new Error(`${RESTRICTED_RUNTIME} has no GUEST_PREAMBLE this build can hash`);
  return m[1];
}

const cspHash = (text) => `'sha256-${createHash("sha256").update(text, "utf8").digest("base64")}'`;

/**
 * The page policy for a profile. restricted-wasm-v1: the sandboxed srcdoc
 * guest inherits this policy, so it admits exactly the runtime's preamble and
 * the guest's own inline script and style by hash, and nothing else inline.
 */
export function cspFor(profile, lib = LIB) {
  if (profile === "trusted-page-v1") return CSP;
  if (profile !== "restricted-wasm-v1") throw new Error(`unknown profile ${JSON.stringify(profile)}`);
  return policy(`'self' ${cspHash(guestPreamble(lib))} ${cspHash(guestScript(lib))}`, `'self' ${cspHash(guestStyle(lib))}`);
}

const escapeHtml = (text) => text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** Fill {{NAME}} placeholders in one pass; a placeholder without a value stops the build. */
function fill(template, what, values) {
  return template.replace(/\{\{([A-Z]+)\}\}/g, (_, key) => {
    if (!Object.hasOwn(values, key)) throw new Error(`${what} has an unfilled placeholder {{${key}}}`);
    return values[key];
  });
}

const COMMIT = /^[0-9a-f]{40}$/;

/**
 * The commit the build is made from, for release.json: `source_commit` is the
 * 40-hex `git rev-parse HEAD` of the repository root, and `dirty` is true when
 * `git status --porcelain` lists a tracked change or an untracked file that is
 * not ignored. The repository root must be the top of its own git checkout; a
 * tarball unpacked inside some other checkout does not take that one's commit.
 * Without git, ITONAMI_SOURCE_COMMIT (40 hex) and ITONAMI_SOURCE_DIRTY
 * ("true" or "false") give the values when they are set; otherwise both are
 * null. Nothing is guessed: a malformed variable stops the build.
 */
export function sourceState(repo, env = process.env) {
  const git = (args) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  let top = null;
  try {
    top = git(["rev-parse", "--show-toplevel"]).trim();
  } catch {
    // Not a git checkout, or no git on this machine.
  }
  if (top !== null && realpathSync(top) === realpathSync(repo)) {
    const commit = git(["rev-parse", "HEAD"]).trim();
    if (!COMMIT.test(commit)) throw new Error(`git rev-parse HEAD gave ${JSON.stringify(commit)}, not a 40-hex commit`);
    return { source_commit: commit, dirty: git(["status", "--porcelain"]).trim() !== "" };
  }
  let source_commit = null;
  let dirty = null;
  if (env.ITONAMI_SOURCE_COMMIT !== undefined) {
    if (!COMMIT.test(env.ITONAMI_SOURCE_COMMIT)) throw new Error("ITONAMI_SOURCE_COMMIT is not a 40-hex commit");
    source_commit = env.ITONAMI_SOURCE_COMMIT;
  }
  if (env.ITONAMI_SOURCE_DIRTY !== undefined) {
    if (env.ITONAMI_SOURCE_DIRTY !== "true" && env.ITONAMI_SOURCE_DIRTY !== "false") throw new Error('ITONAMI_SOURCE_DIRTY is not "true" or "false"');
    dirty = env.ITONAMI_SOURCE_DIRTY === "true";
  }
  return { source_commit, dirty };
}

export async function build(appRoot = process.cwd(), env = process.env, { now = new Date(), lib = LIB } = {}) {
  const repo = resolve(appRoot, "..");
  // Read before dist/ is written, so the build's own output never counts.
  const state = sourceState(repo, env);
  const out = resolve(appRoot, "dist");
  const meta = JSON.parse(await readFile(resolve(appRoot, "package.json"), "utf8"));

  const pins = JSON.parse(await readFile(resolve(lib, "vendor/PINS.json"), "utf8"));
  for (const set of [pins.files, pins["restricted-wasm-v1"]?.files ?? {}]) {
    for (const [name, digest] of Object.entries(set)) {
      if (sha(await readFile(resolve(lib, "vendor", name))) !== digest) throw new Error(`canonical runtime pin drift: ${name}`);
    }
  }

  const sources = {};
  const source = async (path) => {
    const file = resolve(repo, path);
    if (!existsSync(file)) return null;
    const bytes = await readFile(file);
    sources[path] = sha(bytes);
    return bytes.toString("utf8");
  };

  const blueprintText = await source("blueprint.edn");
  if (blueprintText === null) throw new Error("blueprint.edn not found next to app/");
  const blueprint = readBlueprint(blueprintText);
  if (typeof meta.itonami?.source !== "string" || !meta.itonami.source) {
    throw new Error("package.json has no itonami.source; re-run itonami-app init");
  }
  const identity = deriveIdentity(meta.itonami.source, blueprint);
  const profile = profileOf(meta);
  checkProfile(profile, identity.source, now, lib);
  checkLicense(blueprint, { existing: isExisting(identity.source, lib) });

  // The stamped files must agree with the blueprint they were stamped from.
  const conf = JSON.parse(await readFile(resolve(appRoot, "src-tauri/tauri.conf.json"), "utf8"));
  const expect = (what, got, want) => { if (got !== want) throw new Error(`${what} is ${JSON.stringify(got)}, blueprint.edn gives ${JSON.stringify(want)}; re-run itonami-app init`); };
  expect("package.json itonami.id", meta.itonami?.id, identity.id);
  expect("package.json itonami.source", meta.itonami?.source, identity.source);
  expect("tauri.conf.json identifier", conf.identifier, identity.id);
  expect("tauri.conf.json productName", conf.productName, identity.productName);
  expect("tauri.conf.json window title", conf.app?.windows?.[0]?.title, identity.title);
  expect("tauri.conf.json version", conf.version, meta.version);
  const csp = cspFor(profile, lib);
  expect("tauri.conf.json csp", conf.app?.security?.csp, csp);

  const physicsText = await source("physics.edn");
  let physics = null;
  if (physicsText !== null) {
    const forms = readAll(physicsText);
    if (forms.length !== 1 || !Array.isArray(forms[0]?.cases)) throw new Error("physics.edn must hold one map with :cases");
    physics = forms[0];
  }
  const consoleText = await source("docs/samples/operator-console.html");
  const operatorConsole = consoleText === null ? null : extractConsole(consoleText);
  if (consoleText !== null && operatorConsole === null) delete sources["docs/samples/operator-console.html"];

  // trusted-page-v1 keeps the tab in localStorage. A restricted-wasm-v1 guest
  // runs in an opaque origin, which has no localStorage, so its tab lives in memory.
  const restricted = profile === "restricted-wasm-v1";
  const descriptor = {
    schema: "kotoba.app.client-runtime.v1", target: "browser", profile, entry: "index.html",
    "local-state": { adapter: restricted ? "memory" : "localstorage", schema: identity.stateSchema, version: 1 }, workers: [], operations: [],
  };
  const data = { identity, version: meta.version, blueprint, physics, console: operatorConsole, sources, descriptor };

  await rm(out, { recursive: true, force: true });
  await mkdir(join(out, "vendor"), { recursive: true });
  const title = escapeHtml(identity.title);
  let names;
  let guest = null;
  if (!restricted) {
    const index = fill(await readFile(resolve(lib, "src/index.html"), "utf8"), "index.html", { CSP: csp, TITLE: title });
    await writeFile(join(out, "index.html"), index);
    for (const name of ["style.css", "app.js", "view.js"]) await copyFile(resolve(lib, "src", name), join(out, name));
    await copyFile(resolve(lib, "vendor/kotoba-client-runtime.js"), join(out, "vendor/kotoba-client-runtime.js"));
    await writeFile(join(out, "data.js"), `export default ${JSON.stringify(data, null, 1)};\n`);
    names = ["index.html", "style.css", "app.js", "view.js", "data.js", "descriptor.json", "vendor/kotoba-client-runtime.js"];
  } else {
    // The guest artifact is pinned to the commit it is built from.
    if (state.source_commit === null) throw new Error("restricted-wasm-v1 pins the guest to its source commit: build from a git checkout or set ITONAMI_SOURCE_COMMIT");
    // `<` never appears raw in the JSON block, so no text in the data can close it.
    const json = JSON.stringify(data).replace(/</g, "\\u003c");
    const html = fill(await readFile(resolve(lib, "src/guest.html"), "utf8"), "guest.html", { TITLE: title, STYLE: guestStyle(lib), DATA: json, SCRIPT: guestScript(lib) });
    checkNoSubmit(html.replace(/<script type="application\/json" id="data">[\s\S]*?<\/script>/, ""), "the restricted guest");
    const bytes = Buffer.from(html, "utf8");
    if (html.length > 8388608) throw new Error("the restricted guest exceeds the 8 MiB mount budget");
    guest = { revision: state.source_commit, sha256: sha(bytes), "max-bytes": bytes.length };
    const index = fill(await readFile(resolve(lib, "src/host.html"), "utf8"), "host.html", { CSP: csp, TITLE: title });
    await writeFile(join(out, "index.html"), index);
    for (const name of ["host.css", "host.js", "view.js"]) await copyFile(resolve(lib, "src", name), join(out, name));
    for (const name of ["kotoba-client-runtime.js", "kotoba-client-consent.css"]) await copyFile(resolve(lib, "vendor/restricted-wasm-v1", name), join(out, "vendor", name));
    await writeFile(join(out, "host-data.js"), `export default ${JSON.stringify({ descriptor, artifact: guest, guest: html }, null, 1)};\n`);
    names = ["index.html", "host.css", "host.js", "view.js", "host-data.js", "descriptor.json", "vendor/kotoba-client-runtime.js", "vendor/kotoba-client-consent.css"];
  }
  await writeFile(join(out, "descriptor.json"), JSON.stringify(descriptor, null, 2) + "\n");

  const files = {};
  for (const name of names) files[name] = sha(await readFile(join(out, name)));
  const release = { schema: "awai.app.artifact.v1", id: identity.id, source: identity.source, version: meta.version, tauri: TAURI, profile, runtimePins: restricted ? pins["restricted-wasm-v1"] : { source: pins.source, revision: pins.revision, files: pins.files }, sources, files, ...(guest ? { guest } : {}), source_commit: state.source_commit, dirty: state.dirty };
  await writeFile(join(out, "release.json"), JSON.stringify(release, null, 2) + "\n");
  return { identity, release, data };
}

