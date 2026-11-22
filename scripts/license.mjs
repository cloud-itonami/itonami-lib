// The blueprint's :itonami.blueprint/license is shown in the app as it is.
// A new series app must not use a deprecated SPDX license id (for example
// "AGPL-3.0": use "AGPL-3.0-only" or "AGPL-3.0-or-later"). Existing apps
// (scripts/trusted-page-v1-existing.txt) are not refused here: which of the
// two replacements they take is the owner's call (Legal item 110, AWAI-500).

/** Deprecated ids from the SPDX License List (deprecated section). */
export const DEPRECATED_SPDX = new Set([
  "AGPL-1.0", "AGPL-3.0",
  "BSD-2-Clause-FreeBSD", "BSD-2-Clause-NetBSD", "bzip2-1.0.5", "eCos-2.0",
  "GFDL-1.1", "GFDL-1.2", "GFDL-1.3",
  "GPL-1.0", "GPL-1.0+", "GPL-2.0", "GPL-2.0+",
  "GPL-2.0-with-autoconf-exception", "GPL-2.0-with-bison-exception", "GPL-2.0-with-classpath-exception",
  "GPL-2.0-with-font-exception", "GPL-2.0-with-GCC-exception",
  "GPL-3.0", "GPL-3.0+", "GPL-3.0-with-autoconf-exception", "GPL-3.0-with-GCC-exception",
  "LGPL-2.0", "LGPL-2.0+", "LGPL-2.1", "LGPL-2.1+", "LGPL-3.0", "LGPL-3.0+",
  "Net-SNMP", "Nunit", "StandardML-NJ", "wxWindows",
]);

/** The deprecated ids an SPDX expression uses, in order (an empty list when none). */
export function deprecatedIds(expression) {
  if (typeof expression !== "string") return [];
  return expression.split(/[\s()]+/).filter((t) => t && !/^(AND|OR|WITH)$/.test(t)).filter((t) => DEPRECATED_SPDX.has(t));
}

/** Throws when a new app's blueprint license uses a deprecated SPDX id. */
export function checkLicense(blueprint, { existing }) {
  if (existing) return;
  const ids = deprecatedIds(blueprint?.["itonami.blueprint/license"]);
  if (ids.length > 0) {
    throw new Error(`blueprint.edn :itonami.blueprint/license uses the deprecated SPDX id ${ids.join(", ")}; a new app names the current id (for example AGPL-3.0-only or AGPL-3.0-or-later)`);
  }
}
