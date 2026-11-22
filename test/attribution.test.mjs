// The attribution wording lives in scripts/attribution.mjs only, chosen by
// the classification key; the view shows identity.attribution and holds no
// literal. Legal's final ISCO-08 wording (AWAI-3629) and UNSPSC lines.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ATTRIBUTIONS, attributionFor } from "../scripts/attribution.mjs";
import { CLASSIFICATION_KEYS, deriveIdentity } from "../scripts/identity.mjs";
import { TAB_ABOUT, TAB_OVERVIEW, panelTree } from "../src/view.js";

const LIB = fileURLToPath(new URL("../", import.meta.url));
const ja = (code) => `職業の参照: ISCO-08（国際労働機関 ILO、2012 年）のコード ${code}。日本語の名称は当方の訳です。この app は ILO が作成・確認・推奨したものではありません。`;
const en = (code) => `Occupation reference: ISCO-08 (International Labour Organization, 2012), code ${code}. This app is not produced, reviewed or endorsed by the ILO.`;
const texts = (tree) => {
  const out = [];
  const walk = (n) => { if (n.text !== undefined) out.push(n.text); for (const c of n.children || []) walk(c); };
  walk(tree);
  return out;
};
const data = (identity) => ({ identity, version: "0.1.0", blueprint: {}, physics: null, console: null, sources: {}, descriptor: { operations: [] } });
const bp = (id, key, code) => ({ "itonami.blueprint/id": id, "itonami.blueprint/name": "Fixture", [`itonami.blueprint/${key}`]: code });

test("ISCO-08 carries Legal's final wording with the code", () => {
  assert.deepEqual(attributionFor("itonami.blueprint/isco-08", "9999"), { ja: ja("9999"), en: en("9999") });
  const identity = deriveIdentity("cloud-itonami-isco-2423", bp("cloud-itonami-isco-2423", "isco-08", "2423"));
  assert.deepEqual(identity.attribution, { ja: ja("2423"), en: en("2423") });
  const about = texts(panelTree(data({ ...identity }), TAB_ABOUT));
  assert.ok(about.includes(ja("2423")) && about.includes(en("2423")));
});

test("UNSPSC carries the source and trademark lines with its one code", () => {
  const identity = deriveIdentity("cloud-itonami-unspsc-43", bp("cloud-itonami-unspsc-43", "unspsc-segment", "43"));
  assert.match(identity.attribution.en, /^Classification reference: UNSPSC® \(United Nations Standard Products and Services Code\), code 43\. © United Nations Development Programme \(UNDP\)\. UNSPSC® is a registered trademark of UNDP\. This app is not produced, reviewed or endorsed by UNDP\.$/);
  assert.ok(identity.attribution.ja.includes("のコード 43。") && identity.attribution.ja.includes("UNSPSC® は UNDP の登録商標です。"));
  const about = texts(panelTree(data(identity), TAB_ABOUT));
  assert.ok(about.includes(identity.attribution.en));
});

test("keys without agreed wording carry none, and the overview carries none", () => {
  for (const key of ["itonami.blueprint/isic-rev4", "itonami.blueprint/isic-rev5", "itonami.blueprint/jsic-code", "itonami.blueprint/cofog"]) {
    assert.equal(attributionFor(key, "0111"), null, key);
  }
  assert.equal(attributionFor("itonami.blueprint/isco-08", ""), null);
  for (const key of Object.keys(ATTRIBUTIONS)) assert.ok(key in CLASSIFICATION_KEYS, `${key} is a classification key`);
  const identity = deriveIdentity("cloud-itonami-isic-0111", bp("cloud-itonami-isic-0111", "isic-rev5", "0111"));
  assert.equal(identity.attribution, null);
  assert.ok(!texts(panelTree(data(identity), TAB_ABOUT)).some((t) => /ILO|UNDP/.test(t)));
  const isco = deriveIdentity("cloud-itonami-isco-2423", bp("cloud-itonami-isco-2423", "isco-08", "2423"));
  assert.ok(!texts(panelTree(data(isco), TAB_OVERVIEW)).some((t) => t.includes("not produced, reviewed or endorsed")));
});

test("the wording is in one place: no other lib file holds it", () => {
  const files = [];
  const walk = (dir) => {
    for (const e of readdirSync(join(LIB, dir), { withFileTypes: true })) {
      const rel = join(dir, e.name);
      if (e.isDirectory()) walk(rel);
      else if (/\.(mjs|js|html|css|kt|rs|txt|tmpl)$/.test(e.name)) files.push(rel);
    }
  };
  for (const dir of ["scripts", "src", "templates", "android", "crates", "bin"]) walk(dir);
  for (const file of files) {
    if (file === join("scripts", "attribution.mjs")) continue;
    const text = readFileSync(join(LIB, file), "utf8");
    assert.ok(!text.includes("not produced, reviewed or endorsed"), `${file} holds attribution wording`);
    assert.ok(!text.includes("作成・確認・推奨"), `${file} holds attribution wording`);
  }
});

test("the lib ships no logo or emblem image", () => {
  const images = [];
  const walk = (dir) => {
    for (const e of readdirSync(join(LIB, dir), { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(dir, e.name));
      else if (/\.(png|jpe?g|gif|webp|svg|ico|icns)$/i.test(e.name)) images.push(join(dir, e.name));
    }
  };
  for (const dir of ["src", "vendor", "templates", "android", "scripts"]) walk(dir);
  assert.deepEqual(images, []);
});
