// view.js is DOM-free: every function here runs in plain node. The fake
// document proves toElement builds without innerHTML or inline script/style.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TAB_ABOUT,
  TAB_CONSOLE,
  TAB_OVERVIEW,
  TAB_PHYSICS,
  errorTree,
  nextTab,
  panelTree,
  readSelectedTab,
  tabsFor,
  toElement,
  valueNode,
  writeSelectedTab,
} from "../src/view.js";

const data = (over = {}) => ({
  identity: {
    source: "cloud-itonami-isco-2423",
    scheme: "isco",
    code: "2423",
    slug: "isco2423",
    id: "network.itonami.isco2423",
    title: "Fixture Practice",
    classification: "ISCO-08 unit group 2423",
    stateSchema: "itonami.series.isco2423.v1",
  },
  version: "0.1.0",
  blueprint: { "itonami.blueprint/name": "Fixture Practice" },
  physics: null,
  console: null,
  sources: { "blueprint.edn": "abc" },
  descriptor: { operations: [] },
  ...over,
});

const texts = (tree) => {
  const out = [];
  const walk = (n) => {
    if (n.text !== undefined) out.push(n.text);
    for (const c of n.children || []) walk(c);
  };
  walk(tree);
  return out.join("\n");
};

function fakeDoc() {
  const calls = [];
  const doc = {
    calls,
    createElement(tag) {
      calls.push(["create", tag]);
      const el = {
        tag,
        attrs: {},
        children: [],
        setAttribute(k, v) { this.attrs[k] = v; },
        appendChild(c) { this.children.push(c); return c; },
      };
      Object.defineProperty(el, "innerHTML", { set() { throw new Error("innerHTML is forbidden"); } });
      Object.defineProperty(el, "style", { get() { throw new Error("inline style is forbidden"); } });
      return el;
    },
    createTextNode(text) {
      calls.push(["text", text]);
      return { text };
    },
  };
  return doc;
}

test("tabs follow the data that exists", () => {
  assert.deepEqual(tabsFor(data()).map((t) => t.id), [TAB_OVERVIEW, TAB_ABOUT]);
  assert.deepEqual(
    tabsFor(data({ console: { title: "", badge: "", sections: [] }, physics: { cases: [] } })).map((t) => t.id),
    [TAB_OVERVIEW, TAB_CONSOLE, TAB_PHYSICS, TAB_ABOUT],
  );
  assert.deepEqual(
    tabsFor(data()).map((t) => t.label),
    ["概要", "この app について"],
  );
});

test("panels head with their tab label and stay faithful", () => {
  const console = { title: "T", badge: "B", sections: [{ heading: "S", notes: ["n"], tables: [] }] };
  const tree = panelTree(data({ console }), TAB_CONSOLE);
  const body = texts(tree);
  assert.ok(body.includes("操作卓の見本"));
  assert.ok(body.includes("見本"), "the console tab says it is a sample");
  assert.ok(body.includes("ライブ"), "the console tab says it is not live data");
  const physics = { "physics/schema": "s", cases: [{ id: "k", kind: "m" }] };
  assert.ok(texts(panelTree(data({ physics }), TAB_PHYSICS)).includes("物理仕様"));
  const about = texts(panelTree(data(), TAB_ABOUT));
  assert.ok(about.includes("network.itonami.isco2423"));
  assert.ok(about.includes("外部通信"));
  assert.ok(texts(panelTree(data(), "unknown-id")).includes("概要"), "unknown tabs fall back to the overview");
});

test("values render as they are in the sources", () => {
  assert.equal(texts(valueNode({ symbol: "hr/x" })), "hr/x");
  assert.ok(texts(valueNode({ list: ["a", "b"] })).includes("b"));
  assert.ok(texts(valueNode(["x", 1, true])).includes("1"));
  assert.ok(texts(valueNode({ a: { b: "c" } })).includes("c"));
});

test("tab keys move and wrap", () => {
  const tabs = tabsFor(data({ console: { title: "", badge: "", sections: [] }, physics: { cases: [] } }));
  assert.equal(nextTab(tabs, TAB_OVERVIEW, "ArrowRight"), TAB_CONSOLE);
  assert.equal(nextTab(tabs, TAB_OVERVIEW, "ArrowLeft"), TAB_ABOUT);
  assert.equal(nextTab(tabs, TAB_ABOUT, "ArrowRight"), TAB_OVERVIEW);
  assert.equal(nextTab(tabs, TAB_CONSOLE, "Home"), TAB_OVERVIEW);
  assert.equal(nextTab(tabs, TAB_CONSOLE, "End"), TAB_ABOUT);
  assert.equal(nextTab(tabs, TAB_CONSOLE, "Enter"), TAB_CONSOLE);
  assert.equal(nextTab(tabs, "gone", "ArrowRight"), TAB_CONSOLE, "a lost tab restarts from the first");
});

test("stored tabs survive missing or throwing storage", () => {
  const tabs = tabsFor(data());
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  assert.equal(readSelectedTab(storage, "k", tabs), null);
  writeSelectedTab(storage, "k", TAB_ABOUT);
  assert.equal(readSelectedTab(storage, "k", tabs), TAB_ABOUT);
  assert.equal(readSelectedTab(storage, "k", [{ id: "other" }]), null);
  const broken = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); } };
  assert.equal(readSelectedTab(broken, "k", tabs), null);
  assert.equal(readSelectedTab(null, "k", tabs), null);
  assert.doesNotThrow(() => writeSelectedTab(broken, "k", TAB_ABOUT));
  assert.doesNotThrow(() => writeSelectedTab(null, "k", TAB_ABOUT));
});

test("toElement builds without innerHTML or inline style", () => {
  const doc = fakeDoc();
  const problems = [{ field: "operations", error: "invalid-operations" }];
  const el = toElement(doc, errorTree(problems));
  assert.equal(el.tag, "div");
  assert.ok(JSON.stringify(el).includes("invalid-operations"));
  assert.ok(doc.calls.some(([kind]) => kind === "text"));
  assert.ok(!doc.calls.some(([kind, tag]) => kind === "create" && tag === "script"));
});
