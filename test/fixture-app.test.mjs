// The lib's own end-to-end check: give fixture repositories their app with
// `itonami-app init --lib-path`, commit them, and run `itonami-app test` (the
// checks every series repository runs) on each. One fixture is the pilot
// identity (isco-2423, an existing trusted-page-v1 app); one is a new app.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const LIB = fileURLToPath(new URL("../", import.meta.url));
const CLI = join(LIB, "bin/itonami-app.mjs");
const git = (dir, ...args) => execFileSync("git", ["-C", dir, "-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", ...args], { stdio: "pipe" });

async function fixture(t, source, blueprint, { existing = false } = {}) {
  const repo = await mkdtemp(join(tmpdir(), "itonami-fixture-"));
  t.after(() => rm(repo, { recursive: true, force: true }));
  await writeFile(join(repo, "blueprint.edn"), blueprint);
  if (existing) {
    // An app from before itonami.runtime: init keeps it on trusted-page-v1.
    await mkdir(join(repo, "app"), { recursive: true });
    await writeFile(join(repo, "app/package.json"), JSON.stringify({ version: "0.1.0" }));
  }
  execFileSync(process.execPath, [CLI, "init", repo, "--repo", source, "--lib-path", LIB, "--no-icons"], { stdio: "pipe" });
  git(repo, "init", "-q");
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "fixture");
  return join(repo, "app");
}

function appTest(app) {
  const r = spawnSync(process.execPath, [CLI, "test"], { cwd: app, encoding: "utf8", env: { ...process.env, NODE_TEST_CONTEXT: undefined } });
  return { status: r.status, out: r.stdout + r.stderr };
}

test("the pilot identity passes every app check", async (t) => {
  const app = await fixture(t, "cloud-itonami-isco-2423", `[{:itonami.blueprint/id "cloud-itonami-isco-2423"
  :itonami.blueprint/name "Community Careers Practice"
  :itonami.blueprint/isco-08 "2423"
  :itonami.blueprint/license "AGPL-3.0-or-later"}]
`, { existing: true });
  const r = appTest(app);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /fail 0/);
});

test("a new restricted-wasm-v1 app passes every app check", async (t) => {
  const app = await fixture(t, "cloud-itonami-unspsc-43", `[{:itonami.blueprint/id "cloud-itonami-unspsc-43"
  :itonami.blueprint/name "Fixture Segment"
  :itonami.blueprint/unspsc-segment "43"
  :itonami.blueprint/license "AGPL-3.0-or-later"}]
`);
  const r = appTest(app);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /fail 0/);
});

test("a new app with a deprecated SPDX id fails init", async (t) => {
  const repo = await mkdtemp(join(tmpdir(), "itonami-fixture-"));
  t.after(() => rm(repo, { recursive: true, force: true }));
  await writeFile(join(repo, "blueprint.edn"), `[{:itonami.blueprint/id "cloud-itonami-isco-9999" :itonami.blueprint/name "N" :itonami.blueprint/isco-08 "9999" :itonami.blueprint/license "AGPL-3.0"}]`);
  const r = spawnSync(process.execPath, [CLI, "init", repo, "--repo", "cloud-itonami-isco-9999", "--lib-path", LIB, "--no-icons"], { encoding: "utf8" });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /deprecated SPDX id AGPL-3.0/);
});
