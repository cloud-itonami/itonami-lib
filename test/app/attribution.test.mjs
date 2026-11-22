// The source line for this repository's classification (scripts/attribution.mjs)
// renders in the about view with the repository's own code, and the view
// carries no logo or imagery.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { attributionFor as linesFor } from "../../scripts/attribution.mjs";
import { deriveIdentity, readBlueprint } from "../../scripts/identity.mjs";
import { TAB_ABOUT, TAB_OVERVIEW, panelTree } from "../../src/view.js";
import { APP, REPO } from "./_app.mjs";

const texts = (tree) => {
  const out = [];
  const walk = (n) => {
    if (n.text !== undefined) out.push(n.text);
    for (const c of n.children || []) walk(c);
  };
  walk(tree);
  return out;
};
const imgs = (tree) => {
  let found = 0;
  const walk = (n) => {
    if (n.tag === "img" || n.tag === "svg" || n.tag === "picture") found += 1;
    for (const c of n.children || []) walk(c);
  };
  walk(tree);
  return found;
};

// Reads the repository's own files and does not write dist/.
async function repoData() {
  const meta = JSON.parse(await readFile(join(APP, "package.json"), "utf8"));
  const blueprint = readBlueprint(await readFile(join(REPO, "blueprint.edn"), "utf8"));
  const identity = deriveIdentity(meta.itonami.source, blueprint);
  return { identity, version: meta.version, blueprint, physics: null, console: null, sources: {}, descriptor: { operations: [] } };
}

test("the about view carries this classification's attribution with the repository's code", async () => {
  const data = await repoData();
  const { identity, blueprint } = data;
  const want = linesFor(identity.classificationKey, identity.code);
  assert.deepEqual(identity.attribution, want);
  const tree = panelTree(data, TAB_ABOUT);
  assert.equal(imgs(tree), 0, "no logo or imagery in the about view");
  assert.equal(imgs(panelTree(data, TAB_OVERVIEW)), 0);
  if (want === null) return;
  assert.equal(String(blueprint[identity.classificationKey]), identity.code, "blueprint.edn names the same code");
  const about = texts(tree);
  assert.ok(about.includes(want.ja), "ja sentence renders verbatim");
  assert.ok(about.includes(want.en), "en sentence renders verbatim");
  assert.ok(want.ja.includes(identity.code) && want.en.includes(identity.code));
});

test("the built app carries the attribution in its data", async () => {
  const { identity } = await repoData();
  const index = await readFile(join(APP, "dist/index.html"), "utf8");
  const shipped = index.includes("host.js")
    ? (await import(join(APP, "dist/host-data.js") + `?t=${Date.now()}`)).default.guest
    : await readFile(join(APP, "dist/data.js"), "utf8");
  if (identity.attribution) assert.ok(shipped.includes(JSON.stringify(identity.attribution.en).slice(1, -1)), "dist carries the en line");
  for (const logo of ["ilo-logo", "undp-logo", "emblem.svg", "emblem.png"]) assert.ok(!shipped.toLowerCase().includes(logo));
});
