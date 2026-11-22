// Identity comes from the repository name; the blueprint id is checked
// against it, never trusted for naming. Every name below is an inline
// fixture except the refusal shapes, which hold for all series repositories.
import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveIdentity, parseSource, readBlueprint } from "../scripts/identity.mjs";

// The classification key defaults to the one the source's scheme uses.
const KEY = { isco: "isco-08", isic: "isic-rev5", cofog: "cofog", jsic: "jsic-code", unspsc: "unspsc-segment" };
const classOf = (id) => {
  const m = /^cloud-itonami-(?:(isco|isic|cofog|jsic|unspsc)-)?([0-9A-Za-z.]+)/.exec(id);
  return m ? `\n  :itonami.blueprint/${KEY[m[1] || "isic"]} "${m[2]}"` : "";
};
const edn = (id, name, cls = classOf(id)) => `[{:itonami.blueprint/id "${id}"\n  :itonami.blueprint/name "${name}"${cls}}]`;
const plain = (source, name, extra = {}) => ({
  "itonami.blueprint/id": source,
  "itonami.blueprint/name": name,
  ...(source.includes("isco-") ? { "itonami.blueprint/isco-08": source.split("-").pop() } : {}),
  ...extra,
});

const ROWS = [
  {
    // 585 repositories: blueprint id equals the repository name.
    source: "cloud-itonami-isco-2423",
    blueprint: "cloud-itonami-isco-2423",
    scheme: "isco",
    code: "2423",
    variant: null,
    slug: "isco2423",
    classification: "ISCO-08 unit group 2423",
  },
  {
    // 88 repositories: blueprint id omits the scheme part.
    source: "cloud-itonami-isic-7810",
    blueprint: "cloud-itonami-7810",
    scheme: "isic",
    code: "7810",
    variant: null,
    slug: "isic7810",
    classification: "ISIC Rev.5 class 7810",
  },
  {
    // 2 repositories: equal blueprint id, with a suffix.
    source: "cloud-itonami-isic-8411-electoral",
    blueprint: "cloud-itonami-isic-8411-electoral",
    scheme: "isic",
    code: "8411",
    variant: "electoral",
    slug: "isic8411electoral",
    classification: "ISIC Rev.5 class 8411",
  },
  {
    // 1 repository: scheme missing from the blueprint id, with a suffix.
    source: "cloud-itonami-isic-8129-facade",
    blueprint: "cloud-itonami-8129-facade",
    scheme: "isic",
    code: "8129",
    variant: "facade",
    slug: "isic8129facade",
    classification: "ISIC Rev.5 class 8129",
  },
];

for (const row of ROWS) {
  test(`${row.source} gives its own identity`, () => {
    const identity = deriveIdentity(row.source, readBlueprint(edn(row.blueprint, "Some Series Title")));
    assert.equal(identity.source, row.source);
    assert.equal(identity.scheme, row.scheme);
    assert.equal(identity.code, row.code);
    assert.equal(identity.variant, row.variant);
    assert.equal(identity.slug, row.slug);
    assert.equal(identity.id, `network.itonami.${row.slug}`);
    assert.equal(identity.title, "Some Series Title");
    assert.equal(identity.productName, "Some Series Title");
    assert.equal(identity.classification, row.classification);
    assert.equal(identity.stateSchema, `itonami.series.${row.slug}.v1`);
  });
}

test("the app-itonami- prefix is accepted and strips to the canonical source", () => {
  const identity = deriveIdentity(
    "app-itonami-cloud-itonami-isco-2423",
    readBlueprint(edn("cloud-itonami-isco-2423", "Community Careers Practice")),
  );
  assert.equal(identity.source, "cloud-itonami-isco-2423");
  assert.equal(identity.scheme, "isco");
  assert.equal(identity.code, "2423");
  assert.equal(identity.variant, null);
  assert.equal(identity.slug, "isco2423");
  assert.equal(identity.id, "network.itonami.isco2423");
  assert.equal(identity.classification, "ISCO-08 unit group 2423");
});

