// restricted-wasm-v1 guest. The host mounts this document in an opaque-origin
// sandbox (iframe sandbox="allow-scripts", connect-src 'none'), so it can reach
// nothing: no network, no parent DOM, and no localStorage. The selected tab
// lives only in memory (descriptor local-state adapter "memory") and resets on
// every launch. build.mjs inlines view.js and this file into one inline script
// (the import line below and view.js's `export` keywords are removed there);
// the data arrives as a JSON block in the same document.
import { nextTab, panelTree, tabsFor, toElement } from "./view.js";

const data = JSON.parse(document.getElementById("data").textContent);
const identity = data.identity;
document.getElementById("classification").textContent = identity.classification;
document.getElementById("title").textContent = identity.title;

const nav = document.getElementById("tabs");
const panel = document.getElementById("panel");
const tabs = tabsFor(data);
let current = tabs[0].id;
const buttons = new Map();
for (const tab of tabs) {
  const button = document.createElement("button");
  button.setAttribute("role", "tab");
  button.id = `tab-${tab.id}`;
  button.textContent = tab.label;
  button.addEventListener("click", () => select(tab.id));
  button.addEventListener("keydown", (event) => {
    const next = nextTab(tabs, current, event.key);
    if (next !== current) {
      event.preventDefault();
      select(next);
      buttons.get(next).focus();
    }
  });
  nav.appendChild(button);
  buttons.set(tab.id, button);
}

function select(id) {
  current = id;
  for (const tab of tabs) {
    const active = tab.id === id;
    buttons.get(tab.id).setAttribute("aria-selected", String(active));
    buttons.get(tab.id).tabIndex = active ? 0 : -1;
  }
  panel.setAttribute("aria-labelledby", `tab-${id}`);
  panel.replaceChildren(toElement(document, panelTree(data, id)));
}

select(current);
