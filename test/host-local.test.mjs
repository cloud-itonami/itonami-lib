// host-local storage stays unused by the lib until KOTOBA-972 (Tauri Android
// host evidence) is recorded: the build refuses it, and the lib's host never
// creates a host-local channel.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { HOST_LOCAL_ALLOWED, checkHostLocal } from "../scripts/build.mjs";

const LIB = fileURLToPath(new URL("../", import.meta.url));

test("host-local is off until KOTOBA-972 is recorded", () => {
  assert.equal(HOST_LOCAL_ALLOWED, false);
  checkHostLocal({ schema: "kotoba.app.client-runtime.v1", operations: [] });
  assert.throws(() => checkHostLocal({ "host-local": { schema: "kotoba.host-local.v1", "app-id": "x", calls: [] } }), /KOTOBA-972/);
  assert.throws(() => checkHostLocal({ operations: [{ "request-body": "host-local" }] }), /KOTOBA-972/);
  assert.throws(() => checkHostLocal({ operations: [{ "response-body": "host-local" }] }), /KOTOBA-972/);
});

test("the lib's host and guest never open a host-local channel", () => {
  for (const file of ["src/host.js", "src/guest.js", "src/app.js", "src/view.js", "src/form.js", "scripts/build.mjs"]) {
    const text = readFileSync(join(LIB, file), "utf8").replace(/^\s*(\/\/|\*).*$/gm, "");
    assert.ok(!/createClientHostLocal|hostLocal\s*:|"host-local"\s*:/.test(text), `${file} uses host-local`);
  }
  const host = readFileSync(join(LIB, "src/host.js"), "utf8");
  assert.match(host, /mountRestrictedClientApp\(\{ artifact, container, broker \}\)/, "mounted without hostLocal");
});
