// The bump script's argument, repository-list and test-count handling (it is
// run for real only on the repositories it is given; see README).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { COLUMNS, counts, parseArgs, readRepos } from "../scripts/bump-series.mjs";

const SHA = "0123456789abcdef0123456789abcdef01234567";

test("the lib pin must be a commit SHA", () => {
  assert.throws(() => parseArgs(["--lib", "v0.1.0", "--repos", "a", "--results", "r.tsv"]), /40-hex commit SHA/);
  assert.throws(() => parseArgs(["--lib", "main", "--repos", "a", "--results", "r.tsv"]), /40-hex commit SHA/);
  assert.throws(() => parseArgs(["--lib", SHA, "--results", "r.tsv"]), /--repos/);
  assert.throws(() => parseArgs(["--lib", SHA, "--repos", "a"]), /--results/);
  const o = parseArgs(["--lib", SHA, "--repos", "a", "--results", "r.tsv", "--dry-run", "--pace", "0"]);
  assert.equal(o.dryRun, true);
  assert.equal(o.pace, 0);
});

test("repositories come from a file or a comma list, owner removed", async (t) => {
  assert.deepEqual(readRepos("cloud-itonami/a,b"), ["a", "b"]);
  const dir = await mkdtemp(join(tmpdir(), "itonami-bump-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, "canary.txt"), "# canary\napp-itonami-cloud-itonami-isco-2423\n\ncloud-itonami/app-itonami-cloud-itonami-isco-3333 # second\n");
  assert.deepEqual(readRepos(join(dir, "canary.txt")), ["app-itonami-cloud-itonami-isco-2423", "app-itonami-cloud-itonami-isco-3333"]);
});

test("test counts and the TSV columns", () => {
  assert.deepEqual(counts("ℹ tests 3\nℹ pass 3\nℹ fail 0\n"), { pass: 3, fail: 0 });
  assert.deepEqual(counts("ℹ pass 2\nℹ fail 1\nℹ pass 4\nℹ fail 0\n"), { pass: 6, fail: 1 });
  for (const c of ["repo", "lib_sha", "id_before", "id_after", "id_unchanged", "tests_pass", "tests_fail", "result", "pr"]) assert.ok(COLUMNS.includes(c));
});
