// bindForm (src/form.js) in a real browser, inside an iframe with
// sandbox="allow-scripts" and nothing else, as the restricted-wasm-v1 guest
// runs: the form's submit event cannot fire there. Headless Chrome is driven
// over the DevTools protocol with trusted input (mouse, keys, IME). Skips
// when no Chrome or Chromium is installed (set CHROME to point at one).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const LIB = fileURLToPath(new URL("../", import.meta.url));
const CANDIDATES = [process.env.CHROME, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/opt/homebrew/bin/chromium", "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"].filter(Boolean);
const CHROME = CANDIDATES.find((p) => existsSync(p));

const GUEST = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;font:16px sans-serif}input,textarea,button{display:block;margin:4px;width:300px;height:32px}</style></head><body>
<form id="f">
<input id="title" name="title" required>
<input id="count" name="count" type="number" value="2">
<textarea id="body" name="body">x</textarea>
<input id="agree" name="agree" type="checkbox" checked>
<button id="go">Send</button>
</form>
<script>${readFileSync(join(LIB, "src/form.js"), "utf8").replace(/^export /gm, "")}
const form = document.getElementById("f");
let submits = 0;
form.addEventListener("sub" + "mit", () => { submits += 1; });
bindForm(form, (values) => parent.postMessage({ type: "call", values }, "*"));
const rect = (id) => { const r = document.getElementById(id).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; };
window.addEventListener("message", (e) => {
  if (e.data === "state") parent.postMessage({ type: "state", goType: document.getElementById("go").getAttribute("type"), dataSubmit: document.getElementById("go").hasAttribute("data-submit"), href: location.href, submits, title: document.getElementById("title").value, body: document.getElementById("body").value }, "*");
  if (e.data && e.data.type === "synthetic") {
    const t = document.getElementById("title");
    t.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, isComposing: e.data.isComposing, keyCode: e.data.keyCode }));
    parent.postMessage({ type: "synthetic-done" }, "*");
  }
});
addEventListener("load", () => requestAnimationFrame(() => parent.postMessage({ type: "ready", rects: { title: rect("title"), body: rect("body"), go: rect("go") } }, "*")));
</script></body></html>`;

const PARENT = `<!doctype html><html><body style="margin:0"><script>window.msgs=[];addEventListener("message",(e)=>msgs.push(e.data));</script>
<iframe id="g" sandbox="allow-scripts" style="position:absolute;left:0;top:0;border:0;width:600px;height:400px"></iframe>
<script>document.getElementById("g").srcdoc=${JSON.stringify(GUEST).replace(/</g, "\\u003c")};</script></body></html>`;

async function launch(t) {
  const profile = await mkdtemp(join(tmpdir(), "itonami-chrome-"));
  const args = ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--disable-gpu", ...(process.platform === "linux" ? ["--no-sandbox"] : []), "about:blank"];
  const child = spawn(CHROME, args, { stdio: ["ignore", "ignore", "pipe"] });
  t.after(async () => {
    child.kill("SIGKILL");
    await new Promise((r) => setTimeout(r, 300));
    await rm(profile, { recursive: true, force: true });
  });
  const browserWs = await new Promise((resolve, reject) => {
    let buf = "";
    const timer = setTimeout(() => reject(new Error(`no DevTools endpoint from ${CHROME}: ${buf.slice(-300)}`)), 20000);
    child.stderr.on("data", (d) => {
      buf += d;
      const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf);
      if (m) { clearTimeout(timer); resolve(m[1]); }
    });
  });
  const http = new URL(browserWs);
  http.protocol = "http:";
  http.pathname = "/json/list";
  let page;
  for (let i = 0; i < 50 && !page; i++) {
    page = (await (await fetch(http)).json()).find((x) => x.type === "page");
    if (!page) await new Promise((r) => setTimeout(r, 100));
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id;
    if (process.env.ITONAMI_DEBUG) console.error(`cdp ${method}`);
    const timer = setTimeout(() => { pending.delete(n); reject(new Error(`${method}: no answer in 10 s`)); }, 10000);
    pending.set(n, (msg) => { clearTimeout(timer); msg.error ? reject(new Error(`${method}: ${msg.error.message}`)) : resolve(msg.result); });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  t.after(() => ws.close());
  return send;
}

test("bindForm in a sandbox=allow-scripts iframe: click, Enter, IME Enter, validation", { timeout: 90000, skip: CHROME ? false : "no Chrome or Chromium installed (set CHROME)" }, async (t) => {
  const send = await launch(t);
  await send("Page.enable");
  await send("Page.navigate", { url: `data:text/html;charset=utf-8,${encodeURIComponent(PARENT)}` });
  const evalp = async (expr) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result.value;
  const wait = async (pred, what) => {
    for (let i = 0; i < 100; i++) {
      const msgs = await evalp("window.msgs || []");
      const hit = msgs.filter(pred);
      if (hit.length) return { hit, msgs };
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error(`timed out waiting for ${what}`);
  };
  const calls = async () => (await evalp("window.msgs || []")).filter((m) => m.type === "call");
  const settle = () => new Promise((r) => setTimeout(r, 250));
  const state = async () => {
    await evalp("window.msgs = window.msgs.filter((m) => m.type !== 'state'); document.getElementById('g').contentWindow.postMessage('state', '*'); 0");
    return (await wait((m) => m.type === "state", "state")).hit[0];
  };
  const click = async ({ x, y }) => {
    for (const type of ["mousePressed", "mouseReleased"]) await send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
  };
  const enter = async () => {
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", text: "\r", unmodifiedText: "\r", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  };

  const { rects } = (await wait((m) => m.type === "ready", "the guest")).hit[0];
  let s = await state();
  assert.equal(s.goType, "button", "the submit button became type=button");
  assert.equal(s.dataSubmit, true);
  const href = s.href;

  // Validation: title is required and empty, so a click runs nothing.
  await click(rects.go);
  await settle();
  assert.equal((await calls()).length, 0, "reportValidity blocks an invalid form");

  // Click: fill the title with trusted input, then click Send.
  await click(rects.title);
  await send("Input.insertText", { text: "Hello" });
  await click(rects.go);
  await wait((m) => m.type === "call", "a call from the click");
  assert.deepEqual((await calls())[0].values, { title: "Hello", count: "2", body: "x", agree: true });

  // Enter in a single-line input runs the same handler.
  await click(rects.title);
  await enter();
  await settle();
  assert.equal((await calls()).length, 2, "Enter in an input runs the handler");

  // Enter in a textarea does not; it inserts a line.
  await click(rects.body);
  await enter();
  await settle();
  assert.equal((await calls()).length, 2, "Enter in a textarea runs nothing");
  assert.match((await state()).body, /\n/);

  // IME: a real composition is open (imeSetComposition); an Enter keydown that
  // says it belongs to it (isComposing, or keyCode 229 as Chrome reports during
  // composition) runs nothing. CDP key events stall while a composition is open,
  // so that keydown is dispatched inside the guest. Then the composition commits.
  await click(rects.title);
  await send("Input.imeSetComposition", { text: "にほん", selectionStart: 3, selectionEnd: 3 });
  for (const [isComposing, keyCode] of [[true, 13], [true, 229], [false, 229]]) {
    await evalp(`document.getElementById('g').contentWindow.postMessage({ type: 'synthetic', isComposing: ${isComposing}, keyCode: ${keyCode} }, '*'); 0`);
    await settle();
    assert.equal((await calls()).length, 2, `Enter keydown with isComposing=${isComposing} keyCode=${keyCode} runs nothing`);
  }
  await send("Input.insertText", { text: "日本" });
  await settle();
  assert.equal((await calls()).length, 2, "committing the composition runs nothing");
  await enter();
  await wait((m) => m.type === "call" && m.values.title !== "Hello", "a call after the composition");
  assert.ok((await calls()).at(-1).values.title.startsWith("Hello"));

  s = await state();
  assert.equal(s.href, href, "nothing navigated");
  assert.equal(s.submits, 0, "no submit event fired");
});
