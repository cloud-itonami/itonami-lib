// The APK checks' pure parts: the LOAD alignment reader and the activity template.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { MAIN_ACTIVITY, mainActivityFor, misalignedLoads } from "../scripts/verify-apk.mjs";

test("LOAD segments must be aligned to 0x4000", () => {
  const ok = `Program Headers:
  Type           Offset   VirtAddr           PhysAddr           FileSiz  MemSiz   Flg Align
  PHDR           0x000040 0x0000000000000040 0x0000000000000040 0x000230 0x000230 R   0x8
  LOAD           0x000000 0x0000000000000000 0x0000000000000000 0x1a2b3c 0x1a2b3c R   0x4000
  LOAD           0x1a4000 0x00000000001a4000 0x00000000001a4000 0x5e6f70 0x5e6f70 R E 0x4000
  GNU_STACK      0x000000 0x0000000000000000 0x0000000000000000 0x000000 0x000000 RW  0x0`;
  assert.deepEqual(misalignedLoads(ok), []);
  const bad = ok.replace("R E 0x4000", "R E 0x1000");
  assert.equal(misalignedLoads(bad).length, 1);
});

test("the activity is the lib template with the package filled in", async () => {
  const text = mainActivityFor("network.itonami.isco2423");
  assert.equal(text.split("\n")[0], "package network.itonami.isco2423");
  assert.equal(text.slice(text.indexOf("\n")), (await readFile(MAIN_ACTIVITY, "utf8")).slice((await readFile(MAIN_ACTIVITY, "utf8")).indexOf("\n")));
  assert.throws(() => mainActivityFor("network.itonami.isco-2423"), /not a Java package/);
  assert.throws(() => mainActivityFor("network.itonami.x", "package a\n"), /single 'package __PACKAGE__'/);
});
