// The repository's own src-tauri/Cargo.lock is in cargo's order and holds the app crate.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { lockOrderProblems, lockPackages } from "../../scripts/cargo-lock.mjs";
import { APP } from "./_app.mjs";

test("Cargo.lock lists its packages in cargo's own order", async (t) => {
  let text;
  try {
    text = await readFile(join(APP, "src-tauri/Cargo.lock"), "utf8");
  } catch {
    return t.skip("no src-tauri/Cargo.lock (a lib fixture with path dependencies)");
  }
  assert.match(text, /^version = 4$/m, "lock file format 4");
  const names = lockPackages(text).map((p) => p.name);
  for (const crate of ["itonami-series-app", "itonami-series-host", "itonami-series-build"]) {
    assert.ok(names.includes(crate), `${crate} is in the lock`);
  }
  assert.deepEqual(lockOrderProblems(text), []);
});
