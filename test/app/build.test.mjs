// The static build pins every source by digest and serves only local files.
// These checks run against the repository's own files.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { build, cspFor } from "../../scripts/build.mjs";
import { APP } from "./_app.mjs";

const hex = /^[0-9a-f]{64}$/;

test("build pins identity, sources and output files", async () => {
  const { identity, release, data } = await build(APP);
  assert.equal(release.schema, "awai.app.artifact.v1");
  assert.equal(release.id, identity.id);
  assert.equal(release.source, identity.source);
  assert.equal(release.version, data.version);
  assert.ok(hex.test(release.sources["blueprint.edn"]), "blueprint digest is pinned");
  for (const [name, digest] of Object.entries(release.files)) {
    assert.ok(hex.test(digest), `${name} digest is pinned`);
  }
  assert.deepEqual(data.descriptor.operations, []);
  assert.equal(release.profile, data.descriptor.profile);
  // Each profile ships its own vendored runtime; check against that one.
  const runtime = data.descriptor.profile === "restricted-wasm-v1" ? "restricted-wasm-v1/" : "";
  const { clientRuntimeProblems } = await import(`../../vendor/${runtime}kotoba-client-runtime.js`);
  assert.deepEqual(
    clientRuntimeProblems(data.descriptor, [], "tauri://localhost"),
    [],
    "the shipped descriptor must satisfy the vendored broker",
  );
  const index = await readFile(join(APP, "dist/index.html"), "utf8");
  assert.ok(!index.includes("{{"), "no unfilled placeholder ships");
  assert.ok(index.includes(`content="${cspFor(data.descriptor.profile)}"`), "the page carries the exact CSP");
  for (const tag of index.matchAll(/<script\b[^>]*>/gi)) {
    assert.ok(/src=/.test(tag[0]), `no inline script ships: ${tag[0]}`);
  }
  assert.ok(!/<style[\s>]/i.test(index), "no inline style block ships");
  assert.ok(!/\sstyle\s*=/i.test(index), "no inline style attribute ships");
});

test("release.json keeps its shape (awai-os series-catalog reads it)", async () => {
  const { release } = await build(APP);
  const keys = ["schema", "id", "source", "version", "tauri", "profile", "runtimePins", "sources", "files", ...(release.guest ? ["guest"] : []), "source_commit", "dirty"];
  assert.deepEqual(Object.keys(release), keys);
});
