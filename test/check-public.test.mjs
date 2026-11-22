// The public-repository scan finds secrets and internal URLs, and this repository has none.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { checkRepo, scan } from "../scripts/check-public.mjs";

const LIB = fileURLToPath(new URL("../", import.meta.url));
// Fixtures are built from parts so this file itself never matches.
const j = (...p) => p.join("");

test("secrets and internal URLs are found", () => {
  const cases = [
    j("-----BEGIN ", "OPENSSH PRIVATE KEY-----"),
    j("AKIA", "ABCDEFGHIJKLMNOP"),
    j("ghp", "_", "a".repeat(36)),
    j("token = ", "'", "ghs", "_", "b".repeat(36), "'"),
    j("api_key", ": \"", "s3cr3tvalue1", "\""),
    j("https://", "user:pw", "@example.com/x"),
    j("http://", "192.168.", "1.20:8080/"),
    j("build.", "corp", ".internal"),
    j("http://", "localhost", ":3000"),
    j("/Users", "/someone/github/x"),
    j("https://", "linear.app", "/team/issue/X-1"),
  ];
  for (const text of cases) assert.ok(scan(text).length > 0, `found: ${text}`);
});

test("the platform's own origins are not hits", () => {
  assert.deepEqual(scan("connect-src ipc: http://ipc.localhost; img-src 'self'"), []);
  assert.deepEqual(scan('<manifest xmlns:tools="http://schemas.android.com/tools">'), []);
  assert.deepEqual(scan("https://github.com/cloud-itonami/itonami-lib"), []);
});

test("this repository has no hit", () => {
  const { files, hits } = checkRepo(LIB);
  assert.ok(files > 10);
  assert.deepEqual(hits, []);
});

test("only vendored files that match their pin are skipped", async () => {
  const { pinnedVendor } = await import("../scripts/check-public.mjs");
  assert.equal(pinnedVendor(LIB).size, 4);
});
