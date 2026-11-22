// `itonami-app init` gives a repository its app: the repository name (from
// --repo or the git remote) is the source of identity, the shell files arrive
// byte-identical, and the lib is pinned by one commit SHA.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { cspFor } from "../scripts/build.mjs";
import { ICON_FILES, LEGACY_TEMPLATE_FILES, SHELL_FILES, init, libSpec, parseInitArgs, pinnedRev, repoNameFromRemote } from "../scripts/init.mjs";

const LIB = fileURLToPath(new URL("../", import.meta.url));
const REV = "0123456789abcdef0123456789abcdef01234567";

const BLUEPRINT_COFOG = `[{:itonami.blueprint/id "cloud-itonami-cofog-03.2"
  :itonami.blueprint/name "Household Consumption"
  :itonami.blueprint/cofog "03.2"}]
`;
const BLUEPRINT_SCHEME_MISSING = `[{:itonami.blueprint/id "cloud-itonami-7810"
  :itonami.blueprint/name "Growing of Vegetables"
  :itonami.blueprint/isic-rev4 "7810"}]
`;
const BLUEPRINT_SUFFIXED = `[{:itonami.blueprint/id "cloud-itonami-8129-facade"
  :itonami.blueprint/name "Facade Work"
  :itonami.blueprint/isic-rev5 "8129"}]
`;
const BLUEPRINT_ISCO = `[{:itonami.blueprint/id "cloud-itonami-isco-2423"
  :itonami.blueprint/name "Community Careers Practice"
  :itonami.blueprint/isco-08 "2423"}]
`;

async function repoWith(t, blueprint) {
  const repo = await mkdtemp(join(tmpdir(), "itonami-init-"));
  t.after(() => rm(repo, { recursive: true, force: true }));
  if (blueprint !== null) await writeFile(join(repo, "blueprint.edn"), blueprint);
  return repo;
}

test("init writes the identity files and the shell, pinned by rev", async (t) => {
  const repo = await repoWith(t, BLUEPRINT_COFOG);
  const { identity } = await init(repo, { icons: false, repo: "cloud-itonami-cofog-03.2", libRev: REV });
  assert.equal(identity.slug, "cofog032");
  assert.equal(identity.id, "network.itonami.cofog032");

  const pkg = JSON.parse(await readFile(join(repo, "app/package.json"), "utf8"));
  assert.equal(pkg.name, "@itonami/cofog032");
  assert.deepEqual(pkg.itonami, { id: "network.itonami.cofog032", title: "Household Consumption", source: "cloud-itonami-cofog-03.2", runtime: "restricted-wasm-v1" });
  assert.deepEqual(pkg.devDependencies, { "@itonami/series-app": `github:cloud-itonami/itonami-lib#${REV}`, "@tauri-apps/cli": "3.0.0-alpha.6" });
  assert.equal(pinnedRev(pkg), REV);
  assert.equal(pkg.scripts.test, "itonami-app test");
  assert.equal(pkg.scripts.build, "itonami-app build");
  assert.equal(pkg.scripts.android, "itonami-app android");
  assert.equal(pkg.scripts.tauri, "tauri");

  const conf = JSON.parse(await readFile(join(repo, "app/src-tauri/tauri.conf.json"), "utf8"));
  assert.equal(conf.$schema, "https://schema.tauri.app/config/3");
  assert.equal(conf.identifier, "network.itonami.cofog032");
  assert.equal(conf.productName, "Household Consumption");
  assert.equal(conf.app.windows[0].title, "Household Consumption");
  assert.equal(conf.build.frontendDist, "../dist");
  assert.equal(conf.app.withGlobalTauri, true);
  assert.equal(conf.app.security.csp, cspFor("restricted-wasm-v1"));
  assert.equal(conf.bundle.active, false);
  assert.equal(conf.bundle.icon.length, 5);

  const cargo = await readFile(join(repo, "app/src-tauri/Cargo.toml"), "utf8");
  for (const crate of ["itonami-series-build", "itonami-series-host"]) {
    assert.ok(cargo.includes(`${crate} = { git = "https://github.com/cloud-itonami/itonami-lib", rev = "${REV}" }`));
  }
  assert.ok(cargo.includes('tauri = { version = "=3.0.0-alpha.6", features = [] }'));
  assert.ok(!cargo.includes("{{"));
  for (const [from, to] of SHELL_FILES) {
    const want = await readFile(join(LIB, "templates/shell", from));
    assert.ok((await readFile(join(repo, "app", to))).equals(want), `${to} travels byte-identical`);
  }
  assert.equal((await readFile(join(repo, "app/src-tauri/build.rs"), "utf8")).trim().split("\n").length, 1, "build.rs is one line");
  assert.equal((await readFile(join(repo, "app/src-tauri/src/lib.rs"), "utf8")).trim().split("\n").length, 3, "lib.rs is three lines");
  assert.ok((await readFile(join(repo, "app/icon/app.svg"), "utf8")).includes("<svg"));
  for (const name of ICON_FILES) assert.ok(!existsSync(join(repo, "app/src-tauri/icons", name)), "--no-icons writes no icon");
  const workflow = await readFile(join(repo, ".github/workflows/app.yml"), "utf8");
  assert.ok(workflow.includes(`uses: cloud-itonami/itonami-lib/.github/workflows/app.yml@${REV}`));
  assert.ok(!workflow.includes("{{"));
});

