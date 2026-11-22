// The repository's operator-console sample keeps the shape the view reads.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { extractConsole } from "../../scripts/console.mjs";
import { REPO } from "./_app.mjs";

test("repository sample keeps the console shape", async (t) => {
  const sample = join(REPO, "docs/samples/operator-console.html");
  if (!existsSync(sample)) {
    t.skip("no operator-console sample in this repository");
    return;
  }
  const console = extractConsole(await readFile(sample, "utf8"));
  assert.ok(console, "sample must hold at least one console section");
  assert.equal(typeof console.title, "string");
  assert.ok(console.sections.length >= 1);
  for (const section of console.sections) {
    assert.ok(section.heading.length > 0, "every section names its heading");
    assert.ok(Array.isArray(section.notes) && Array.isArray(section.tables));
    for (const table of section.tables) {
      assert.ok(Array.isArray(table.columns) && Array.isArray(table.rows));
      for (const row of table.rows) {
        for (const cell of row) {
          assert.equal(typeof cell.text, "string");
          assert.ok(cell.tone === undefined || ["ok", "warn", "critical"].includes(cell.tone));
        }
      }
    }
  }
});
