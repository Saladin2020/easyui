import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { UiDoc } from "../src/shared/types.js";
import { initWorkspace } from "../src/lib/workspace.js";

/** Fresh workspace with the sample doc + backgrounds. */
export async function tempWorkspace(): Promise<{ root: string; cleanup: () => Promise<void> }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "easyui-test-"));
  await initWorkspace(root);
  return { root, cleanup: () => rm(root, { recursive: true, force: true }) };
}

export async function sampleDoc(): Promise<UiDoc> {
  return JSON.parse(await readFile(path.join(import.meta.dirname, "..", "samples", "screens", "village.easyui.json"), "utf8")) as UiDoc;
}

/** FNV-1a over raw bytes (pixel data, not PNG encoding, so hashes survive encoder changes). */
export function fnv1a(data: Uint8Array | Uint8ClampedArray): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < data.length; i++) {
    h ^= data[i]!;
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
