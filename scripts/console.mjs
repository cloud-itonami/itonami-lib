// Reads the operator-console sample that the repository's own actor renders
// (docs/samples/operator-console.html) into plain data. The app shows that
// data with DOM text nodes; no markup from the sample reaches the page.
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", middot: "·", mdash: "—", ndash: "–", hellip: "…", rarr: "→", larr: "←", times: "×", le: "≤", ge: "≥" };

export function plainText(html) {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (whole, name) => {
      if (name[0] === "#") {
        const cp = name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
        return Number.isInteger(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : whole;
      }
      return Object.hasOwn(ENTITIES, name) ? ENTITIES[name] : whole;
    })
    .replace(/\s+/g, " ")
    .trim();
}

const first = (re, text) => { const m = re.exec(text); return m ? plainText(m[1]) : ""; };
const all = (re, text) => [...text.matchAll(re)].map((m) => m[1]);
const TONES = new Set(["ok", "warn", "critical"]);

const readCell = (attrs, cell) => {
  const span = /<span\b[^>]*class="([^"]*)"/i.exec(cell)?.[1].split(/\s+/).find((c) => TONES.has(c));
  const direct = span ? undefined : /class="([^"]*)"/i.exec(attrs)?.[1].split(/\s+/).find((c) => TONES.has(c));
  const tone = span ?? direct;
  return tone ? { text: plainText(cell), tone } : { text: plainText(cell) };
};

const readTables = (block) => {
  const tables = [];
  for (const table of all(/<table\b[^>]*>([\s\S]*?)<\/table>/gi, block)) {
    const head = /<thead\b[^>]*>([\s\S]*?)<\/thead>/i.exec(table);
    const rowsHtml = /<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i.exec(table);
    let columns = head ? all(/<th\b[^>]*>([\s\S]*?)<\/th>/gi, head[1]).map(plainText) : [];
    let rowsSource = rowsHtml ? rowsHtml[1] : head ? table.replace(/<thead\b[\s\S]*?<\/thead>/gi, "") : table;
    if (!head) {
      const firstRow = /<tr\b[^>]*>([\s\S]*?)<\/tr>/i.exec(rowsSource);
      if (firstRow && /<th\b/i.test(firstRow[1])) {
        columns = all(/<th\b[^>]*>([\s\S]*?)<\/th>/gi, firstRow[1]).map(plainText);
        rowsSource = rowsSource.replace(firstRow[0], "");
      }
    }
    const rows = [];
    for (const row of all(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi, rowsSource)) {
      const cells = [...row.matchAll(/<t[dh]\b([^>]*)>([\s\S]*?)<\/t[dh]>/gi)].map((m) => readCell(m[1], m[2]));
      if (cells.length) rows.push(cells);
    }
    if (columns.length || rows.length) tables.push({ columns, rows });
  }
  return tables;
};

const readNotes = (block) =>
  all(/<p\b[^>]*>([\s\S]*?)<\/p>/gi, block.replace(/<table\b[\s\S]*?<\/table>/gi, "")).map(plainText).filter(Boolean);

/** null when the text holds no console section this reader understands. */
export function extractConsole(html) {
  const start = html.search(/<body[\s>]/i);
  const body = start < 0 ? html : html.slice(start);
  const sections = [];
  for (const block of all(/<section\b[^>]*>([\s\S]*?)<\/section>/gi, body)) {
    const heading = first(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i, block);
    if (!heading) continue;
    sections.push({ heading, notes: readNotes(block), tables: readTables(block) });
  }
  if (!sections.length) {
    const heads = [...body.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)];
    for (let i = 0; i < heads.length; i++) {
      const heading = plainText(heads[i][1]);
      if (!heading) continue;
      const from = heads[i].index + heads[i][0].length;
      const to = i + 1 < heads.length ? heads[i + 1].index : body.length;
      const chunk = body.slice(from, to);
      sections.push({ heading, notes: readNotes(chunk), tables: readTables(chunk) });
    }
  }
  if (!sections.length) return null;
  return {
    title: first(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i, body),
    badge: first(/<span\b[^>]*class="badge"[^>]*>([\s\S]*?)<\/span>/i, body),
    sections,
  };
}
