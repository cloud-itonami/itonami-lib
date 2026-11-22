// release.json records the commit of this checkout and a boolean dirty.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { build, sourceState } from "../../scripts/build.mjs";
import { APP, REPO } from "./_app.mjs";

const COMMIT = /^[0-9a-f]{40}$/;

test("release.json records this checkout's commit and a boolean dirty", async (t) => {
  const here = sourceState(REPO, {});
  if (here.source_commit === null) return t.skip("the repository is not a git checkout");
  const { release } = await build(APP, {});
  assert.ok(COMMIT.test(release.source_commit), "source_commit is 40 hex");
  assert.equal(release.source_commit, execFileSync("git", ["-C", REPO, "rev-parse", "HEAD"], { encoding: "utf8" }).trim());
  assert.equal(typeof release.dirty, "boolean");
  const written = JSON.parse(await readFile(join(APP, "dist/release.json"), "utf8"));
  assert.equal(written.source_commit, release.source_commit);
  assert.equal(written.dirty, release.dirty);
  for (const key of ["schema", "id", "source", "version", "tauri", "runtimePins", "sources", "files"]) {
    assert.ok(key in written, `${key} is kept`);
  }
});
