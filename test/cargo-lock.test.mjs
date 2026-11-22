// The Cargo.lock order check (scripts/cargo-lock.mjs) on fixtures. The check of
// a repository's own lock is test/app/cargo-lock.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { lockOrderProblems } from "../scripts/cargo-lock.mjs";

test("the order check sees a package out of place and accepts versions in semver order", () => {
  const lock = (...names) => names.map(([n, v]) => `[[package]]\nname = "${n}"\nversion = "${v}"\n`).join("\n");
  assert.deepEqual(lockOrderProblems(lock(["itoa", "1.0.0"], ["javascriptcore-rs", "1.1.2"], ["zerofrom", "0.1.8"])), []);
  assert.deepEqual(lockOrderProblems(lock(["itoa", "1.0.0"], ["zerofrom", "0.1.8"], ["itonami-series-app", "0.1.0"])), ["itonami-series-app 0.1.0 comes after zerofrom 0.1.8"]);
  assert.deepEqual(lockOrderProblems(lock(["syn", "1.0.109"], ["syn", "2.0.9"], ["syn", "2.0.10"])), []);
  assert.deepEqual(lockOrderProblems(lock(["x", "1.0.0-alpha.6"], ["x", "1.0.0"])), []);
  assert.equal(lockOrderProblems(lock(["x", "2.0.10"], ["x", "2.0.9"])).length, 1);
});
