// Forms in a restricted-wasm-v1 guest. The guest runs in an opaque-origin
// sandbox with allow-scripts only (no allow-forms), so a form's submit event
// never fires. bindForm gives a form the same behaviour without it:
//
//   const unbind = bindForm(form, (values, form) => { ... });
//
// - Every submit control in the form (a button of type submit or with no
//   type, an input of type submit) becomes type="button" and gets
//   data-submit; a click on any [data-submit] control runs the handler.
//   Write new forms with <button type="button" data-submit>.
// - Enter in a single-line <input> runs the handler (keydown; never in a
//   <textarea>, never while an IME is composing: isComposing or keyCode 229).
// - Both call preventDefault, so nothing navigates.
// - Native validation stays: form.reportValidity() (checkValidity() when
//   reportValidity is missing) must pass before the handler runs.
// - The handler gets formValues(form), a plain object. Sending anything goes
//   through the broker operation, which is the caller's job.
// - bindForm returns a function that removes its listeners.
//
// This file has no import or export of its own besides the `export` keywords
// build.mjs strips: it is inlined into the restricted guest script.

const SINGLE_LINE = new Set(["text", "search", "email", "url", "tel", "password", "number", "date", "datetime-local", "month", "time", "week"]);
const NOT_VALUES = new Set(["button", "submit", "reset", "image", "file"]);

/** The form's named, enabled fields as a plain object. */
export function formValues(form) {
  const out = {};
  const put = (name, value) => {
    if (!Object.hasOwn(out, name)) out[name] = value;
    else if (Array.isArray(out[name])) out[name].push(value);
    else out[name] = [out[name], value];
  };
  for (const el of Array.from(form.elements)) {
    const name = el.name;
    if (!name || el.disabled) continue;
    const tag = el.tagName.toLowerCase();
    const type = (el.type || "").toLowerCase();
    if (tag === "button" || tag === "fieldset" || tag === "output" || NOT_VALUES.has(type)) continue;
    if (type === "checkbox") {
      const boxes = Array.from(form.elements).filter((e) => e.name === name && (e.type || "").toLowerCase() === "checkbox");
      if (boxes.length === 1) out[name] = el.checked;
      else if (el.checked) put(name, el.value);
      else if (!Object.hasOwn(out, name)) out[name] = [];
      continue;
    }
    if (type === "radio") {
      if (el.checked) out[name] = el.value;
      else if (!Object.hasOwn(out, name)) out[name] = null;
      continue;
    }
    if (tag === "select" && el.multiple) {
      out[name] = Array.from(el.options).filter((o) => o.selected).map((o) => o.value);
      continue;
    }
    put(name, el.value);
  }
  return out;
}

/** True for an element whose Enter key should run the form's handler. */
export function isSingleLineInput(el) {
  if (!el || el.tagName?.toLowerCase() !== "input") return false;
  return SINGLE_LINE.has((el.type || "text").toLowerCase());
}

/** Bind a form's submit controls and Enter key to onSubmit(values, form). Returns an unbind function. */
export function bindForm(form, onSubmit) {
  if (!form || typeof form.querySelectorAll !== "function") throw new TypeError("bindForm needs a form element");
  if (typeof onSubmit !== "function") throw new TypeError("bindForm needs an onSubmit function");
  for (const el of Array.from(form.querySelectorAll("button, input"))) {
    const tag = el.tagName.toLowerCase();
    const declared = (el.getAttribute("type") || "").toLowerCase();
    const submits = tag === "button" ? declared === "" || declared === "submit" : declared === "submit";
    if (submits) {
      el.setAttribute("type", "button");
      el.setAttribute("data-submit", "");
    }
  }
  const run = () => {
    const valid = typeof form.reportValidity === "function" ? form.reportValidity() : typeof form.checkValidity === "function" ? form.checkValidity() : true;
    if (!valid) return false;
    onSubmit(formValues(form), form);
    return true;
  };
  const onClick = (event) => {
    const control = event.target?.closest?.("[data-submit]");
    if (!control || !form.contains(control) || control.disabled) return;
    event.preventDefault();
    run();
  };
  const onKeydown = (event) => {
    if (event.key !== "Enter" || event.isComposing || event.keyCode === 229) return;
    if (!isSingleLineInput(event.target)) return;
    event.preventDefault();
    run();
  };
  form.addEventListener("click", onClick);
  form.addEventListener("keydown", onKeydown);
  return () => {
    form.removeEventListener("click", onClick);
    form.removeEventListener("keydown", onKeydown);
  };
}
