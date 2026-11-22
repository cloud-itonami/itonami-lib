// Prepare the AndroidManifest.xml that `tauri android init` generates, for the
// APK that android-apk.sh builds:
// - the main activity must list uiMode in android:configChanges, so a theme
//   switch reaches MainActivity.onConfigurationChanged instead of recreating it;
// - android.permission.INTERNET is removed. The app makes no network request
//   (its CSP allows connect-src ipc: only) and the Store lists every permission
//   an APK asks for. The permission is declared with tools:node="remove", so the
//   manifest merger drops it from the merged manifest even when a library
//   (Tauri, wry) asks for it. `tauri android dev` does not run this script.
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const INTERNET = "android.permission.INTERNET";
const TOOLS = "http://schemas.android.com/tools";
const REMOVE = `<uses-permission android:name="${INTERNET}" tools:node="remove" />`;

/** The manifest text with INTERNET removed, or an Error describing why it cannot be prepared. */
export function prepareManifest(xml) {
  const open = /<manifest\b[^>]*>/.exec(xml);
  if (!open) throw new Error("AndroidManifest.xml has no <manifest> element");
  const changes = [...xml.matchAll(/android:configChanges="([^"]*)"/g)].map((m) => m[1].split("|"));
  if (changes.length === 0 || !changes.every((list) => list.includes("uiMode"))) {
    throw new Error("AndroidManifest.xml configChanges has no uiMode; MainActivity.onConfigurationChanged would not see a theme switch");
  }
  // Every element that asks for INTERNET (uses-permission and uses-permission-sdk-23), self-closing or not.
  const asks = new RegExp(`[ \\t]*<uses-permission(?:-sdk-23)?\\b[^>]*android:name="${INTERNET.replaceAll(".", "\\.")}"[^>]*?(?:/>|>\\s*</uses-permission(?:-sdk-23)?>)[ \\t]*\\r?\\n?`, "g");
  let out = xml.replace(asks, "");
  let tag = open[0];
  const prefix = /\sxmlns:tools="([^"]*)"/.exec(tag);
  if (prefix && prefix[1] !== TOOLS) throw new Error(`xmlns:tools is ${prefix[1]}, not ${TOOLS}`);
  if (!prefix) tag = tag.replace(/^<manifest\b/, `<manifest xmlns:tools="${TOOLS}"`);
  out = out.replace(open[0], `${tag}\n    ${REMOVE}`);
  if (out.split(INTERNET).length !== 2 || !out.includes(REMOVE)) throw new Error("INTERNET is still asked for after the edit");
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: node scripts/android-manifest.mjs <AndroidManifest.xml>");
    process.exit(1);
  }
  try {
    await writeFile(file, prepareManifest(await readFile(file, "utf8")));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