test("a lib pin must be a commit SHA, never a branch or a tag", async (t) => {
  for (const bad of ["main", "v0.1.0", "0123456", REV.toUpperCase()]) {
    assert.throws(() => libSpec({ rev: bad }), /40-hex commit SHA/);
  }
  assert.throws(() => libSpec({}), /exactly one/);
  assert.throws(() => libSpec({ rev: REV, path: LIB }), /exactly one/);
  assert.equal(pinnedRev({ devDependencies: { "@itonami/series-app": "github:cloud-itonami/itonami-lib#v0.1.0" } }), null);
  const repo = await repoWith(t, BLUEPRINT_ISCO);
  await assert.rejects(init(repo, { icons: false, repo: "cloud-itonami-isco-2423" }), /--lib-rev/);
});

test("a re-run keeps the pin, the version and the profile", async (t) => {
  const repo = await repoWith(t, BLUEPRINT_COFOG);
  await mkdir(join(repo, "app"), { recursive: true });
  await writeFile(join(repo, "app/package.json"), JSON.stringify({ version: "0.2.0", devDependencies: { "@itonami/series-app": `github:cloud-itonami/itonami-lib#${REV}` } }));
  await init(repo, { icons: false, repo: "cloud-itonami-cofog-03.2" });
  const pkg = JSON.parse(await readFile(join(repo, "app/package.json"), "utf8"));
  assert.equal(pkg.version, "0.2.0");
  assert.equal(pkg.itonami.runtime, "trusted-page-v1", "a package.json from before the field stays on trusted-page-v1");
  assert.equal(pinnedRev(pkg), REV);
  const conf = JSON.parse(await readFile(join(repo, "app/src-tauri/tauri.conf.json"), "utf8"));
  assert.equal(conf.version, "0.2.0");
});

test("init stamps a scheme-missing and a suffixed blueprint from --repo", async (t) => {
  const a = await repoWith(t, BLUEPRINT_SCHEME_MISSING);
  const ia = (await init(a, { icons: false, repo: "cloud-itonami-isic-7810", libRev: REV })).identity;
  assert.deepEqual([ia.source, ia.scheme, ia.code, ia.variant, ia.slug, ia.id, ia.classification],
    ["cloud-itonami-isic-7810", "isic", "7810", null, "isic7810", "network.itonami.isic7810", "ISIC Rev.4 class 7810"]);
  const b = await repoWith(t, BLUEPRINT_SUFFIXED);
  const ib = (await init(b, { icons: false, repo: "app-itonami-cloud-itonami-isic-8129-facade", libRev: REV })).identity;
  assert.deepEqual([ib.source, ib.variant, ib.slug, ib.id, ib.classification],
    ["cloud-itonami-isic-8129-facade", "facade", "isic8129facade", "network.itonami.isic8129facade", "ISIC Rev.5 class 8129"]);
});

test("init writes a sanitized productName and the verbatim window title", async (t) => {
  const repo = await repoWith(t, BLUEPRINT_ISCO.replace("Community Careers Practice", "Research Support: Biology"));
  const { identity } = await init(repo, { icons: false, repo: "cloud-itonami-isco-2423", libRev: REV });
  assert.equal(identity.productName, "Research Support Biology");
  const conf = JSON.parse(await readFile(join(repo, "app/src-tauri/tauri.conf.json"), "utf8"));
  assert.equal(conf.productName, "Research Support Biology");
  assert.equal(conf.app.windows[0].title, "Research Support: Biology");
});

