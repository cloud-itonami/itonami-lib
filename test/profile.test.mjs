// Client runtime profiles (KOTOBA-159, owner decision 2026-11-22): a new
// series app gets restricted-wasm-v1; trusted-page-v1 builds only for an
// existing app in scripts/trusted-page-v1-existing.txt, through 2027-03-31.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build, cspFor, guestPreamble, guestScript, guestStyle } from "../scripts/build.mjs";
import { init } from "../scripts/init.mjs";
import { fileURLToPath } from "node:url";

const LIB = fileURLToPath(new URL("../", import.meta.url));
import { clientRuntimeProblems, verifyClientArtifact } from "../vendor/restricted-wasm-v1/kotoba-client-runtime.js";

const ENV = { ITONAMI_SOURCE_COMMIT: "0123456789abcdef0123456789abcdef01234567", ITONAMI_SOURCE_DIRTY: "false" };
const NOW = new Date("2026-11-22T00:00:00Z");
const hash = (text) => `'sha256-${createHash("sha256").update(text, "utf8").digest("base64")}'`;

// A temporary repository outside any git checkout, given its app by `itonami-app init`.
async function stamp(t, source, name) {
  const repo = await mkdtemp(join(tmpdir(), "itonami-profile-"));
  t.after(() => rm(repo, { recursive: true, force: true }));
  const [, scheme, code] = /^cloud-itonami-([a-z]+)-([^-]+)/.exec(source);
  const key = { isco: "isco-08", isic: "isic-rev5", cofog: "cofog", jsic: "jsic-code", unspsc: "unspsc-segment" }[scheme];
  await writeFile(join(repo, "blueprint.edn"), `[{:itonami.blueprint/id "${source}"\n  :itonami.blueprint/name "${name}"\n  :itonami.blueprint/${key} "${code}"}]\n`);
  await init(repo, { icons: false, repo: source, libPath: LIB });
  return join(repo, "app");
}

async function setRuntime(app, runtime) {
  const file = join(app, "package.json");
  const pkg = JSON.parse(await readFile(file, "utf8"));
  if (runtime === undefined) delete pkg.itonami.runtime;
  else pkg.itonami.runtime = runtime;
  await writeFile(file, JSON.stringify(pkg, null, 2) + "\n");
}

