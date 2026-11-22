// A small EDN reader for build-time use only. It reads the plain data forms
// the realty namespaces keep their catalogs in: maps, vectors, lists, sets,
// strings, keywords, symbols, numbers, booleans, nil, comments and #_ discard.
// Keywords become strings without the leading colon; sets become sorted
// arrays. Anything else (tagged literals, reader conditionals, regexes) is
// refused instead of guessed.

export function readAll(text) {
  const forms = [];
  let i = 0;
  const n = text.length;
  const fail = (msg) => { throw new SyntaxError(`${msg} at offset ${i}`); };
  const ws = () => {
    while (i < n) {
      const c = text[i];
      if (c === ";") { while (i < n && text[i] !== "\n") i++; }
      else if (c === "," || /\s/.test(c)) i++;
      else if (c === "#" && text[i + 1] === "_") { i += 2; read(); }
      else break;
    }
  };
  const seq = (close) => {
    const out = [];
    for (;;) {
      ws();
      if (i >= n) fail(`unterminated collection, expected ${close}`);
      if (text[i] === close) { i++; return out; }
      out.push(read());
    }
  };
  const str = () => {
    i++;
    let s = "";
    while (i < n && text[i] !== '"') {
      if (text[i] === "\\") {
        const e = text[++i];
        const map = { n: "\n", t: "\t", r: "\r", '"': '"', "\\": "\\", b: "\b", f: "\f" };
        if (e === "u") { s += String.fromCharCode(parseInt(text.slice(i + 1, i + 5), 16)); i += 5; continue; }
        if (!(e in map)) fail(`unknown string escape \\${e}`);
        s += map[e]; i++;
      } else s += text[i++];
    }
    if (i >= n) fail("unterminated string");
    i++;
    return s;
  };
  const token = () => {
    const start = i;
    while (i < n && !/[\s,;()[\]{}"]/.test(text[i])) i++;
    return text.slice(start, i);
  };
  function read() {
    ws();
    if (i >= n) fail("unexpected end of input");
    const c = text[i];
    if (c === "(") { i++; return { list: seq(")") }; }
    if (c === "[") { i++; return seq("]"); }
    if (c === "{") {
      i++;
      const items = seq("}");
      if (items.length % 2) fail("map with an odd number of forms");
      const m = {};
      for (let k = 0; k < items.length; k += 2) {
        const key = items[k];
        if (typeof key !== "string") fail("only keyword or string map keys are supported");
        if (Object.hasOwn(m, key)) fail(`duplicate map key ${key}`);
        m[key] = items[k + 1];
      }
      return m;
    }
    if (c === "#" && text[i + 1] === "{") {
      i += 2;
      const items = seq("}");
      if (new Set(items.map((x) => JSON.stringify(x))).size !== items.length) fail("duplicate set member");
      return [...items].sort((a, b) => String(a).localeCompare(String(b)));
    }
    if (c === '"') return str();
    if (c === ")" || c === "]" || c === "}") fail(`unexpected ${c}`);
    if (c === "#") fail("tagged literals and reader macros are not supported");
    const t = token();
    if (t === "nil") return null;
    if (t === "true") return true;
    if (t === "false") return false;
    if (t.startsWith(":")) return t.slice(1);
    if (/^[+-]?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(t)) return Number(t);
    if (t === "") fail("empty token");
    return { symbol: t };
  }
  for (;;) {
    ws();
    if (i >= n) return forms;
    forms.push(read());
  }
}

/** The value of `(def name ...)` in a namespace source, docstring skipped. */
export function readDef(text, name) {
  for (const form of readAll(text)) {
    const xs = form?.list;
    if (!xs || xs[0]?.symbol !== "def" || xs[1]?.symbol !== name) continue;
    return xs.length === 4 ? xs[3] : xs[2];
  }
  throw new Error(`(def ${name} ...) not found`);
}