test("cofog code with a dot loses the dot in slug and id", () => {
  const identity = deriveIdentity(
    "cloud-itonami-cofog-03.2",
    readBlueprint(edn("cloud-itonami-cofog-03.2", "Household Consumption")),
  );
  assert.equal(identity.scheme, "cofog");
  assert.equal(identity.code, "03.2");
  assert.equal(identity.variant, null);
  assert.equal(identity.slug, "cofog032");
  assert.equal(identity.id, "network.itonami.cofog032");
  assert.equal(identity.classification, "COFOG group 03.2");
  assert.equal(identity.stateSchema, "itonami.series.cofog032.v1");
});

test("names with / or : keep the verbatim title and sanitize productName", () => {
  const cases = [
    {
      name: "Mine/Quarry-Site Scheduling & Logistics Coordination Service",
      productName: "Mine Quarry-Site Scheduling & Logistics Coordination Service",
    },
    { name: "Research Support: Biology", productName: "Research Support Biology" },
    { name: "Storage (terminal/depot)", productName: "Storage (terminal depot)" },
  ];
  for (const { name, productName } of cases) {
    const identity = deriveIdentity(
      "cloud-itonami-isco-2423",
      readBlueprint(edn("cloud-itonami-isco-2423", name)),
    );
    assert.equal(identity.title, name);
    assert.equal(identity.productName, productName);
  }
});

test("every reserved character becomes a space and runs collapse", () => {
  const identity = deriveIdentity(
    "cloud-itonami-isco-2423",
    plain("cloud-itonami-isco-2423", '  A\\B/C:D*E?F"G<H>I|J  K  '),
  );
  assert.equal(identity.title, 'A\\B/C:D*E?F"G<H>I|J  K');
  assert.equal(identity.productName, "A B C D E F G H I J K");
});

test("control characters or an empty productName still fail closed", () => {
  const bad = (name) => () => deriveIdentity(
    "cloud-itonami-isco-2423",
    plain("cloud-itonami-isco-2423", name),
  );
  assert.throws(bad("a\nd"), /not usable as a product name/);
  assert.throws(bad("a\td"), /not usable as a product name/);
  assert.throws(bad("///"), /not usable as a product name/);
  assert.throws(bad("  : *?  "), /not usable as a product name/);
});

test("refusals fail closed instead of guessing a name", () => {
  // Blueprint id of another repository: the error names both values.
  assert.throws(
    () => deriveIdentity("cloud-itonami-isco-2423", readBlueprint(edn("cloud-itonami-isco-2424", "Other"))),
    (err) => err.message.includes("cloud-itonami-isco-2424") && err.message.includes("cloud-itonami-isco-2423"),
  );
  // Blueprint id with the suffix dropped is not the scheme-less form.
  assert.throws(
    () => deriveIdentity(
      "cloud-itonami-isic-8411-electoral",
      readBlueprint(edn("cloud-itonami-8411", "Other")),
    ),
    /does not match repository source/,
  );
  // Unknown scheme.
  assert.throws(() => deriveIdentity("cloud-itonami-foo-1", readBlueprint(edn("cloud-itonami-foo-1", "Whatever"))), /not a classification-series/);
  assert.throws(() => parseSource("cloud-itonami-foo-1"), /not a classification-series/);
  // Empty suffix part.
  assert.throws(() => parseSource("cloud-itonami-isco-2423-"), /not a classification-series/);
  assert.throws(() => parseSource("cloud-itonami-isco-2423--x"), /not a classification-series/);
  // Not a series name at all.
  assert.throws(() => parseSource("jun-1406-series-identity"), /not a classification-series/);
  assert.throws(() => parseSource(undefined), /not a classification-series/);
  // Missing or unusable title still fails.
  assert.throws(
    () => deriveIdentity("cloud-itonami-isco-2423", readBlueprint(edn("cloud-itonami-isco-2423", ""))),
    /no :itonami.blueprint\/name/,
  );
  assert.throws(
    () => deriveIdentity("cloud-itonami-isco-2423", readBlueprint(`[{:itonami.blueprint/id "cloud-itonami-isco-2423"}]`)),
    /blueprint has no/,
  );
  assert.throws(
    () => deriveIdentity("cloud-itonami-isco-2423", plain("cloud-itonami-isco-2423", "a\u0001b")),
    /not usable as a product name/,
  );
  assert.throws(() => readBlueprint(`[{:other/id "x"}]`), /exactly one blueprint map/);
  assert.throws(() => readBlueprint(edn("cloud-itonami-isco-2423", "A") + "\n" + edn("cloud-itonami-isco-2424", "B")), /exactly one blueprint map/);
});

