// This repository is public. Every tracked file is scanned for secrets and
// for internal URLs or machine paths; any hit fails `npm test` and CI.
// Run: node scripts/check-public.mjs [repo-root]
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** [name, pattern] pairs that must not appear in a tracked file. */
export const RULES = [
  ["private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["AWS access key", /\b(AKIA|ASIA)[0-9A-Z]{16}\b/],
  ["GitHub token", /\b(gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/],
  ["Slack token", /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ["npm token", /\bnpm_[A-Za-z0-9]{30,}\b/],
  ["Linear key", /\blin_(api|oauth)_[A-Za-z0-9]{20,}/],
  ["API key (sk-)", /\bsk-(ant-)?[A-Za-z0-9_-]{24,}/],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{35}\b/],
  ["credential assignment", /\b(password|passwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token)\b\s*[:=]\s*["'][^"'\s]{8,}["']/i],
  ["URL with credentials", /\bhttps?:\/\/[^\s/:@"']+:[^\s/@"']+@/],
  ["private address", /\b(https?:\/\/)?(127\.0\.0\.1|0\.0\.0\.0|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/],
  ["internal host", /\b[a-z0-9-]+(\.[a-z0-9-]+)*\.(internal|local|lan|corp|ts\.net)\b/i],
  ["localhost URL", /\bhttps?:\/\/localhost\b/],
  ["home directory path", /(\/Users\/[a-z][a-z0-9_-]+|\/home\/[a-z][a-z0-9_-]+|C:\\\\Users\\\\)/i],
  ["internal tracker URL", /\blinear\.app\/[a-z0-9-]+/i],
];

/** Text spans that look like a hit but are part of the platform, not secrets or internal hosts. */
const ALLOWED = [
  /http:\/\/ipc\.localhost/g, // Tauri IPC origin in the CSP
  /tauri\.localhost/g, // Tauri asset origin on Android
];

/** The hits of one file text: [{ rule, line, text }]. */
export function scan(text) {
  const hits = [];
  text.split("\n").forEach((raw, i) => {
    let line = raw;
    for (const a of ALLOWED) line = line.replace(a, "");
    for (const [rule, re] of RULES) if (re.test(line)) hits.push({ rule, line: i + 1, text: raw.trim().slice(0, 160) });
  });
  return hits;
}

/**
 * The vendored canonical runtimes, by path, when their bytes match the digest
 * in vendor/PINS.json. They are reviewed upstream (kotoba-lang/kotoba) and hold
 * address-classification code (unspecified and private ranges), not hosts; a vendored
 * file that drifted from its pin is scanned like any other.
 */
export function pinnedVendor(root) {
  const file = join(root, "vendor/PINS.json");
  if (!existsSync(file)) return new Set();
  const pins = JSON.parse(readFileSync(file, "utf8"));
  const out = new Set();
  for (const set of [pins.files ?? {}, pins["restricted-wasm-v1"]?.files ?? {}]) {
    for (const [name, digest] of Object.entries(set)) {
      const path = join("vendor", name);
      const bytes = existsSync(join(root, path)) ? readFileSync(join(root, path)) : null;
      if (bytes && createHash("sha256").update(bytes).digest("hex") === digest) out.add(path);
    }
  }
  return out;
}

export function checkRepo(root) {
  const pinned = pinnedVendor(root);
  const files = execFileSync("git", ["-C", root, "ls-files", "-z", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" }).split("\0").filter(Boolean);
  const hits = [];
  for (const file of files) {
    if (pinned.has(file)) continue;
    let text;
    try {
      text = readFileSync(join(root, file), "utf8");
    } catch {
      continue;
    }
    if (text.includes("\0")) continue; // binary
    for (const h of scan(text)) hits.push({ file, ...h });
  }
  return { files: files.length, pinned: pinned.size, hits };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(process.argv[2] ?? fileURLToPath(new URL("../", import.meta.url)));
  const { files, pinned, hits } = checkRepo(root);
  for (const h of hits) console.error(`${h.file}:${h.line}: ${h.rule}: ${h.text}`);
  console.log(`check-public: ${files} files (${pinned} pinned vendor files taken as reviewed), ${hits.length} hit(s)`);
  process.exitCode = hits.length ? 1 : 0;
}