test("the CLI takes --repo and --lib-rev", async (t) => {
  const repo = await repoWith(t, BLUEPRINT_SCHEME_MISSING);
  execFileSync(process.execPath, [join(LIB, "bin/itonami-app.mjs"), "init", repo, "--repo", "cloud-itonami-isic-7810", "--lib-rev", REV, "--no-icons"], { stdio: "pipe" });
  const pkg = JSON.parse(await readFile(join(repo, "app/package.json"), "utf8"));
  assert.equal(pkg.itonami.id, "network.itonami.isic7810");
  assert.deepEqual(parseInitArgs(["r", "--repo=x", "--lib-path", "/l", "--migrate"]), { root: "r", opts: { icons: true, repo: "x", libRev: null, libPath: "/l", migrate: true } });
  assert.throws(() => parseInitArgs(["--frobnicate"]), /unknown option/);
});

test("init reads the name from the git remote, and never from the directory", async (t) => {
  const repo = await repoWith(t, BLUEPRINT_ISCO);
  execFileSync("git", ["init", "--quiet"], { cwd: repo, stdio: "pipe" });
  execFileSync("git", ["remote", "add", "origin", "git@github.com:cloud-itonami/app-itonami-cloud-itonami-isco-2423.git"], { cwd: repo, stdio: "pipe" });
  assert.equal(repoNameFromRemote(repo), "app-itonami-cloud-itonami-isco-2423");
  const { identity } = await init(repo, { icons: false, libRev: REV });
  assert.equal(identity.id, "network.itonami.isco2423");

  const base = await mkdtemp(join(tmpdir(), "itonami-dirname-"));
  t.after(() => rm(base, { recursive: true, force: true }));
  const named = join(base, "app-itonami-cloud-itonami-isco-2423");
  await mkdir(named, { recursive: true });
  await writeFile(join(named, "blueprint.edn"), BLUEPRINT_ISCO);
  await assert.rejects(init(named, { icons: false, libRev: REV }), /--repo/);
});

test("init fails without blueprint.edn (a kotoba.app.edn alone is not read)", async (t) => {
  const repo = await repoWith(t, null);
  await writeFile(join(repo, "kotoba.app.edn"), '{:id "x" :bundle-cid "y"}\n');
  await assert.rejects(init(repo, { icons: false, repo: "cloud-itonami-isco-2423", libRev: REV }), /blueprint\.edn not found/);
  assert.ok(!existsSync(join(repo, "app")), "nothing is written");
});

test("--migrate removes the copied template and keeps everything else", async (t) => {
  const repo = await repoWith(t, BLUEPRINT_ISCO);
  for (const f of LEGACY_TEMPLATE_FILES) {
    await mkdir(join(repo, "app", f, ".."), { recursive: true });
    await writeFile(join(repo, "app", f), "old\n");
  }
  await writeFile(join(repo, "app/src/keep.txt"), "mine\n");
  await mkdir(join(repo, ".github/workflows"), { recursive: true });
  await writeFile(join(repo, ".github/workflows/app-host.yml"), "old\n");
  await writeFile(join(repo, ".github/workflows/other.yml"), "mine\n");
  await init(repo, { icons: false, repo: "cloud-itonami-isco-2423", libRev: REV, migrate: true });
  for (const f of LEGACY_TEMPLATE_FILES) assert.ok(!existsSync(join(repo, "app", f)), `${f} is removed`);
  for (const d of ["android", "scripts", "test", "vendor"]) assert.ok(!existsSync(join(repo, "app", d)), `app/${d}/ is gone`);
  assert.equal(await readFile(join(repo, "app/src/keep.txt"), "utf8"), "mine\n", "an unknown file stays");
  assert.ok(!existsSync(join(repo, ".github/workflows/app-host.yml")));
  assert.equal(await readFile(join(repo, ".github/workflows/other.yml"), "utf8"), "mine\n");
  const top = readdirSync(join(repo, "app")).sort();
  assert.deepEqual(top, [".gitignore", "README.md", "icon", "package.json", "src", "src-tauri"]);
});