test("a new app from init gets restricted-wasm-v1 and builds a sandboxed guest", async (t) => {
  const app = await stamp(t, "cloud-itonami-isco-9999", "New Series App");
  const pkg = JSON.parse(await readFile(join(app, "package.json"), "utf8"));
  assert.equal(pkg.itonami.runtime, "restricted-wasm-v1");
  const conf = JSON.parse(await readFile(join(app, "src-tauri/tauri.conf.json"), "utf8"));
  const csp = cspFor("restricted-wasm-v1");
  assert.equal(conf.app.security.csp, csp);

  const { release, data } = await build(app, ENV, { now: NOW });
  assert.equal(data.descriptor.profile, "restricted-wasm-v1");
  assert.deepEqual(data.descriptor["local-state"], { adapter: "memory", schema: "itonami.series.isco9999.v1", version: 1 });
  assert.deepEqual(data.descriptor.operations, []);
  assert.deepEqual(clientRuntimeProblems(data.descriptor, [], "tauri://localhost"), []);
  assert.equal(release.profile, "restricted-wasm-v1");
  assert.equal(release.runtimePins.revision, "715b8e5f5caadbc9aee9c04c1b2471006ffcf666");
  assert.equal(release.runtimePins.files["restricted-wasm-v1/kotoba-client-runtime.js"], "3e2bc61e8ce544d4cc12fbf7f893be4f7f0367be00e2e3d4ebdee5c3bb410367");
  assert.ok(!("app.js" in release.files) && !("data.js" in release.files), "the trusted-page entry does not ship");

  // The host page: no inline script or style, and the exact policy.
  const index = await readFile(join(app, "dist/index.html"), "utf8");
  assert.ok(index.includes(`content="${csp}"`));
  for (const tag of index.matchAll(/<script\b[^>]*>/gi)) assert.ok(/src=/.test(tag[0]), `no inline script in the host: ${tag[0]}`);
  assert.ok(!/<style[\s>]/i.test(index));
  const vendored = await readFile(join(app, "dist/vendor/kotoba-client-runtime.js"));
  assert.equal(createHash("sha256").update(vendored).digest("hex"), "3e2bc61e8ce544d4cc12fbf7f893be4f7f0367be00e2e3d4ebdee5c3bb410367");

  // The guest: verified by the canonical runtime against the pinned digest and commit.
  const { default: host } = await import(join(app, "dist/host-data.js"));
  assert.deepEqual(host.descriptor, data.descriptor);
  assert.deepEqual(host.artifact, release.guest);
  assert.equal(host.artifact.revision, ENV.ITONAMI_SOURCE_COMMIT);
  const artifact = await verifyClientArtifact(new TextEncoder().encode(host.guest), host.artifact);
  assert.equal(artifact.verified, true);
  await assert.rejects(verifyClientArtifact(new TextEncoder().encode(host.guest.slice(0, -1) + "x"), host.artifact), /digest mismatch/);

  // Every inline script and style the guest runs is admitted by hash, and nothing else.
  const scripts = [...host.guest.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  const executable = scripts.filter(([, attrs]) => !/type="application\/json"/.test(attrs));
  assert.equal(executable.length, 1);
  assert.equal(executable[0][2], guestScript());
  assert.ok(csp.includes(hash(executable[0][2])) && csp.includes(hash(guestPreamble())));
  const styles = [...host.guest.matchAll(/<style>([\s\S]*?)<\/style>/gi)];
  assert.equal(styles.length, 1);
  assert.ok(csp.includes(hash(styles[0][1])) && styles[0][1] === guestStyle());
  assert.ok(!/localStorage/.test(executable[0][2].replace(/^\s*\/\/.*$/gm, "")), "the guest does not touch localStorage");
  const json = scripts.find(([, attrs]) => /type="application\/json"/.test(attrs))[2];
  assert.ok(!json.includes("<"), "the data block cannot close its script element");
  assert.deepEqual(JSON.parse(json), data);
});

test("a re-stamp keeps the existing profile", async (t) => {
  const app = await stamp(t, "cloud-itonami-isco-2423", "Community Careers Practice");
  await setRuntime(app, undefined);
  await init(join(app, ".."), { icons: false, repo: "cloud-itonami-isco-2423", libPath: LIB });
  let pkg = JSON.parse(await readFile(join(app, "package.json"), "utf8"));
  assert.equal(pkg.itonami.runtime, "trusted-page-v1", "an app from before the field stays on trusted-page-v1");
  const conf = JSON.parse(await readFile(join(app, "src-tauri/tauri.conf.json"), "utf8"));
  assert.equal(conf.app.security.csp, cspFor("trusted-page-v1"));
  await setRuntime(app, "restricted-wasm-v1");
  await init(join(app, ".."), { icons: false, repo: "cloud-itonami-isco-2423", libPath: LIB });
  pkg = JSON.parse(await readFile(join(app, "package.json"), "utf8"));
  assert.equal(pkg.itonami.runtime, "restricted-wasm-v1");
});

test("an allow-listed existing app still builds with trusted-page-v1", async (t) => {
  const app = await stamp(t, "cloud-itonami-isco-2423", "Community Careers Practice");
  await setRuntime(app, undefined);
  await init(join(app, ".."), { icons: false, repo: "cloud-itonami-isco-2423", libPath: LIB });
  const { release, data } = await build(app, ENV, { now: NOW });
  assert.equal(data.descriptor.profile, "trusted-page-v1");
  assert.equal(data.descriptor["local-state"].adapter, "localstorage");
  assert.equal(release.runtimePins.revision, "4463ae792c478eef5faf911166a3e74ba2626fc8", "existing apps keep their vendored runtime");
  assert.ok("app.js" in release.files && "data.js" in release.files);
  await build(app, ENV, { now: new Date("2027-03-31T23:59:59Z") });
});

test("trusted-page-v1 fails for an app that is not listed, and for every app after 2027-03-31", async (t) => {
  const fresh = await stamp(t, "cloud-itonami-isco-9999", "New Series App");
  await setRuntime(fresh, "trusted-page-v1");
  await assert.rejects(build(fresh, ENV, { now: NOW }), /not an existing series app/);

  const listed = await stamp(t, "cloud-itonami-isco-2423", "Community Careers Practice");
  await setRuntime(listed, "trusted-page-v1");
  await init(join(listed, ".."), { icons: false, repo: "cloud-itonami-isco-2423", libPath: LIB });
  await assert.rejects(build(listed, ENV, { now: new Date("2027-04-01T00:00:00Z") }), /accepted through 2027-03-31/);

  await setRuntime(fresh, "trusted-page-v2");
  await assert.rejects(build(fresh, ENV, { now: NOW }), /itonami\.runtime is "trusted-page-v2"/);
});

test("restricted-wasm-v1 needs the source commit for its guest pin", async (t) => {
  const app = await stamp(t, "cloud-itonami-isco-9999", "New Series App");
  await assert.rejects(build(app, {}, { now: NOW }), /pins the guest to its source commit/);
});
