#!/usr/bin/env node
// Move series repositories to one lib commit: one branch and one PR per
// repository, a TSV row per repository, a pause between repositories.
//
//   node scripts/bump-series.mjs --lib <40-hex sha> --repos <file|a,b,c> --results <tsv>
//        [--work <dir>] [--pace <seconds>] [--issue <KEY>] [--dry-run]
//        [--commit-trailer <text>] [--pr-footer <text>]
//
// Run it from a checkout of this lib at exactly that commit: the shell files
// and checks it writes are this checkout's. For each repository (a name in
// cloud-itonami, with or without the `cloud-itonami/` owner):
//  1. clone it into --work (default ./.agent-output/bump, outside any series
//     checkout) and record app/package.json itonami.id and the
//     tauri.conf.json identifier;
//  2. run `itonami-app init --lib-rev <sha> --no-icons`, with `--migrate` when the
//     repository still holds the copied template (no lib pin yet);
//  3. regenerate app/package-lock.json (`npm install`) and
//     app/src-tauri/Cargo.lock (`cargo metadata`, which changes no other locked
//     version), then `npm ci && npm test`;
//  4. stop for that repository when the package id or identifier changed, or
//     when a test fails: no PR is opened;
//  5. otherwise commit, push the branch and open the PR (not with --dry-run).
// The script never merges. It touches only the repositories it is given.
import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pinnedRev } from "./init.mjs";

const LIB = fileURLToPath(new URL("../", import.meta.url));
const SHA = /^[0-9a-f]{40}$/;
export const COLUMNS = ["repo", "lib_sha", "mode", "id_before", "id_after", "identifier_before", "identifier_after", "id_unchanged", "tests_pass", "tests_fail", "result", "pr", "notes"];

export function parseArgs(argv) {
  const o = { lib: null, repos: null, results: null, work: resolve(".agent-output/bump"), pace: 5, issue: null, dryRun: false, commitTrailer: "", prFooter: "" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = () => argv[++i];
    if (a === "--lib") o.lib = v();
    else if (a === "--repos") o.repos = v();
    else if (a === "--results") o.results = resolve(v());
    else if (a === "--work") o.work = resolve(v());
    else if (a === "--pace") o.pace = Number(v());
    else if (a === "--issue") o.issue = v();
    else if (a === "--dry-run") o.dryRun = true;
    else if (a === "--commit-trailer") o.commitTrailer = v();
    else if (a === "--pr-footer") o.prFooter = v();
    else throw new Error(`unknown option ${a}`);
  }
  if (!SHA.test(o.lib ?? "")) throw new Error("--lib must be a 40-hex commit SHA (a tag can move; look it up with git rev-parse <tag>^{commit})");
  if (!o.repos) throw new Error("--repos <file|a,b,c> is required");
  if (!o.results) throw new Error("--results <tsv> is required");
  if (!(o.pace >= 0)) throw new Error("--pace must be a number of seconds");
  return o;
}

