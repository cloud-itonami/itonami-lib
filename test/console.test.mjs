// The console reader turns the operator-console sample into plain data.
// Inline fixtures pin the mapping; the repository's own sample is checked
// structurally so the test passes unchanged in every series repository.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { extractConsole } from "../scripts/console.mjs";

const APP = fileURLToPath(new URL("../", import.meta.url));

const FIXTURE = `<html><body>
<h1>Sample Console</h1><span class="badge">demo</span>
<section><h2>First</h2><p>Note <b>one</b> &amp; two.</p>
<table><thead><tr><th>name</th><th>state</th></tr></thead>
<tbody><tr><td>alpha</td><td><span class="ok">fine</span></td></tr>
<tr><td>beta</td><td><span class="warn">slow</span></td></tr>
<tr><td>gamma</td><td><span class="critical">down</span></td></tr></tbody></table></section>
<section><h2>Empty</h2></section>
</body></html>`;

test("fixture maps to plain data with tones", () => {
  const console = extractConsole(FIXTURE);
  assert.equal(console.title, "Sample Console");
  assert.equal(console.badge, "demo");
  assert.equal(console.sections.length, 2);
  const [first, empty] = console.sections;
  assert.equal(first.heading, "First");
  assert.deepEqual(first.notes, ["Note one & two."]);
  assert.deepEqual(first.tables[0].columns, ["name", "state"]);
  assert.deepEqual(first.tables[0].rows, [
    [{ text: "alpha" }, { text: "fine", tone: "ok" }],
    [{ text: "beta" }, { text: "slow", tone: "warn" }],
    [{ text: "gamma" }, { text: "down", tone: "critical" }],
  ]);
  assert.deepEqual(empty.notes, []);
  assert.deepEqual(empty.tables, []);
});

test("html without a console section reads as null", () => {
  assert.equal(extractConsole("<html><body><p>no sections</p></body></html>"), null);
});

const FLAT_FIXTURE = `<html><body>
<h1>Flat Console</h1>
<div class="dads-notification-banner"><h2 class="dads-notification-banner__heading">About this screen</h2><div class="dads-notification-banner__body"><p>Disclosure of the <code>real</code> graph.</p></div></div>
<h2>Entities</h2>
<table><thead><tr><th>id</th><th>class</th></tr></thead>
<tbody><tr><td>r-1</td><td class="critical">HARD</td></tr>
<tr><td>r-2</td><td class="muted">quiet</td></tr></tbody></table>
<h2>Gate</h2>
<table><thead><tr><th>rule</th><th>state</th></tr></thead>
<tbody><tr><td>no-officer</td><td class="warn"><span class="critical">held</span></td></tr></tbody></table>
<p>Trailing note &amp; more.</p>
</body></html>`;

test("section-less body reads headings, tables, notes, and banner text", () => {
  const flat = extractConsole(FLAT_FIXTURE);
  assert.equal(flat.title, "Flat Console");
  assert.equal(flat.sections.length, 3);
  const [banner, entities, gate] = flat.sections;
  assert.equal(banner.heading, "About this screen");
  assert.deepEqual(banner.notes, ["Disclosure of the real graph."]);
  assert.deepEqual(banner.tables, []);
  assert.equal(entities.heading, "Entities");
  assert.deepEqual(entities.notes, []);
  assert.deepEqual(entities.tables[0].columns, ["id", "class"]);
  assert.deepEqual(entities.tables[0].rows, [
    [{ text: "r-1" }, { text: "HARD", tone: "critical" }],
    [{ text: "r-2" }, { text: "quiet" }],
  ]);
  assert.equal(gate.heading, "Gate");
  assert.deepEqual(gate.notes, ["Trailing note & more."]);
  assert.deepEqual(gate.tables[0].columns, ["rule", "state"]);
  assert.deepEqual(gate.tables[0].rows, [[{ text: "no-officer" }, { text: "held", tone: "critical" }]]);
});

test("body with a title but no section or heading reads as null", () => {
  assert.equal(extractConsole("<html><body><h1>Lonely</h1><p>no headings</p></body></html>"), null);
});