// Blueprints as the merged repositories spell them. The package id comes
// from the repository name and must never change; the label follows the key.
const PINNED = [
  { source: "cloud-itonami-isco-2423", key: "isco-08", code: "2423", id: "network.itonami.isco2423", classification: "ISCO-08 unit group 2423" },
  { source: "cloud-itonami-isic-0111", key: "isic-rev5", code: "0111", id: "network.itonami.isic0111", classification: "ISIC Rev.5 class 0111" },
  { source: "cloud-itonami-isic-6201", key: "isic-rev4", code: "6201", id: "network.itonami.isic6201", classification: "ISIC Rev.4 class 6201" },
  { source: "cloud-itonami-isic-7830", key: "isic-rev5", code: "7830", id: "network.itonami.isic7830", classification: "ISIC Rev.5 class 7830" },
];

for (const row of PINNED) {
  test(`${row.source} keeps its package id and reads :${row.key}`, () => {
    const identity = deriveIdentity(row.source, readBlueprint(edn(row.source, "Pinned", `\n  :itonami.blueprint/${row.key} "${row.code}"`)));
    assert.equal(identity.id, row.id);
    assert.equal(identity.classification, row.classification);
  });
}

test("levels follow the shape of the code", () => {
  const label = (source, key, code) => deriveIdentity(source, readBlueprint(edn(source, "L", `\n  :itonami.blueprint/${key} "${code}"`))).classification;
  assert.equal(label("cloud-itonami-isic-C", "isic-rev5", "C"), "ISIC Rev.5 section C");
  assert.equal(label("cloud-itonami-isic-62", "isic-rev4", "62"), "ISIC Rev.4 division 62");
  assert.equal(label("cloud-itonami-isic-620", "isic-rev4", "620"), "ISIC Rev.4 group 620");
  assert.equal(label("cloud-itonami-isic-5820", "isic-rev4", "5820"), "ISIC Rev.4 class 5820");
  assert.equal(label("cloud-itonami-isco-2", "isco-08", "2"), "ISCO-08 major group 2");
  assert.equal(label("cloud-itonami-jsic-3914", "jsic-code", "3914"), "JSIC industry 3914");
  assert.equal(label("cloud-itonami-cofog-07", "cofog", "07"), "COFOG division 07");
  assert.equal(label("cloud-itonami-unspsc-43", "unspsc-segment", "43"), "UNSPSC segment 43");
});

test("the classification key fails closed", () => {
  const id = (cls, source = "cloud-itonami-isic-7830") => () => deriveIdentity(source, readBlueprint(edn(source, "X", cls)));
  assert.throws(id(""), /no classification key/);
  assert.throws(id('\n  :itonami.blueprint/isic-08 "7830"'), /no classification key/);
  assert.throws(id('\n  :itonami.blueprint/isic-rev4 "7830"\n  :itonami.blueprint/isic-rev5 "7830"'), /more than one classification key/);
  assert.throws(id('\n  :itonami.blueprint/isic-rev5 "7820"'), /does not match the repository code/);
  assert.throws(id('\n  :itonami.blueprint/isic-rev5 7830'), /must be a string/);
  assert.throws(id('\n  :itonami.blueprint/isco-08 "7830"'), /is for isco, but the repository is isic/);
  assert.throws(id('\n  :itonami.blueprint/isic-rev5 "78301"', "cloud-itonami-isic-78301"), /no known ISIC Rev.5 level/);
  assert.throws(id('\n  :itonami.blueprint/unspsc-segment "4310"', "cloud-itonami-unspsc-4310"), /no known UNSPSC level/);
});