/** Repository names from a file (one per line, # comments) or a comma list, owner removed. */
export function readRepos(spec) {
  const text = existsSync(spec) ? readFileSync(spec, "utf8") : spec.replaceAll(",", "\n");
  return text.split("\n").map((l) => l.replace(/#.*/, "").trim()).filter(Boolean).map((r) => r.replace(/^cloud-itonami\//, ""));
}

/** The ids the Store catalog matches on. */
export function ids(app) {
  const pkg = JSON.parse(readFileSync(join(app, "package.json"), "utf8"));
  const conf = JSON.parse(readFileSync(join(app, "src-tauri/tauri.conf.json"), "utf8"));
  return { id: pkg.itonami?.id ?? null, identifier: conf.identifier ?? null, rev: pinnedRev(pkg) };
}

/** Pass and fail counts from node --test output. */
export function counts(out) {
  const n = (k) => [...out.matchAll(new RegExp(`^ℹ ${k} (\\d+)$`, "gm"))].reduce((s, m) => s + Number(m[1]), 0);
  return { pass: n("pass"), fail: n("fail") };
}

const tsvCell = (v) => String(v ?? "").replace(/[\t\n]/g, " ");

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 256 << 20, ...opts });
  return { ok: r.status === 0, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

function must(cmd, args, opts) {
  const r = run(cmd, args, opts);
  if (!r.ok) throw new Error(`${cmd} ${args.join(" ")} failed:\n${r.out.slice(-2000)}`);
  return r.out;
}

export async function bumpOne(repo, o) {
  const row = { repo, lib_sha: o.lib, mode: "", result: "", pr: "", notes: "" };
  const dir = join(o.work, repo);
  if (existsSync(dir)) throw new Error(`${dir} exists: remove it (by absolute path) or pick another --work`);
  must("git", ["clone", "--quiet", `https://github.com/cloud-itonami/${repo}.git`, dir]);
  const app = join(dir, "app");
  if (!existsSync(join(dir, "blueprint.edn"))) return { ...row, result: "skip-no-blueprint" };
  if (!existsSync(join(app, "package.json"))) return { ...row, result: "skip-no-app" };
  const before = ids(app);
  Object.assign(row, { id_before: before.id, identifier_before: before.identifier });
  if (before.rev === o.lib) return { ...row, mode: "bump", result: "already-at-sha", id_after: before.id, identifier_after: before.identifier, id_unchanged: true };
  row.mode = before.rev === null ? "migrate" : "bump";
  const branch = `itonami-lib-${o.lib.slice(0, 8)}`;
  must("git", ["-C", dir, "switch", "--quiet", "-c", branch]);

  must(process.execPath, [join(LIB, "bin/itonami-app.mjs"), "init", dir, "--repo", repo, "--lib-rev", o.lib, "--no-icons", ...(row.mode === "migrate" ? ["--migrate"] : [])]);
  must("npm", ["install", "--no-audit", "--no-fund"], { cwd: app });
  must("cargo", ["metadata", "--format-version", "1", "--manifest-path", join(app, "src-tauri/Cargo.toml")], { stdio: ["ignore", "ignore", "pipe"] });
  const after = ids(app);
  Object.assign(row, { id_after: after.id, identifier_after: after.identifier, id_unchanged: after.id === before.id && after.identifier === before.identifier });
  if (!row.id_unchanged) return { ...row, result: "stop-id-changed" };

  const ci = run("npm", ["ci", "--no-audit", "--no-fund"], { cwd: app });
  if (!ci.ok) return { ...row, result: "fail-npm-ci", notes: ci.out.slice(-300) };
  const t = run("npm", ["test"], { cwd: app });
  const c = counts(t.out);
  Object.assign(row, { tests_pass: c.pass, tests_fail: c.fail });
  if (!t.ok || c.fail > 0 || c.pass === 0) return { ...row, result: "fail-test", notes: t.out.split("\n").filter((l) => l.startsWith("✖")).slice(0, 5).join("; ") };

  if (o.dryRun) return { ...row, result: "ok-dry-run" };
  must("git", ["-C", dir, "add", "-A"]);
  const subject = `${o.issue ? `${o.issue}: ` : ""}${row.mode === "migrate" ? "move the app onto" : "bump"} cloud-itonami/itonami-lib ${o.lib.slice(0, 8)}`;
  const message = [subject, "", `Pins @itonami/series-app, itonami-series-host and itonami-series-build to ${o.lib} and regenerates both lock files.`, `Package id ${after.id} and identifier ${after.identifier} unchanged. npm test: ${c.pass} pass, ${c.fail} fail.`, ...(o.commitTrailer ? ["", o.commitTrailer] : [])].join("\n");
  must("git", ["-C", dir, "commit", "--quiet", "-m", message]);
  must("git", ["-C", dir, "push", "--quiet", "-u", "origin", branch]);
  const body = [
    `${row.mode === "migrate" ? "Replaces the copied series template under `app/` with the thin shell and" : "Moves"} the pin to [cloud-itonami/itonami-lib@${o.lib.slice(0, 8)}](https://github.com/cloud-itonami/itonami-lib/commit/${o.lib}) (commit SHA, not a tag) in \`app/package.json\`, \`app/src-tauri/Cargo.toml\` and \`.github/workflows/app.yml\`; both lock files are regenerated.`,
    "",
    `- Package id \`${after.id}\` and \`tauri.conf.json\` identifier \`${after.identifier}\`: unchanged (checked before and after).`,
    `- \`npm ci && npm test\`: ${c.pass} pass, ${c.fail} fail.`,
    ...(row.mode === "migrate" ? ["- The console.mjs fix (samples without `<section>`) and every other template change up to this lib commit come with the lib."] : []),
    ...(o.issue ? ["", `Tracking: ${o.issue}`] : []),
    ...(o.prFooter ? ["", o.prFooter] : []),
  ].join("\n");
  const pr = must("gh", ["pr", "create", "--repo", `cloud-itonami/${repo}`, "--head", branch, "--title", subject, "--body", body]).trim().split("\n").pop();
  return { ...row, result: "pr-opened", pr };
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const head = execFileSync("git", ["-C", LIB, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  if (head !== o.lib) throw new Error(`run from a lib checkout at ${o.lib}; this one is at ${head}`);
  if (execFileSync("git", ["-C", LIB, "status", "--porcelain"], { encoding: "utf8" }).trim()) throw new Error("the lib checkout has local changes");
  mkdirSync(o.work, { recursive: true });
  if (!existsSync(o.results)) appendFileSync(o.results, COLUMNS.join("\t") + "\n");
  const repos = readRepos(o.repos);
  for (const [i, repo] of repos.entries()) {
    let row;
    try {
      row = await bumpOne(repo, o);
    } catch (error) {
      row = { repo, lib_sha: o.lib, result: "error", notes: String(error.message).split("\n")[0] };
    }
    appendFileSync(o.results, COLUMNS.map((k) => tsvCell(row[k])).join("\t") + "\n");
    console.log(`${repo}\t${row.result}\t${row.pr ?? ""}`);
    if (i < repos.length - 1 && o.pace > 0) await new Promise((r) => setTimeout(r, o.pace * 1000));
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`bump-series: ${error.message}`);
    process.exitCode = 1;
  });
}
