// A restricted-wasm-v1 guest has no allow-forms, so a submit event never
// fires: the build refuses guest code or markup that relies on one.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkNoSubmit, guestScript } from "../scripts/build.mjs";
import { isSingleLineInput } from "../src/form.js";

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
