// Phone layout (App QA, isco-2423 on a 412 px Android 35 emulator): every tab
// stays in view at 360 px and wider, and the page never scrolls sideways. On
// Android a page wider than the screen widens the layout viewport, and a
// sideways swipe then shifts the whole page. There is no browser in this test
// setup, so these are rule checks on style.css and on the view tree.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { panelTree, tabsFor } from "../src/view.js";

const APP = fileURLToPath(new URL("../", import.meta.url));
const css = await readFile(join(APP, "src/style.css"), "utf8");

/** Every style rule as { selector, media, decls }, with media "" at the top level. */
function rules(text) {
  const out = [];
  const stack = [];
  let buf = "";
  for (const ch of text.replace(/\/\*[\s\S]*?\*\//g, "")) {
    if (ch === "{") {
      stack.push(buf.trim());
      buf = "";
    } else if (ch === "}") {
      const head = stack.pop();
      if (head !== undefined && !head.startsWith("@")) {
        const decls = Object.fromEntries(buf.split(";").map((d) => [d.slice(0, d.indexOf(":")).trim(), d.slice(d.indexOf(":") + 1).trim()]).filter(([k]) => k));
        out.push({ selector: head, media: stack.filter((h) => h.startsWith("@")).join(" "), decls });
      }
      buf = "";
    } else {
      buf += ch;
    }
  }
  assert.equal(stack.length, 0, "style.css braces balance");
  return out;
}
const ALL = rules(css);

/** Declarations of the one top-level rule whose selector list is exactly `selector`. */
function rule(selector) {
  const found = ALL.filter((r) => r.selector === selector && r.media === "");
  assert.equal(found.length, 1, `one top-level ${selector} rule`);
  return found[0].decls;
}

/** The selector's declarations in every media block, top level included. */
const everywhere = (selector) => ALL.filter((r) => r.selector === selector).map((r) => r.decls);

test("the tab row wraps instead of scrolling or overflowing", () => {
  const tabs = rule(".tabs");
  assert.equal(tabs.display, "flex");
  assert.equal(tabs["flex-wrap"], "wrap");
  for (const decls of everywhere(".tabs")) {
    assert.equal(decls["overflow-x"], undefined, "the row does not hide a tab behind a scroll");
    assert.equal(decls.overflow, undefined);
    assert.notEqual(decls["flex-wrap"], "nowrap");
  }
  const tab = rule('.tabs [role="tab"]');
  assert.equal(tab["max-width"], "100%", "one tab never exceeds the row");
  for (const decls of everywhere('.tabs [role="tab"]')) assert.notEqual(decls["white-space"], "nowrap");
});

test("long tokens break instead of widening the page", () => {
  assert.equal(rule("body")["overflow-wrap"], "anywhere");
  for (const sel of ["body", "main", ".top", ".tabs"]) {
    for (const decls of everywhere(sel)) assert.ok(!decls.width && !decls["min-width"], `${sel} has no fixed width`);
  }
  for (const decls of everywhere("dd")) assert.equal(decls["overflow-wrap"], "anywhere");
});

test("the only wide content scrolls inside its own box", () => {
  assert.equal(rule(".table-scroll")["overflow-x"], "auto");
  // Every rule that sets a min-width or nowrap is a table part, which lives in .table-scroll.
  for (const r of ALL) {
    if (/^[1-9]/.test(r.decls["min-width"] ?? "") || r.decls["white-space"] === "nowrap") {
      assert.ok(["table", "thead th"].includes(r.selector), `${r.selector} could widen the page`);
    }
  }
});

test("a wide table scrolls inside its box and shows that it does", () => {
  const box = rule(".table-scroll");
  assert.equal(box["max-width"], "100%");
  assert.equal(box["overscroll-behavior-x"], "contain", "a sideways swipe at the end does not move the page");
  assert.match(box.background, /local/, "the cover gradients scroll with the content");
  assert.match(box.background, /var\(--scroll-shadow\)[^,]*,[^,]*\bscroll\b/, "the edge shadows stay at the box edges");
  const table = rule("table");
  assert.equal(table["min-width"], undefined, "a table is not forced wider than a phone");
  assert.equal(table["overflow-wrap"], "normal", "cells wrap at spaces, not inside words");
  for (const sel of ["table", "thead th", "th,\ntd"]) {
    for (const decls of everywhere(sel)) assert.notEqual(decls["white-space"], "nowrap", `${sel} may wrap`);
  }
  assert.match(css, /--scroll-shadow:[^;]+;[\s\S]*prefers-color-scheme: dark[\s\S]*--scroll-shadow:/, "each theme has its own shadow colour");
});

test("a badge that wraps keeps its text clear of the rounded border", () => {
  const badge = rule(".badge");
  assert.equal(badge["max-width"], "100%");
  const radius = parseFloat(badge["border-radius"]);
  assert.ok(badge["border-radius"].endsWith("rem") && radius <= 1, "no pill radius that curves into wrapped text");
  const [vertical, horizontal = vertical] = badge.padding.split(/\s+/).map(parseFloat);
  assert.ok(horizontal >= radius, "the side padding is at least the radius");
  assert.ok(vertical > 0.25, "more than the old 0.25rem above and below");
});

test("every table the view builds is inside .table-scroll", () => {
  const data = {
    identity: { scheme: "isco", code: "2423", classification: "ISCO-08 unit group 2423", id: "network.itonami.isco2423", stateSchema: "s", source: "cloud-itonami-isco-2423", title: "T" },
    version: "0.1.0", blueprint: {}, physics: null, sources: { "blueprint.edn": "a".repeat(64) }, descriptor: { operations: [] },
    console: { title: "c", sections: [{ heading: "s", notes: [], tables: [{ columns: ["a", "b"], rows: [[{ text: "1" }, { text: "2" }]] }] }] },
  };
  let tables = 0;
  const walk = (n, inScroll) => {
    if (n.tag === "table") {
      tables += 1;
      assert.ok(inScroll, "a table outside .table-scroll would widen the page");
    }
    const here = inScroll || (n.attrs?.class ?? "").split(/\s+/).includes("table-scroll");
    for (const c of n.children || []) walk(c, here);
  };
  for (const tab of tabsFor(data)) walk(panelTree(data, tab.id), false);
  assert.ok(tables > 0, "the fixture renders a table");
});
