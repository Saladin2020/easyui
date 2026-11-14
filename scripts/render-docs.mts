/**
 * README images from the sample doc.
 *   npx tsx scripts/render-docs.mts docs/assets            # every screen ×2, the icon + style sheets
 *   npx tsx scripts/render-docs.mts out/ --scale 3         # full-size renders
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { initWorkspace, loadDoc } from "../src/lib/workspace.js";
import { iconSheetPng, renderScreenPng, styleSheetPng } from "../src/lib/render.js";

const out = path.resolve(process.argv[2] ?? "docs/assets");
const si = process.argv.indexOf("--scale");
const scale = si > 0 ? Number(process.argv[si + 1]) : 2;
await mkdir(out, { recursive: true });
const ws = await mkdtemp(path.join(os.tmpdir(), "easyui-docs-"));
await initWorkspace(ws);
const doc = await loadDoc(ws, "village");
for (const sid of Object.keys(doc.screens)) await writeFile(path.join(out, `screen-${sid}.png`), (await renderScreenPng(ws, doc, sid, { scale })).png);
// one screen in all four styles
for (const style of ["teak", "lantern", "paper", "night"] as const) await writeFile(path.join(out, `styles-pause-${style}.png`), (await renderScreenPng(ws, doc, "pause", { scale: 1, style })).png);
await writeFile(path.join(out, "icons.png"), iconSheetPng());
await writeFile(path.join(out, "styles.png"), styleSheetPng(3));
await rm(ws, { recursive: true, force: true });
console.log(`wrote ${Object.keys(doc.screens).length} screens, 4 style variants, icons.png and styles.png to ${out}`);
