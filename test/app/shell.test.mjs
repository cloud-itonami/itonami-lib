// The repository keeps only its identity and the thin shell, and pins this
// lib by one commit SHA everywhere. The package id follows from the
// repository name and blueprint.edn, and the stamped files agree with it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { LIB, cspFor, profileOf } from "../../scripts/build.mjs";
import { deriveIdentity, readBlueprint } from "../../scripts/identity.mjs";
import { LEGACY_TEMPLATE_FILES, SHELL_FILES, pinnedRev } from "../../scripts/init.mjs";
import { APP, REPO } from "./_app.mjs";

const meta = JSON.parse(await readFile(join(APP, "package.json"), "utf8"));
const conf = JSON.parse(await readFile(join(APP, "src-tauri/tauri.conf.json"), "utf8"));
const rev = pinnedRev(meta);

test("the package id is the one the repository name and blueprint give", async () => {
  const identity = deriveIdentity(meta.itonami.source, readBlueprint(await readFile(join(REPO, "blueprint.edn"), "utf8")));
  assert.equal(meta.itonami.id, identity.id);
  assert.equal(conf.identifier, identity.id);
  assert.equal(identity.id, `network.itonami.${identity.slug}`);
  assert.equal(conf.app.security.csp, cspFor(profileOf(meta)), "tauri.conf.json carries this lib's policy; re-run itonami-app init after a bump");
});

test("the shell files are this lib's, byte for byte", async () => {
  for (const [from, to] of SHELL_FILES) {
    const want = await readFile(join(LIB, "templates/shell", from));
    const got = await readFile(join(APP, to));
    assert.ok(got.equals(want), `app/${to} is the lib's shell file; re-run itonami-app init`);
  }
});

test("the lib is pinned by one commit SHA in package.json, Cargo.toml and the workflow", async (t) => {
  const dep = meta.devDependencies?.["@itonami/series-app"] ?? "";
  if (dep.startsWith("file:")) return t.skip("a lib fixture with a local path dependency");
  assert.match(rev ?? "", /^[0-9a-f]{40}$/, `package.json pins github:cloud-itonami/itonami-lib#<40-hex>, not ${JSON.stringify(dep)}`);
  const cargo = await readFile(join(APP, "src-tauri/Cargo.toml"), "utf8");
  for (const crate of ["itonami-series-build", "itonami-series-host"]) {
    assert.ok(cargo.includes(`${crate} = { git = "https://github.com/cloud-itonami/itonami-lib", rev = "${rev}" }`), `${crate} is pinned by rev ${rev}`);
  }
  assert.ok(!/\b(branch|tag)\s*=/.test(cargo), "no branch or tag pin");
  const lock = await readFile(join(APP, "package-lock.json"), "utf8");
  assert.ok(lock.includes(`cloud-itonami/itonami-lib.git#${rev}`), "package-lock.json resolves the same commit");
  const cargoLock = await readFile(join(APP, "src-tauri/Cargo.lock"), "utf8");
  assert.ok(cargoLock.includes(`git+https://github.com/cloud-itonami/itonami-lib?rev=${rev}#${rev}`), "Cargo.lock resolves the same commit");
  const workflow = await readFile(join(REPO, ".github/workflows/app.yml"), "utf8");
  assert.ok(workflow.includes(`uses: cloud-itonami/itonami-lib/.github/workflows/app.yml@${rev}`), "app.yml calls the reusable workflow at the same commit");
});

test("no copied template file is left", () => {
  const left = LEGACY_TEMPLATE_FILES.filter((f) => existsSync(join(APP, f)));
  assert.deepEqual(left, [], "run itonami-app init --migrate");
});
