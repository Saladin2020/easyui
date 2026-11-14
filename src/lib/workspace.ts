import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { SAFE_ID, docSummary, validateDoc } from "../shared/doc.js";
import type { Diagnostic, UiDoc } from "../shared/types.js";
import { pkgRoot } from "./assets.js";

export const CONFIG_NAME = "easyui.config.json";
export const DOC_EXT = ".easyui.json";

export interface EasyUiConfig {
  name: string;
  /** Document used when a command gets no --doc. */
  doc: string;
  /** PNG render scale (viewport × scale). */
  scale: number;
}

export const DEFAULT_CONFIG: EasyUiConfig = { name: "Easy UI Workspace", doc: "village", scale: 3 };

export function assertSafeId(id: unknown, label = "id"): string {
  if (typeof id !== "string" || !SAFE_ID.test(id)) throw new Error(`Invalid ${label} ${JSON.stringify(id)} (use a-z, 0-9, _ or -)`);
  return id;
}

export function resolveWorkspace(dir = process.cwd()): string {
  return path.resolve(dir);
}

export const dirs = (root: string) => ({
  screens: path.join(root, "screens"),
  backgrounds: path.join(root, "backgrounds"),
  exports: path.join(root, "exports"),
});

/** Writes outside the workspace must be inside one of these (env, `:`-separated). */
export function allowedRoots(root: string): string[] {
  const extra = (process.env.EASYUI_ALLOWED_DIRS ?? "").split(path.delimiter).map((s) => s.trim()).filter(Boolean).map((p) => path.resolve(p));
  return [path.resolve(root), ...extra];
}

/** Resolve a user path (relative to the workspace) and refuse anything outside the allowed roots. */
export function resolveInside(root: string, p: string): string {
  const abs = path.resolve(root, p);
  const ok = allowedRoots(root).some((r) => abs === r || abs.startsWith(r + path.sep));
  if (!ok) throw new Error(`Path ${p} is outside the workspace (allow it with EASYUI_ALLOWED_DIRS)`);
  return abs;
}

export async function initWorkspace(dir = process.cwd(), opts: { force?: boolean } = {}): Promise<string> {
  const root = resolveWorkspace(dir);
  const d = dirs(root);
  for (const p of Object.values(d)) await mkdir(p, { recursive: true });
  const cfg = path.join(root, CONFIG_NAME);
  if (!existsSync(cfg) || opts.force) await writeFile(cfg, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`);
  for (const sub of ["screens", "backgrounds"] as const) {
    const src = path.join(pkgRoot, "samples", sub);
    for (const f of await readdir(src)) {
      const dest = path.join(d[sub], f);
      if (!existsSync(dest) || opts.force) await copyFile(path.join(src, f), dest);
    }
  }
  return root;
}

export async function loadConfig(root: string): Promise<EasyUiConfig> {
  const f = path.join(root, CONFIG_NAME);
  if (!existsSync(f)) return DEFAULT_CONFIG;
  return { ...DEFAULT_CONFIG, ...(JSON.parse(await readFile(f, "utf8")) as Partial<EasyUiConfig>) };
}

export function docPath(root: string, id: string): string {
  return path.join(dirs(root).screens, `${assertSafeId(id, "doc id")}${DOC_EXT}`);
}

export async function readDocRaw(root: string, id: string): Promise<unknown> {
  const f = docPath(root, id);
  if (!existsSync(f)) throw new Error(`UI doc "${id}" not found in ${dirs(root).screens} (try: easyui list)`);
  return JSON.parse(await readFile(f, "utf8"));
}

/** Missing background / image files → warnings (the doc still renders, on a dark fill). */
export function fileWarnings(root: string, doc: UiDoc): Diagnostic[] {
  const out: Diagnostic[] = [];
  const check = (p: string, src: string | undefined) => {
    if (!src || src === "none" || src.startsWith("#")) return;
    let ok = false;
    try {
      ok = existsSync(resolveInside(root, src));
    } catch {
      /* outside */
    }
    if (!ok) out.push({ path: p, message: `image ${src} not found in the workspace`, severity: "warning" });
  };
  check("background", doc.background);
  for (const [sid, s] of Object.entries(doc.screens)) {
    check(`screens.${sid}.background`, s.background);
    s.widgets.forEach((w, i) => w.type === "image" && check(`screens.${sid}.widgets[${i}].src`, w.src));
  }
  return out;
}

/** Load + validate; throws with the first errors when the doc is invalid. */
export async function loadDoc(root: string, id: string): Promise<UiDoc> {
  const v = validateDoc(await readDocRaw(root, id));
  if (!v.doc) throw new Error(`UI doc "${id}" has ${v.errors.length} error(s):\n${v.errors.slice(0, 6).map((e) => `  ${e.path}: ${e.message}`).join("\n")}`);
  return v.doc;
}

export async function saveDoc(root: string, id: string, raw: unknown, opts: { force?: boolean; dryRun?: boolean } = {}): Promise<{ file: string; saved: boolean; errors: Diagnostic[]; warnings: Diagnostic[] }> {
  const v = validateDoc(raw);
  const file = docPath(root, id);
  const warnings = [...v.warnings, ...(v.doc ? fileWarnings(root, v.doc) : [])];
  if (opts.dryRun || (v.errors.length && !opts.force)) return { file, saved: false, errors: v.errors, warnings };
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(raw, null, 2)}\n`);
  return { file, saved: true, errors: v.errors, warnings };
}

export async function listDocs(root: string) {
  const d = dirs(root).screens;
  if (!existsSync(d)) return [];
  const out = [];
  for (const f of (await readdir(d)).sort()) {
    if (!f.endsWith(DOC_EXT)) continue;
    const id = f.slice(0, -DOC_EXT.length);
    if (!SAFE_ID.test(id)) continue;
    const file = path.join(d, f);
    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(file, "utf8"));
    } catch (e) {
      out.push({ id, file, name: id, style: "", screens: [] as string[], errors: 1, warnings: 0, firstError: `invalid JSON: ${(e as Error).message}`, modified: (await stat(file)).mtime.toISOString() });
      continue;
    }
    const v = validateDoc(raw);
    const b = raw as Partial<UiDoc>;
    out.push({
      id,
      file,
      name: b.name ?? id,
      style: b.style ?? "",
      screens: Object.keys(b.screens ?? {}),
      errors: v.errors.length,
      warnings: v.warnings.length + (v.doc ? fileWarnings(root, v.doc).length : 0),
      firstError: v.errors[0] ? `${v.errors[0].path}: ${v.errors[0].message}` : "",
      modified: (await stat(file)).mtime.toISOString(),
    });
  }
  return out;
}

export async function listBackgrounds(root: string): Promise<string[]> {
  const d = dirs(root).backgrounds;
  if (!existsSync(d)) return [];
  return (await readdir(d)).filter((f) => f.toLowerCase().endsWith(".png")).sort().map((f) => `backgrounds/${f}`);
}

export async function workspaceSummary(root: string) {
  const docs = await listDocs(root);
  const config = await loadConfig(root);
  let current = null;
  try {
    current = docSummary(await loadDoc(root, config.doc));
  } catch {
    /* default doc missing or invalid */
  }
  return { root, config, ...dirs(root), docs, backgrounds: await listBackgrounds(root), current };
}

/** `doc:screen` or `screen` (default doc) → ids. */
export function splitRef(ref: string, defaultDoc: string): { doc: string; screen: string } {
  const [a, b] = ref.includes(":") ? ref.split(":", 2) : [defaultDoc, ref];
  return { doc: assertSafeId(a, "doc id"), screen: assertSafeId(b, "screen id") };
}
