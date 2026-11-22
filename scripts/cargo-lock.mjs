// src-tauri/Cargo.lock must be in the order cargo writes it, or the first cargo
// run during an APK build rewrites it and every clone is left dirty (and the
// release.json `dirty` flag of a later build turns true). Cargo sorts [[package]]
// entries by name, then by version, then by source. `cargo metadata --locked`
// does not catch an order-only difference, so this reads the file itself.

/** The [[package]] entries of a Cargo.lock text as { name, version, source }. */
export function lockPackages(text) {
  return text.split(/^\[\[package\]\]$/m).slice(1).map((block) => {
    const field = (key) => new RegExp(`^${key} = "([^"]*)"$`, "m").exec(block)?.[1] ?? "";
    return { name: field("name"), version: field("version"), source: field("source") };
  });
}

/** Cargo's semver order for x.y.z[-pre][+build]: numeric core, a pre-release sorts before the release. */
function compareVersions(a, b) {
  const parse = (v) => {
    const [core, pre = null] = v.split("+")[0].split(/-(.*)/s);
    return { nums: core.split(".").map(Number), pre };
  };
  const x = parse(a), y = parse(b);
  for (let i = 0; i < 3; i++) if (x.nums[i] !== y.nums[i]) return x.nums[i] - y.nums[i];
  if (x.pre === y.pre) return 0;
  if (x.pre === null) return 1;
  if (y.pre === null) return -1;
  return x.pre < y.pre ? -1 : 1;
}

export function lockOrderProblems(text) {
  const packages = lockPackages(text);
  const problems = [];
  for (let i = 1; i < packages.length; i++) {
    const a = packages[i - 1], b = packages[i];
    const order = a.name !== b.name ? (a.name < b.name ? -1 : 1) : compareVersions(a.version, b.version) || (a.source < b.source ? -1 : a.source > b.source ? 1 : 0);
    if (order >= 0) problems.push(`${b.name} ${b.version} comes after ${a.name} ${a.version}`);
  }
  return problems;
}
