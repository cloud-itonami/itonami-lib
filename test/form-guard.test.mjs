// A restricted-wasm-v1 guest has no allow-forms, so a submit event never
// fires: the build refuses guest code or markup that relies on one.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkNoSubmit, guestScript } from "../scripts/build.mjs";
import { formValues, isSingleLineInput } from "../src/form.js";

const LIB = fileURLToPath(new URL("../", import.meta.url));
const S = "sub" + "mit"; // built from parts so this file is not itself a hit

test("the lib's own guest has no submit control or listener, and carries bindForm", () => {
  const script = guestScript();
  checkNoSubmit(script, "guest script");
  checkNoSubmit(readFileSync(join(LIB, "src/guest.html"), "utf8"), "guest.html");
  assert.ok(script.includes("function bindForm(form, onSubmit)"));
});

test("relying on a submit event fails the guard", () => {
  for (const bad of [
    `form.addEventListener("${S}", go)`,
    `form.addEventListener('${S}', go)`,
    `<form on${S}="go()">`,
    `form.on${S} = go`,
    `form.request${S[0].toUpperCase()}${S.slice(1)}()`,
    `form.${S}()`,
    `<button type="${S}">Send</button>`,
    `<button type=${S}>Send</button>`,
    `<input type='${S}' value="Send">`,
  ]) {
    assert.throws(() => checkNoSubmit(bad, "fixture"), /never fires in the restricted-wasm-v1 sandbox/, bad);
  }
  checkNoSubmit(`<button type="button" data-${S}>Send</button> bindForm(form, onSubmit)`, "fixture");
});

test("Enter runs the handler only in single-line inputs", () => {
  const el = (tagName, type) => ({ tagName, type });
  for (const type of ["text", "search", "email", "url", "tel", "password", "number", "date"]) assert.ok(isSingleLineInput(el("INPUT", type)), type);
  for (const type of ["checkbox", "radio", "file", "button", "range", "color", "hidden"]) assert.ok(!isSingleLineInput(el("INPUT", type)), type);
  assert.ok(!isSingleLineInput(el("TEXTAREA", "textarea")));
  assert.ok(isSingleLineInput(el("INPUT", "")), "an input without a type is text");
  assert.ok(!isSingleLineInput(null));
});

// Fake elements: formValues reads only name, disabled, tagName, type, value, checked, multiple, options.
const field = (name, extra = {}) => ({ tagName: "INPUT", type: "text", name, value: "", disabled: false, checked: false, ...extra });
const box = (name, value, checked) => field(name, { type: "checkbox", value, checked });
const values = (...elements) => formValues({ elements });

test("formValues: the form's structure decides the shape, not what is checked", () => {
  assert.deepEqual(values(box("tag", "x", false), box("tag", "y", false)), { tag: [] }, "0 of 2 checked");
  assert.deepEqual(values(box("tag", "x", true), box("tag", "y", false)), { tag: ["x"] }, "1 of 2 checked");
  assert.deepEqual(values(box("tag", "x", true), box("tag", "y", true)), { tag: ["x", "y"] }, "2 of 2 checked");
  assert.deepEqual(values(box("agree", "on", true)), { agree: true }, "a lone checkbox is a boolean");
  assert.deepEqual(values(box("agree", "on", false)), { agree: false });
  assert.deepEqual(values(field("q", { value: "a" }), field("q", { value: "" })), { q: ["a", ""] }, "repeated text names are an array");
  assert.deepEqual(values(field("q", { value: "a" }), field("q", { value: "b", disabled: true })), { q: "a" }, "a disabled twin does not count");
  assert.deepEqual(values(field("q", { value: "a" }), field("q", { tagName: "BUTTON", type: "button", value: "b" })), { q: "a" }, "a button twin does not count");
  const radio = (value, checked) => field("size", { type: "radio", value, checked });
  assert.deepEqual(values(radio("s", false), radio("m", true)), { size: "m" });
  assert.deepEqual(values(radio("s", false), radio("m", false)), { size: null });
  const opt = (value, selected) => ({ value, selected });
  assert.deepEqual(values(field("pick", { tagName: "SELECT", type: "select-multiple", multiple: true, options: [opt("a", false), opt("b", false)] })), { pick: [] });
  assert.deepEqual(values(field("pick", { tagName: "SELECT", type: "select-multiple", multiple: true, options: [opt("a", true), opt("b", false)] })), { pick: ["a"] });
  assert.deepEqual(values(field("one", { value: "v" }), field("file", { type: "file" }), field("", { value: "nameless" })), { one: "v" });
});
