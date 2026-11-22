// Read-only viewer shell. The page talks to nothing: every value on screen
// comes from ./data.js, written at build time from the repository's own
// files. When the descriptor is broken the app shows only an error.
import data from "./data.js";
import { applyOfflineClientPolicy, clientRuntimeProblems } from "./vendor/kotoba-client-runtime.js";
import { errorTree, nextTab, panelTree, readSelectedTab, tabsFor, toElement, writeSelectedTab } from "./view.js";

// The static headers stay authoritative; this per-document policy can only
// narrow them further, never grant a new destination.
try {
  applyOfflineClientPolicy(document);
} catch {
  // No document to pin the policy to (or a hostile one); render anyway.
}

const identity = data.identity;
document.getElementById("classification").textContent = identity.classification;
document.getElementById("title").textContent = identity.title;

const nav = document.getElementById("tabs");
const panel = document.getElementById("panel");

let storage = null;
try {
  storage = globalThis.localStorage;
} catch {
  storage = null;
}

const problems = clientRuntimeProblems(data.descriptor, [], globalThis.location?.origin);
if (problems.length > 0) {
  nav.replaceChildren();
  panel.setAttribute("aria-labelledby", "");
  panel.replaceChildren(toElement(document, errorTree(problems)));
} else {
  const tabs = tabsFor(data);
  const key = identity.stateSchema;
  let current = readSelectedTab(storage, key, tabs) ?? tabs[0].id;
  const buttons = new Map();
  for (const tab of tabs) {
    const button = document.createElement("button");
    button.setAttribute("role", "tab");
    button.id = `tab-${tab.id}`;
    button.textContent = tab.label;
    button.addEventListener("click", () => select(tab.id, true));
    button.addEventListener("keydown", (event) => {
      const next = nextTab(tabs, current, event.key);
      if (next !== current) {
        event.preventDefault();
        select(next, true);
        buttons.get(next).focus();
      }
    });
    nav.appendChild(button);
    buttons.set(tab.id, button);
  }

  function select(id, save) {
    current = id;
    for (const tab of tabs) {
      const active = tab.id === id;
      buttons.get(tab.id).setAttribute("aria-selected", String(active));
      buttons.get(tab.id).tabIndex = active ? 0 : -1;
    }
    panel.setAttribute("aria-labelledby", `tab-${id}`);
    panel.replaceChildren(toElement(document, panelTree(data, id)));
    if (save) writeSelectedTab(storage, key, id);
  }

  select(current, false);
}
