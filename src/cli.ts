#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { serve } from "@hono/node-server";
import { Command } from "commander";
import open from "open";
import { createApp, defaultWebRoot } from "./server/app.js";
import { resolveToken } from "./shared/requestGuard.js";
import { docSummary, validateDoc } from "./shared/doc.js";
import { PARTS, STYLE_LABELS } from "./shared/frames.js";
import { ICONS, ICON_NAMES } from "./shared/icons.js";
import { STYLES, WIDGET_TYPES, type UiStyle } from "./shared/types.js";
import { EXPORT_PRESETS, exportUi, type ExportPreset } from "./lib/export.js";
import { iconSheetPng, renderScreenPng, styleSheetPng } from "./lib/render.js";
import { dirs, fileWarnings, initWorkspace, listDocs, loadConfig, loadDoc, readDocRaw, resolveWorkspace, splitRef, workspaceSummary } from "./lib/workspace.js";

const program = new Command();

function workspaceOf(cli?: string): string {
  const v = cli?.trim() || process.env.EASYUI_HOME?.trim() || process.env.EASYUI_WORKSPACE?.trim() || process.cwd();
  return resolveWorkspace(v);
}

const fail = (e: unknown) => {
  console.error(`error: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
};

async function writeOut(file: string, body: Buffer) {
  await mkdir(path.dirname(path.resolve(file)), { recursive: true });
  await writeFile(file, body);
  console.log(`wrote ${file}`);
}

program.name("easyui").description("Pixel UI kits for Thai-village games: nine-slice panels, bars, inventory, menus, icons → Godot Theme / PixiJS atlas").version("0.1.0");

program
  .command("init")
  .description("Create screens/ backgrounds/ exports/ with the Lantern Village demo UI")
  .option("--force", "Overwrite samples and config")
  .option("--workspace <path>", "Workspace directory")
  .action(async (o: { force?: boolean; workspace?: string }) => {
    const root = await initWorkspace(workspaceOf(o.workspace), { force: o.force });
    console.log(`Initialized Easy UI workspace at ${root}`);
    console.log("  screens/      <id>.easyui.json (village: title, hud, pause, settings, inventory, shop)");
    console.log("  backgrounds/  PNG backdrops for the screens");
    console.log("  exports/      Godot / PixiJS / PNG / JSON exports");
  });

program
  .command("info")
  .description("Workspace summary")
  .option("--workspace <path>")
  .option("--json")
  .action(async (o: { workspace?: string; json?: boolean }) => {
    const s = await workspaceSummary(workspaceOf(o.workspace));
    if (o.json) return console.log(JSON.stringify(s, null, 2));
    console.log(`Easy UI workspace ${s.root}`);
    console.log(`  default doc ${s.config.doc} · render scale ×${s.config.scale}`);
    console.log(`  docs: ${s.docs.map((b) => b.id).join(", ") || "(none)"} · backgrounds: ${s.backgrounds.length}`);
    if (s.current) console.log(`  screens: ${s.current.screens.map((x) => `${x.id} (${x.widgets})`).join(", ")}`);
    console.log(`  styles: ${STYLES.join(", ")} · widgets: ${WIDGET_TYPES.join(", ")} · icons: ${ICON_NAMES.length} · export: ${EXPORT_PRESETS.join(", ")}`);
  });

program
  .command("list")
  .description("List UI docs, or the screens of one doc (--doc)")
  .option("--doc <id>")
  .option("--workspace <path>")
  .option("--json")
  .action(async (o: { doc?: string; workspace?: string; json?: boolean }) => {
    try {
      const root = workspaceOf(o.workspace);
      if (!o.doc) {
        const list = await listDocs(root);
        if (o.json) return console.log(JSON.stringify(list, null, 2));
        for (const b of list) console.log(`${b.id.padEnd(18)} ${b.style.padEnd(8)} ${b.screens.length} screens · ${b.errors ? `${b.errors} errors (${b.firstError})` : "ok"}  ${b.name}`);
        if (!list.length) console.log("(no docs — run easyui init)");
        return;
      }
      const s = docSummary(await loadDoc(root, o.doc));
      if (o.json) return console.log(JSON.stringify(s, null, 2));
      for (const x of s.screens) console.log(`${x.id.padEnd(14)} ${x.style.padEnd(8)} ${String(x.widgets).padStart(3)} widgets · ${x.types.join(", ")}  ${x.title}`);
    } catch (e) {
      fail(e);
    }
  });

program
  .command("check")
  .description("Validate a UI doc. Exit code 1 when there are errors")
  .argument("<doc>", "doc id or path to a .easyui.json")
  .option("--workspace <path>")
  .option("--json")
  .action(async (arg: string, o: { workspace?: string; json?: boolean }) => {
    try {
      const root = workspaceOf(o.workspace);
      const raw = arg.endsWith(".json") ? JSON.parse(await readFile(arg, "utf8")) : await readDocRaw(root, arg);
      const v = validateDoc(raw);
      const warnings = [...v.warnings, ...(v.doc ? fileWarnings(root, v.doc) : [])];
      if (o.json) console.log(JSON.stringify({ errors: v.errors, warnings }, null, 2));
      else {
        for (const d of [...v.errors, ...warnings]) console.error(`${d.severity}: ${d.path}: ${d.message}`);
        if (v.doc) console.log(`ok  ${Object.keys(v.doc.screens).length} screens · ${Object.values(v.doc.screens).reduce((a, s) => a + s.widgets.length, 0)} widgets · ${warnings.length} warnings`);
      }
      if (v.errors.length) process.exit(1);
    } catch (e) {
      fail(e);
    }
  });

program
  .command("render")
  .description("Render a screen to PNG (viewport × scale)")
  .argument("<ref>", "screen id (doc:screen for another doc)")
  .requiredOption("--out <png>")
  .option("--scale <n>", "Pixel scale (default: config.scale)")
  .option("--style <style>", `Override the style: ${STYLES.join(" | ")}`)
  .option("--workspace <path>")
  .action(async (ref: string, o: { out: string; scale?: string; style?: string; workspace?: string }) => {
    try {
      const root = workspaceOf(o.workspace);
      const cfg = await loadConfig(root);
      const { doc, screen } = splitRef(ref, cfg.doc);
      if (o.style && !(STYLES as readonly string[]).includes(o.style)) throw new Error(`Unknown style ${o.style} (${STYLES.join(", ")})`);
      const r = await renderScreenPng(root, await loadDoc(root, doc), screen, { scale: Number(o.scale ?? cfg.scale), style: o.style as UiStyle | undefined });
      await writeOut(o.out, r.png);
      console.log(`  ${r.width}×${r.height} · ${r.hits.length} widgets`);
    } catch (e) {
      fail(e);
    }
  });

program
  .command("icons")
  .description("List the item icons, or write the icon / style sheet PNG")
  .option("--out <png>", "Icon sheet PNG")
  .option("--styles <png>", "Style sheet PNG (every part in every style)")
  .option("--json")
  .action(async (o: { out?: string; styles?: string; json?: boolean }) => {
    try {
      if (o.json) return console.log(JSON.stringify({ icons: ICONS, parts: Object.fromEntries(Object.entries(PARTS).map(([k, v]) => [k, { margin: v.margin }])), styles: STYLE_LABELS }, (k, v) => (k === "draw" ? undefined : v), 2));
      if (o.out) await writeOut(o.out, iconSheetPng());
      if (o.styles) await writeOut(o.styles, styleSheetPng(4));
      if (!o.out && !o.styles) {
        for (const n of ICON_NAMES) console.log(`${n.padEnd(12)} ${ICONS[n]!.th} · ${ICONS[n]!.en}`);
        console.log(`styles: ${STYLES.map((s) => `${s} (${STYLE_LABELS[s]})`).join(", ")}`);
      }
    } catch (e) {
      fail(e);
    }
  });

program
  .command("export")
  .description("Export a UI doc: godot | pixi | png | json | all")
  .argument("[doc]")
  .option("--preset <preset>", EXPORT_PRESETS.join(" | "), "all")
  .option("--out <dir>", "Output folder (default exports/<doc>-<preset>)")
  .option("--scale <n>", "PNG scale")
  .option("--workspace <path>")
  .option("--json")
  .action(async (docArg: string | undefined, o: { preset: string; out?: string; scale?: string; workspace?: string; json?: boolean }) => {
    try {
      const root = workspaceOf(o.workspace);
      const doc = docArg ?? (await loadConfig(root)).doc;
      const res = await exportUi(root, { doc, preset: o.preset as ExportPreset, out: o.out, scale: o.scale ? Number(o.scale) : undefined, trustedPaths: true });
      if (o.json) return console.log(JSON.stringify(res, null, 2));
      for (const d of res.dirs) console.log(`exported ${d}`);
      console.log(`  ${res.files.length} files`);
      res.warnings.forEach((w) => console.log(`  warning: ${w}`));
    } catch (e) {
      fail(e);
    }
  });

program
  .command("serve")
  .description("Web editor + API (default http://127.0.0.1:8838)")
  .option("--port <port>", "Port", "8838")
  .option("--host <host>", "Interface (non-loopback requires the printed token)", "127.0.0.1")
  .option("--dev", "API only; use the Vite UI on :5179")
  .option("--open", "Open the browser")
  .option("--workspace <path>")
  .action(async (o: { port: string; host: string; dev?: boolean; open?: boolean; workspace?: string }) => {
    const root = workspaceOf(o.workspace);
    if (!existsSync(dirs(root).screens)) await initWorkspace(root);
    const token = resolveToken(o.host);
    const app = createApp({ workspaceRoot: root, webRoot: defaultWebRoot(), dev: o.dev, host: o.host, token });
    const port = Number(o.port);
    serve({ fetch: app.fetch, port, hostname: o.host }, () => {
      const url = `http://${o.host === "0.0.0.0" ? "127.0.0.1" : o.host}:${port}/`;
      console.log(`Easy UI ${o.dev ? "API (dev)" : "editor"} → ${url}`);
      console.log(`Workspace ${root}`);
      if (token) console.log(`Token (needed off-loopback): ${url}?token=${token}`);
      if (o.dev) console.log("Run the UI with: npx vite --config web/vite.config.ts");
      if (o.open) void open(o.dev ? "http://127.0.0.1:5179" : url);
    });
  });

program.parseAsync(process.argv).catch(fail);
