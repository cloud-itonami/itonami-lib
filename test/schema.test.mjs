// The blueprint schema the lib defines (plan, 2026-11-22): one classification
// key per repository, the package id stable and independent of the edition,
// no deprecated SPDX id for a new app, and no named list for UNSPSC.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { isExisting } from "../scripts/build.mjs";
import { CLASSIFICATION_KEYS, deriveIdentity, readBlueprint } from "../scripts/identity.mjs";
import { DEPRECATED_SPDX, checkLicense, deprecatedIds } from "../scripts/license.mjs";

const LIB = fileURLToPath(new URL("../", import.meta.url));
const bp = (id, fields) => ({ "itonami.blueprint/id": id, "itonami.blueprint/name": "Fixture", ...fields });

test("exactly one classification key per blueprint", () => {
  assert.throws(() => deriveIdentity("cloud-itonami-isic-5820", bp("cloud-itonami-isic-5820", {})), /no classification key/);
  assert.throws(() => deriveIdentity("cloud-itonami-isic-5820", bp("cloud-itonami-isic-5820", { "itonami.blueprint/isic-rev4": "5820", "itonami.blueprint/isic-rev5": "5820" })), /more than one classification key/);
  assert.throws(() => deriveIdentity("cloud-itonami-isic-5820", bp("cloud-itonami-isic-5820", { "itonami.blueprint/isco-08": "5820" })), /is for isco/);
  assert.throws(() => deriveIdentity("cloud-itonami-isic-5820", bp("cloud-itonami-isic-5820", { "itonami.blueprint/isic-rev4": "5821" })), /does not match/);
  const keys = Object.keys(CLASSIFICATION_KEYS);
  assert.deepEqual(new Set(keys.map((k) => CLASSIFICATION_KEYS[k].scheme)), new Set(["isic", "isco", "jsic", "cofog", "unspsc"]));
  for (const k of keys) assert.match(k, /^itonami\.blueprint\/[a-z0-9-]+$/);
});

test("the package id follows from the repository name: stable, and the same for either ISIC edition", () => {
  const rev4 = deriveIdentity("cloud-itonami-isic-5820", bp("cloud-itonami-isic-5820", { "itonami.blueprint/isic-rev4": "5820" }));
  const rev5 = deriveIdentity("cloud-itonami-isic-5820", bp("cloud-itonami-5820", { "itonami.blueprint/isic-rev5": "5820" }));
  assert.equal(rev4.id, "network.itonami.isic5820");
  assert.equal(rev5.id, rev4.id, "fixing the edition never changes the id");
  assert.notEqual(rev4.classification, rev5.classification);
  const text = '[{:itonami.blueprint/id "cloud-itonami-isco-2423" :itonami.blueprint/name "Community Careers Practice" :itonami.blueprint/isco-08 "2423" :itonami.blueprint/license "AGPL-3.0-or-later"}]';
  const ids = new Set(Array.from({ length: 5 }, () => deriveIdentity("cloud-itonami-isco-2423", readBlueprint(text)).id));
  assert.deepEqual([...ids], ["network.itonami.isco2423"], "the same blueprint gives the same id every time");
  assert.equal(deriveIdentity("app-itonami-cloud-itonami-isco-2423", readBlueprint(text)).id, "network.itonami.isco2423");
});

test("a new app may not use a deprecated SPDX id; an existing app is not refused", () => {
  for (const id of ["AGPL-3.0", "GPL-2.0", "GPL-3.0+", "LGPL-2.1"]) assert.ok(DEPRECATED_SPDX.has(id));
  assert.deepEqual(deprecatedIds("AGPL-3.0"), ["AGPL-3.0"]);
  assert.deepEqual(deprecatedIds("(MIT OR GPL-2.0) AND Apache-2.0"), ["GPL-2.0"]);
  assert.deepEqual(deprecatedIds("AGPL-3.0-or-later"), []);
  assert.deepEqual(deprecatedIds("AGPL-3.0-only"), []);
  assert.throws(() => checkLicense({ "itonami.blueprint/license": "AGPL-3.0" }, { existing: false }), /deprecated SPDX id AGPL-3.0/);
  checkLicense({ "itonami.blueprint/license": "AGPL-3.0-or-later" }, { existing: false });
  checkLicense({}, { existing: false });
  // "Existing" is the 2026-11-22 list only. An existing app with "AGPL-3.0" still builds.
  assert.ok(isExisting("cloud-itonami-isic-6491"));
  checkLicense({ "itonami.blueprint/license": "AGPL-3.0" }, { existing: isExisting("cloud-itonami-isic-6491") });
  // isic-649, isic-5820 and isic-6202 use "AGPL-3.0" today and are not on the list
  // (they got blueprint.edn after the audit), so they count as new and are refused
  // until the owner picks -only or -or-later (Legal item 110, AWAI-500).
  for (const source of ["cloud-itonami-isic-649", "cloud-itonami-isic-5820", "cloud-itonami-isic-6202", "cloud-itonami-isco-9999"]) {
    assert.ok(!isExisting(source), `${source} is not on the existing list`);
    assert.throws(() => checkLicense({ "itonami.blueprint/license": "AGPL-3.0" }, { existing: isExisting(source) }), /deprecated/);
  }
});

test("UNSPSC: one app, one code; the lib holds no named list and no UNDP emblem", () => {
  const files = [];
  const walk = (dir) => {
    for (const e of readdirSync(join(LIB, dir), { withFileTypes: true })) {
      const rel = join(dir, e.name);
      if (e.isDirectory()) walk(rel);
      else files.push(rel);
    }
  };
  for (const dir of ["scripts", "src", "vendor", "templates", "android", "crates", "bin", "test"]) walk(dir);
  for (const file of files) {
    assert.ok(!/segments?\.(csv|json|edn)$/i.test(file), `${file} looks like a segment list`);
    assert.ok(!/undp|emblem/i.test(file), `${file} looks like a UNDP emblem`);
    if (statSync(join(LIB, file)).size > 4 << 20) continue;
    const text = readFileSync(join(LIB, file), "utf8");
    // A named list is several "<2 or 8 digit code><sep><name>" rows of UNSPSC; one fixture code is fine.
    const rows = text.split("\n").filter((l) => /^\s*"?\d{2}(\d{6})?"?\s*[,\t:]\s*"?[A-Z][A-Za-z ,&-]{3,}/.test(l));
    assert.ok(!(/unspsc/i.test(text) && rows.length > 1), `${file} has a named code list (${rows.length} rows)`);
  }
  const { level } = deriveIdentity("cloud-itonami-unspsc-43", bp("cloud-itonami-unspsc-43", { "itonami.blueprint/unspsc-segment": "43" }));
  assert.equal(level, "segment");
  assert.throws(() => deriveIdentity("cloud-itonami-unspsc-4321", bp("cloud-itonami-unspsc-4321", { "itonami.blueprint/unspsc-segment": "4321" })), /no known UNSPSC level/);
});
