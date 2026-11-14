import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { usedIcons } from "../shared/doc.js";
import { wrapText } from "../shared/draw.js";
import { PARTS, STYLE_COLORS } from "../shared/frames.js";
import { ICON_NAMES } from "../shared/icons.js";
import { STYLES, type Screen, type UiDoc, type UiStyle, type Widget } from "../shared/types.js";
import { FONT_DIR, RUNTIME_DIR, registerFonts } from "./assets.js";
import { atlasJson, buildAtlas } from "./atlas.js";
import { iconCanvas, iconSheetPng, partCanvas, renderScreenPng, styleSheetPng } from "./render.js";
import { assertSafeId, dirs, loadConfig, loadDoc, resolveInside } from "./workspace.js";

export const EXPORT_PRESETS = ["godot", "pixi", "png", "json", "all"] as const;
export type ExportPreset = (typeof EXPORT_PRESETS)[number];

export interface ExportOptions {
  doc: string;
  preset?: ExportPreset;
  out?: string;
  /** PNG render scale (default: config.scale). */
  scale?: number;
  trustedPaths?: boolean;
}

export interface ExportResult {
  preset: ExportPreset;
  dirs: string[];
  files: string[];
  warnings: string[];
}

class Writer {
  files: string[] = [];
  constructor(public root: string) {}
  async write(rel: string, body: string | Uint8Array) {
    const f = path.join(this.root, rel);
    await mkdir(path.dirname(f), { recursive: true });
    await writeFile(f, body);
    this.files.push(f);
    return f;
  }
  async copy(src: string, rel: string) {
    const f = path.join(this.root, rel);
    await mkdir(path.dirname(f), { recursive: true });
    await copyFile(src, f);
    this.files.push(f);
  }
}

/** Workspace images referenced by the doc (backgrounds + image widgets). */
function docImages(doc: UiDoc): string[] {
  const out = new Set<string>();
  const add = (s?: string) => s && s !== "none" && !s.startsWith("#") && out.add(s);
  add(doc.background);
  for (const s of Object.values(doc.screens)) {
    add(s.background);
    for (const w of s.widgets) if (w.type === "image") add(w.src);
  }
  return [...out];
}

export async function exportUi(root: string, opts: ExportOptions): Promise<ExportResult> {
  const id = assertSafeId(opts.doc, "doc id");
  const preset = opts.preset ?? "all";
  if (!(EXPORT_PRESETS as readonly string[]).includes(preset)) throw new Error(`Unknown preset ${preset} (${EXPORT_PRESETS.join(", ")})`);
  const cfg = await loadConfig(root);
  const doc = await loadDoc(root, id);
  const warnings: string[] = [];
  for (const src of docImages(doc)) {
    try {
      resolveInside(root, src);
    } catch {
      warnings.push(`image ${src} is outside the workspace — skipped`);
    }
  }
  const outFor = (p: string) => {
    if (opts.out) {
      const base = opts.trustedPaths ? path.resolve(root, opts.out) : resolveInside(root, opts.out);
      return preset === "all" ? path.join(base, `${id}-${p}`) : base;
    }
    return path.join(dirs(root).exports, `${id}-${p}`);
  };
  const res: ExportResult = { preset, dirs: [], files: [], warnings };
  const presets: ExportPreset[] = preset === "all" ? ["json", "png", "pixi", "godot"] : [preset];
  for (const p of presets) {
    const dir = outFor(p);
    await rm(dir, { recursive: true, force: true });
    const w = new Writer(dir);
    await mkdir(dir, { recursive: true });
    if (p === "json") await w.write(`${id}.easyui.json`, `${JSON.stringify(doc, null, 2)}\n`);
    if (p === "png") await writePng(w, root, doc, opts.scale ?? cfg.scale);
    if (p === "pixi") await writePixi(w, root, doc, id, warnings);
    if (p === "godot") await writeGodot(w, root, doc, warnings);
    res.dirs.push(dir);
    res.files.push(...w.files);
  }
  return res;
}

async function copyImages(w: Writer, root: string, doc: UiDoc, prefix: string, warnings: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const src of docImages(doc)) {
    try {
      const abs = resolveInside(root, src);
      const rel = `${prefix}${path.basename(src)}`;
      await w.copy(abs, rel);
      map.set(src, rel);
    } catch {
      warnings.push(`image ${src} not found — left out of the export`);
    }
  }
  return map;
}

async function writePng(w: Writer, root: string, doc: UiDoc, scale: number) {
  for (const sid of Object.keys(doc.screens)) await w.write(`screens/${sid}.png`, (await renderScreenPng(root, doc, sid, { scale })).png);
  await w.write("icons.png", iconSheetPng());
  await w.write("styles.png", styleSheetPng(4));
  for (const n of ICON_NAMES) await w.write(`icons/${n}.png`, iconCanvas(n)!.toBuffer("image/png"));
  for (const s of STYLES) for (const p of Object.keys(PARTS)) await w.write(`parts/${s}/${p}.png`, partCanvas(s, p).toBuffer("image/png"));
}

/* ------------------------------------------------------------------ PixiJS ------------------------------------------------------------------ */

async function writePixi(w: Writer, root: string, doc: UiDoc, id: string, warnings: string[]) {
  const atlas = buildAtlas(STYLES);
  await w.write("easyui.atlas.png", atlas.png);
  const fonts = { Kanit: "fonts/Kanit-Regular.ttf", "Kanit Medium": "fonts/Kanit-Medium.ttf" };
  await w.write("easyui.atlas.json", `${JSON.stringify(atlasJson(atlas.frames, atlas, { image: "easyui.atlas.png", defaultStyle: doc.style, styles: STYLES, fonts }), null, 2)}\n`);
  for (const f of ["Kanit-Regular.ttf", "Kanit-Medium.ttf", "OFL.txt"]) await w.copy(path.join(FONT_DIR, f), `fonts/${f}`);
  const imgs = await copyImages(w, root, doc, "images/", warnings);
  const rewired = remapImages(doc, (s) => imgs.get(s) ?? "none");
  await w.write(`${id}.easyui.json`, `${JSON.stringify(rewired, null, 2)}\n`);
  await w.copy(path.join(RUNTIME_DIR, "pixi", "easyui-pixi.js"), "easyui-pixi.js");
  await w.write("index.html", pixiHtml(doc, id));
  await w.write(
    "README.txt",
    `Easy UI — PixiJS v8 export of "${doc.name}"

Serve this folder over HTTP (the atlas and fonts are fetched):  npx serve .   or   python3 -m http.server
Open index.html: one tab per screen; ↑/↓/Enter drive menus, arrows move in grids, 1-8 pick hotbar slots.

Files
  easyui.atlas.png / .json   every UI part in the 4 styles + ${ICON_NAMES.length} item icons, PixiJS Spritesheet format;
                             meta.easyui has the nine-slice margins, text colours and icon names (th/en)
  easyui-pixi.js             loadUi(PIXI, "./easyui.atlas.json") → ui.panel / button / menu / bar / slot /
                             inventoryGrid / hotbar / toggle / slider / tabs / tooltip, and ui.renderScreen(doc, id)
  ${id}.easyui.json          the screens (image paths point at images/)
  fonts/                     Kanit Regular + Medium (SIL OFL 1.1)

Create the app at the viewport size with resolution 3 (or scale the stage) so Thai text renders sharp.
Generated by Easy UI (MIT). UI parts and icons are CC0.
`,
  );
}

function remapImages(doc: UiDoc, f: (src: string) => string): UiDoc {
  const d: UiDoc = JSON.parse(JSON.stringify(doc));
  const m = (s?: string) => (s && s !== "none" && !s.startsWith("#") ? f(s) : s);
  if (d.background) d.background = m(d.background);
  for (const s of Object.values(d.screens)) {
    if (s.background) s.background = m(s.background);
    for (const wd of s.widgets) if (wd.type === "image") wd.src = m(wd.src) ?? wd.src;
  }
  return d;
}

function pixiHtml(doc: UiDoc, id: string): string {
  const name = doc.name.replace(/</g, "&lt;");
  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${name} — Easy UI (PixiJS v8)</title>
  <link rel="icon" href="data:,">
  <style>
    html, body { margin: 0; min-height: 100vh; background: #140e0a; color: #f7ebd3; font-family: system-ui, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; }
    canvas { image-rendering: pixelated; width: min(1440px, 96vw); height: auto; }
    nav { display: flex; gap: 6px; margin: 10px; flex-wrap: wrap; justify-content: center; }
    nav button { background: #3a2819; color: #f7ebd3; border: 1px solid #7a5230; padding: 5px 10px; border-radius: 4px; cursor: pointer; }
    nav button.on { background: #f4ae3d; color: #2a1606; }
    p { opacity: .7; font-size: 13px; margin: 8px; }
  </style>
</head>
<body>
  <nav id="tabs"></nav>
  <p id="log">↑/↓/Enter menus · arrows grids · 1-8 hotbar · click anything</p>
  <script>
    // Local pixi.min.js if you dropped it next to this file, else the CDN build.
    const load = (srcs) => new Promise((ok, fail) => {
      const next = (i) => { if (i >= srcs.length) return fail(new Error("not found: " + srcs[0])); const s = document.createElement("script"); s.src = srcs[i]; s.onload = ok; s.onerror = () => next(i + 1); document.head.appendChild(s); };
      next(0);
    });
    window.__pixiReady = load(["./pixi.min.js", "https://cdn.jsdelivr.net/npm/pixi.js@8/dist/pixi.min.js"]);
  </script>
  <script type="module">
    import { loadUi } from "./easyui-pixi.js";
    await window.__pixiReady;
    const doc = await (await fetch("./${id}.easyui.json")).json();
    const W = doc.viewport.width, H = doc.viewport.height;
    const app = new PIXI.Application();
    await app.init({ width: W, height: H, resolution: 3, antialias: false, background: "#140e0a", roundPixels: true });
    app.canvas.style.width = "";
    document.body.insertBefore(app.canvas, document.getElementById("log"));
    const ui = await loadUi(PIXI, "./easyui.atlas.json");
    const actions = [];
    let current = null, unbind = null;
    const tabs = document.getElementById("tabs");
    const show = async (sid) => {
      if (current) { app.stage.removeChild(current); current.destroy({ children: true }); unbind?.(); }
      current = await ui.renderScreen(doc, sid, { onAction: (a) => { actions.push(a); document.getElementById("log").textContent = JSON.stringify(a); } });
      app.stage.addChild(current);
      unbind = current.bindKeys(window);
      for (const b of tabs.children) b.classList.toggle("on", b.dataset.id === sid);
      window.__ui.screen = sid;
      window.__ui.widgets = Object.keys(current.byId).length;
    };
    for (const sid of Object.keys(doc.screens)) {
      const b = document.createElement("button");
      b.textContent = doc.screens[sid].title ?? sid;
      b.dataset.id = sid;
      b.onclick = () => show(sid);
      tabs.appendChild(b);
    }
    window.__ui = { ui, doc, app, actions, show, screens: Object.keys(doc.screens), frames: Object.keys(ui.sheet.textures).length };
    await show(Object.keys(doc.screens)[0]);
    window.__ready = true;
  </script>
</body>
</html>
`;
}

/* ------------------------------------------------------------------ Godot ------------------------------------------------------------------ */

const ASC = 1.1; // Kanit ascent / em (hhea), so Godot labels sit on the same baseline as the renders
const LINE = 1.495;

const f = (n: number) => (Number.isInteger(n) ? `${n}.0` : `${+n.toFixed(3)}`);
const str = (s: string) => JSON.stringify(s);
const col = (hex: string, a = 1) => {
  const h = hex.replace("#", "");
  const c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const alpha = h.length >= 8 ? parseInt(h.slice(6, 8), 16) / 255 : a;
  return `Color(${c.map((v) => +v.toFixed(4)).join(", ")}, ${+alpha.toFixed(4)})`;
};
const vec = (x: number, y: number) => `Vector2(${f(x)}, ${f(y)})`;

/** Content (inner padding) margins per part: [left, top, right, bottom]. */
const CONTENT: Record<string, [number, number, number, number]> = {
  panel: [10, 10, 10, 10],
  panel_small: [6, 5, 6, 5],
  plate: [8, 2, 8, 3],
  button_normal: [6, 2, 6, 4],
  button_hover: [6, 2, 6, 4],
  button_pressed: [6, 3, 6, 3],
  button_disabled: [6, 2, 6, 4],
  button_focus: [6, 2, 6, 4],
  slot: [2, 2, 2, 2],
  slot_selected: [2, 2, 2, 2],
  bar_bg: [3, 3, 3, 3],
  slider_track: [3, 3, 3, 3],
  slider_fill: [1, 2, 1, 2],
  tab_on: [8, 2, 8, 3],
  tab_off: [8, 2, 8, 3],
};

export function godotTheme(style: UiStyle): string {
  const C = STYLE_COLORS[style];
  const ext: string[] = [];
  const subs: string[] = [];
  const tex = (part: string) => {
    const id = `t_${part}`;
    if (!ext.some((e) => e.includes(`id="${id}"`))) ext.push(`[ext_resource type="Texture2D" path="res://easyui/textures/${style}/${part}.png" id="${id}"]`);
    return `ExtResource("${id}")`;
  };
  const sb = (part: string, extra: Record<string, string> = {}) => {
    const id = `sb_${part}${Object.keys(extra).length ? "_x" : ""}`;
    if (subs.some((s) => s.includes(`id="${id}"`))) return `SubResource("${id}")`;
    const m = PARTS[part]!.margin;
    const cm = CONTENT[part] ?? [m, m, m, m];
    const t = tex(part);
    const lines = [`[sub_resource type="StyleBoxTexture" id="${id}"]`, `content_margin_left = ${f(cm[0])}`, `content_margin_top = ${f(cm[1])}`, `content_margin_right = ${f(cm[2])}`, `content_margin_bottom = ${f(cm[3])}`, `texture = ${t}`];
    for (const side of ["left", "top", "right", "bottom"]) lines.push(`texture_margin_${side} = ${f(m)}`);
    for (const [k, v] of Object.entries(extra)) lines.push(`${k} = ${v}`);
    subs.push(lines.join("\n"));
    return `SubResource("${id}")`;
  };
  subs.push('[sub_resource type="StyleBoxEmpty" id="sb_empty"]');
  const empty = 'SubResource("sb_empty")';
  ext.push('[ext_resource type="FontFile" path="res://easyui/fonts/Kanit-Regular.ttf" id="f_body"]');
  ext.push('[ext_resource type="FontFile" path="res://easyui/fonts/Kanit-Medium.ttf" id="f_title"]');
  const inset = Object.fromEntries(["left", "top", "right", "bottom"].map((s) => [`expand_margin_${s}`, "-2.0"]));
  const R: [string, string][] = [
    ["default_font", 'ExtResource("f_body")'],
    ["default_font_size", "10"],
    ["Button/colors/font_color", col(C.button)],
    ["Button/colors/font_hover_color", col(C.buttonHi)],
    ["Button/colors/font_focus_color", col(C.buttonHi)],
    ["Button/colors/font_pressed_color", col(C.button)],
    ["Button/colors/font_hover_pressed_color", col(C.button)],
    ["Button/colors/font_disabled_color", col(C.disabled)],
    ["Button/constants/h_separation", "3"],
    ["Button/font_sizes/font_size", "10"],
    ["Button/fonts/font", 'ExtResource("f_title")'],
    ["Button/styles/normal", sb("button_normal")],
    ["Button/styles/hover", sb("button_hover")],
    ["Button/styles/pressed", sb("button_pressed")],
    ["Button/styles/disabled", sb("button_disabled")],
    ["Button/styles/focus", sb("button_focus")],
    ["CheckBox/colors/font_color", col(C.text)],
    ["CheckBox/colors/font_hover_color", col(C.title)],
    ["CheckBox/colors/font_focus_color", col(C.title)],
    ["CheckBox/colors/font_pressed_color", col(C.text)],
    ["CheckBox/colors/font_hover_pressed_color", col(C.title)],
    ["CheckBox/constants/h_separation", "3"],
    ["CheckBox/fonts/font", 'ExtResource("f_body")'],
    ["CheckBox/font_sizes/font_size", "9"],
    ["CheckBox/icons/checked", tex("check_on")],
    ["CheckBox/icons/unchecked", tex("check_off")],
    ["CheckBox/styles/normal", empty],
    ["CheckBox/styles/hover", empty],
    ["CheckBox/styles/pressed", empty],
    ["CheckBox/styles/hover_pressed", empty],
    ["CheckBox/styles/focus", empty],
    ["CountLabel/base_type", '&"Label"'],
    ["CountLabel/colors/font_color", col(C.slotCount)],
    ["CountLabel/colors/font_shadow_color", col("#000000")],
    ["CountLabel/colors/font_outline_color", col("#000000")],
    ["CountLabel/constants/outline_size", "2"],
    ["CountLabel/font_sizes/font_size", "7"],
    ["HSlider/icons/grabber", tex("slider_knob")],
    ["HSlider/icons/grabber_highlight", tex("slider_knob")],
    ["HSlider/styles/grabber_area", sb("slider_fill")],
    ["HSlider/styles/grabber_area_highlight", sb("slider_fill")],
    ["HSlider/styles/slider", sb("slider_track")],
    ["HSlider/styles/focus", empty],
    ["HpBar/base_type", '&"ProgressBar"'],
    ["HpBar/styles/fill", sb("bar_hp", inset)],
    ["Label/colors/font_color", col(C.text)],
    ["Label/colors/font_shadow_color", col(C.shadow)],
    ["Label/constants/shadow_offset_x", "1"],
    ["Label/constants/shadow_offset_y", "1"],
    ["MpBar/base_type", '&"ProgressBar"'],
    ["MpBar/styles/fill", sb("bar_mp", inset)],
    ["MutedLabel/base_type", '&"Label"'],
    ["MutedLabel/colors/font_color", col(C.muted)],
    ["Panel/styles/panel", sb("panel")],
    ["PanelContainer/styles/panel", sb("panel")],
    ["PanelSmall/base_type", '&"Panel"'],
    ["PanelSmall/styles/panel", sb("panel_small")],
    ["Plate/base_type", '&"Panel"'],
    ["Plate/styles/panel", sb("plate")],
    ["PlateLabel/base_type", '&"Label"'],
    ["PlateLabel/colors/font_color", col(C.button)],
    ["PlateLabel/colors/font_shadow_color", col("#000000", 0)],
    ["PlateLabel/font_sizes/font_size", "9"],
    ["PlateLabel/fonts/font", 'ExtResource("f_title")'],
    ["ProgressBar/colors/font_color", col("#ffffff")],
    ["ProgressBar/styles/background", sb("bar_bg")],
    ["ProgressBar/styles/fill", sb("bar_hp", inset)],
    ["Slot/base_type", '&"PanelContainer"'],
    ["Slot/styles/panel", sb("slot")],
    ["SlotSelected/base_type", '&"PanelContainer"'],
    ["SlotSelected/styles/panel", sb("slot_selected")],
    ["StaminaBar/base_type", '&"ProgressBar"'],
    ["StaminaBar/styles/fill", sb("bar_stamina", inset)],
    ["TabBar/colors/font_selected_color", col(C.title)],
    ["TabBar/colors/font_unselected_color", col(C.muted)],
    ["TabBar/colors/font_hovered_color", col(C.text)],
    ["TabBar/font_sizes/font_size", "8"],
    ["TabBar/fonts/font", 'ExtResource("f_title")'],
    ["TabBar/styles/tab_focus", empty],
    ["TabBar/styles/tab_hovered", sb("tab_off")],
    ["TabBar/styles/tab_selected", sb("tab_on")],
    ["TabBar/styles/tab_unselected", sb("tab_off")],
    ["TitleLabel/base_type", '&"Label"'],
    ["TitleLabel/colors/font_color", col(C.title)],
    ["TitleLabel/fonts/font", 'ExtResource("f_title")'],
    ["TooltipLabel/colors/font_color", col(C.text)],
    ["TooltipPanel/styles/panel", sb("panel_small")],
    ["XpBar/base_type", '&"ProgressBar"'],
    ["XpBar/styles/fill", sb("bar_xp", inset)],
  ];
  return `[gd_resource type="Theme" load_steps=${ext.length + subs.length + 1} format=3]

${ext.join("\n")}

${subs.join("\n\n")}

[resource]
${R.map(([k, v]) => `${k} = ${v}`).join("\n")}
`;
}

/** Measure text the way the renderer does (same Kanit files), for plates / tooltips in scenes. */
function measurer() {
  registerFonts();
  const g = createCanvas(4, 4).getContext("2d");
  return (t: string, size: number, title = false) => {
    g.font = `${size}px ${title ? '"Kanit Medium", Kanit' : "Kanit"}`;
    return g.measureText(t).width;
  };
}

class Tscn {
  ext: string[] = [];
  nodes: string[] = [];
  names = new Map<string, Set<string>>();
  extRef(type: string, p: string): string {
    const i = this.ext.findIndex((e) => e.includes(`path="${p}"`));
    if (i >= 0) return `ExtResource("${i + 1}")`;
    this.ext.push(`[ext_resource type="${type}" path="${p}" id="${this.ext.length + 1}"]`);
    return `ExtResource("${this.ext.length}")`;
  }
  /** Adds a node; returns its path relative to the root (for parent= of children). */
  node(name: string, type: string, parent: string | null, props: Record<string, string | number | undefined>): string {
    const clean = name.replace(/[^A-Za-z0-9_]/g, "_") || "Node";
    const key = parent ?? "";
    const set = this.names.get(key) ?? new Set();
    let n = clean;
    for (let i = 2; set.has(n); i++) n = `${clean}${i}`;
    set.add(n);
    this.names.set(key, set);
    const head = parent === null ? `[node name="${n}" type="${type}"]` : `[node name="${n}" type="${type}" parent="${parent}"]`;
    const body = Object.entries(props).filter(([, v]) => v !== undefined).map(([k, v]) => `${k} = ${v}`);
    this.nodes.push([head, ...body].join("\n"));
    return parent === null ? "." : parent === "." ? n : `${parent}/${n}`;
  }
  toString() {
    return `[gd_scene load_steps=${this.ext.length + 1} format=3]\n\n${this.ext.join("\n")}\n\n${this.nodes.join("\n\n")}\n`;
  }
}

const rect = (x: number, y: number, w: number, h: number) => ({ offset_left: f(x), offset_top: f(y), offset_right: f(x + w), offset_bottom: f(y + h) });
const FULL = { layout_mode: 1, anchors_preset: 15, anchor_right: "1.0", anchor_bottom: "1.0", grow_horizontal: 2, grow_vertical: 2 };
const pascal = (s: string) => s.replace(/(^|[_-])(\w)/g, (_, __, c: string) => c.toUpperCase());

export function godotScene(doc: UiDoc, sid: string, opts: { order: string[]; images: Map<string, string> }): string {
  const screen: Screen = doc.screens[sid]!;
  const style = screen.style ?? doc.style;
  const C = STYLE_COLORS[style];
  const measure = measurer();
  const t = new Tscn();
  const icon = (n: string) => t.extRef("Texture2D", `res://easyui/icons/${n}.png`);
  const part = (n: string) => t.extRef("Texture2D", `res://easyui/textures/${style}/${n}.png`);
  const theme = t.extRef("Theme", `res://easyui/themes/${style}.tres`);
  const script = t.extRef("Script", "res://easyui/easyui_screen.gd");
  const slotScript = () => t.extRef("Script", "res://easyui/easyui_slot.gd");
  const titleFont = () => t.extRef("FontFile", "res://easyui/fonts/Kanit-Medium.ttf");
  const i = opts.order.indexOf(sid);
  const scn = (id: string | undefined) => (id ? str(`res://scenes/${id}.tscn`) : undefined);
  const back = ["settings", "inventory", "shop"].includes(sid) && opts.order.includes("pause") ? "pause" : sid === "pause" && opts.order.includes("hud") ? "hud" : undefined;
  let focus: string | undefined;
  const rootProps: Record<string, string | number | undefined> = {
    layout_mode: 3,
    anchors_preset: 15,
    anchor_right: "1.0",
    anchor_bottom: "1.0",
    grow_horizontal: 2,
    grow_vertical: 2,
    theme,
    script,
  };
  t.node(pascal(sid), "Control", null, rootProps);
  const bg = screen.background ?? doc.background ?? "none";
  if (bg.startsWith("#")) t.node("Background", "ColorRect", ".", { ...FULL, mouse_filter: 2, color: col(bg) });
  else {
    t.node("Backdrop", "ColorRect", ".", { ...FULL, mouse_filter: 2, color: col("#140e0a") });
    const img = opts.images.get(bg);
    if (img) t.node("Background", "TextureRect", ".", { ...FULL, mouse_filter: 2, texture: t.extRef("Texture2D", `res://${img}`), expand_mode: 1, stretch_mode: 6 });
  }
  if (screen.dim) t.node("Dim", "ColorRect", ".", { ...FULL, mouse_filter: 2, color: col("#080503", screen.dim) });

  const label = (parent: string, name: string, text: string, x: number, y: number, o: { size?: number; w?: number; align?: string; color?: string; variation?: string; title?: boolean; wrap?: boolean; shadow?: boolean } = {}) => {
    const size = o.size ?? 10;
    const W = o.w ?? 400;
    const left = o.align === "center" ? x - W / 2 : o.align === "right" ? x - W : x;
    const lines = o.wrap && o.w ? wrapText({ measureText: (s: string) => ({ width: measure(s, size, o.title) }) }, text, o.w).length : 1;
    const lh = size * LINE;
    t.node(name, "Label", parent, {
      ...rect(left, y - size * ASC, W, lh + (lines - 1) * size * 1.35 + 1),
      theme_type_variation: o.variation ? `&"${o.variation}"` : undefined,
      theme_override_colors__font_color: o.color ? col(o.color) : undefined,
      theme_override_colors__font_shadow_color: o.shadow === false ? col("#000000", 0) : undefined,
      theme_override_constants__line_spacing: o.wrap ? Math.round(size * (1.35 - LINE)) : undefined,
      theme_override_fonts__font: o.title && !o.variation ? titleFont() : undefined,
      theme_override_font_sizes__font_size: size,
      text: str(text),
      horizontal_alignment: o.align === "center" ? 1 : o.align === "right" ? 2 : undefined,
      autowrap_mode: o.wrap ? 3 : undefined,
    });
  };
  const plate = (title: string, cx: number, y: number) => {
    const tw = Math.round(measure(title, 9, true) + 16);
    const p = t.node("TitlePlate", "Panel", ".", { ...rect(cx - tw / 2, y - 7, tw, 15), theme_type_variation: '&"Plate"', mouse_filter: 2 });
    t.node("Label", "Label", p, { ...FULL, theme_type_variation: '&"PlateLabel"', text: str(title), horizontal_alignment: 1, vertical_alignment: 1 });
  };
  const slotNode = (parent: string, idx: number, s: number, item: { icon: string; count?: number } | null | undefined, selected: boolean) => {
    const n = t.node(`Slot${idx}`, "PanelContainer", parent, { custom_minimum_size: vec(s, s), layout_mode: 2, theme_type_variation: selected ? '&"SlotSelected"' : '&"Slot"', script: slotScript(), index: idx, item_id: item ? str(item.icon) : undefined, count: item?.count });
    if (item) {
      t.node("Icon", "TextureRect", n, { layout_mode: 2, mouse_filter: 2, texture: icon(item.icon), stretch_mode: 3 });
      if (item.count !== undefined && item.count > 1) t.node("Count", "Label", n, { layout_mode: 2, size_flags_horizontal: 8, size_flags_vertical: 8, theme_type_variation: '&"CountLabel"', text: str(String(item.count)), horizontal_alignment: 2, vertical_alignment: 2 });
    }
    return n;
  };
  const props = (wd: Widget) => (wd.id ? wd.id : undefined);

  screen.widgets.forEach((wd, k) => {
    const name = pascal(props(wd) ?? `${wd.type}_${k}`);
    switch (wd.type) {
      case "panel": {
        t.node(name, "Panel", ".", { ...rect(wd.x, wd.y, wd.w, wd.h), theme_type_variation: wd.small ? '&"PanelSmall"' : undefined, mouse_filter: 2 });
        if (wd.title) plate(wd.title, wd.x + wd.w / 2, wd.y);
        break;
      }
      case "label":
        label(".", name, wd.text, wd.x, wd.y, { size: wd.size, w: wd.w, align: wd.align, color: wd.color, variation: wd.font === "title" ? "TitleLabel" : undefined, title: wd.font === "title", wrap: !!wd.w, shadow: wd.shadow });
        break;
      case "button": {
        const h = wd.h ?? 20;
        const n = t.node(name, "Button", ".", { ...rect(wd.x, wd.y, wd.w, h), theme_override_font_sizes__font_size: Math.min(10, Math.max(7, h - 9)), disabled: wd.state === "disabled" ? "true" : undefined, text: str(wd.text), icon: wd.icon ? icon(wd.icon) : undefined });
        if (wd.state === "focus" || (!focus && wd.state === "hover")) focus = n;
        break;
      }
      case "menu": {
        const ih = wd.itemH ?? 20;
        const gap = wd.gap ?? 4;
        const top = wd.title ? 10 : 0;
        if (wd.panel !== false) {
          const bw = wd.w + 36;
          const bh = wd.items.length * ih + (wd.items.length - 1) * gap + 20 + top;
          t.node(`${name}Panel`, "Panel", ".", { ...rect(wd.x - 18, wd.y - 10, bw, bh), mouse_filter: 2 });
          if (wd.title) plate(wd.title, wd.x + wd.w / 2, wd.y - 10);
        }
        const box = t.node(name, "VBoxContainer", ".", { ...rect(wd.x, wd.y + top, wd.w, wd.items.length * ih + (wd.items.length - 1) * gap), theme_override_constants__separation: gap });
        wd.items.forEach((it, j) => {
          const b = t.node(`Item${j}`, "Button", box, { custom_minimum_size: vec(0, ih), layout_mode: 2, theme_override_font_sizes__font_size: Math.min(10, Math.max(7, ih - 9)), disabled: wd.disabled?.includes(j) ? "true" : undefined, text: str(it) });
          if (j === (wd.selected ?? 0) && !focus) focus = b;
        });
        break;
      }
      case "bar": {
        const h = wd.h ?? 10;
        let x = wd.x;
        if (wd.label) {
          label(".", `${name}Label`, wd.label, x, wd.y + h - 1.5, { size: 8, variation: "TitleLabel" });
          x += 22;
        }
        const variation = { hp: "HpBar", mp: "MpBar", xp: "XpBar", stamina: "StaminaBar" }[wd.kind];
        const n = t.node(name, "ProgressBar", ".", { ...rect(x, wd.y, wd.w, h), theme_type_variation: `&"${variation}"`, max_value: f(wd.max), value: f(wd.value), show_percentage: "false", mouse_filter: 2 });
        if (wd.showText) t.node("Text", "Label", n, { ...FULL, theme_override_colors__font_shadow_color: col("#000000"), theme_override_font_sizes__font_size: Math.max(6, h - 4), text: str(`${Math.round(wd.value)}/${Math.round(wd.max)}`), horizontal_alignment: 1, vertical_alignment: 1 });
        break;
      }
      case "inventory": {
        const s = wd.slot ?? 22;
        const gap = wd.gap ?? 2;
        const g = t.node(name, "GridContainer", ".", { ...rect(wd.x, wd.y, wd.cols * s + (wd.cols - 1) * gap, wd.rows * s + (wd.rows - 1) * gap), theme_override_constants__h_separation: gap, theme_override_constants__v_separation: gap, columns: wd.cols });
        for (let j = 0; j < wd.cols * wd.rows; j++) {
          const n = slotNode(g, j, s, wd.items[j], j === wd.selected);
          if (j === wd.selected && !focus) focus = n;
        }
        break;
      }
      case "hotbar": {
        const s = wd.slot ?? 22;
        const hb = t.node(name, "HBoxContainer", ".", { ...rect(wd.x, wd.y, wd.slots * s + (wd.slots - 1) * 2, s), theme_override_constants__separation: 2 });
        for (let j = 0; j < wd.slots; j++) slotNode(hb, j, s, wd.items[j], j === wd.selected);
        if (wd.keys !== false) {
          for (let j = 0; j < wd.slots; j++) {
            const x = wd.x + j * (s + 2) - 1;
            t.node(`${name}Key${j}`, "TextureRect", ".", { ...rect(x, wd.y - 1, 7, 7), mouse_filter: 2, texture: part("key_badge") });
            label(".", `${name}KeyLabel${j}`, String((j + 1) % 10), x + 3.5, wd.y + 5, { size: 6, w: 8, align: "center", color: C.button, shadow: false });
          }
        }
        break;
      }
      case "icon": {
        const k = wd.scale ?? 1;
        t.node(name, "TextureRect", ".", { ...rect(wd.x, wd.y, 16 * k, 16 * k), mouse_filter: 2, texture: icon(wd.icon), expand_mode: 1 });
        break;
      }
      case "toggle": {
        const n = t.node(name, "CheckBox", ".", { ...rect(wd.x - 2, wd.y - 1, wd.w ?? 120, 14), button_pressed: wd.on ? "true" : undefined, text: str(wd.text) });
        if (wd.focus && !focus) focus = n;
        break;
      }
      case "slider": {
        const lw = Math.round(wd.w * 0.42);
        label(".", `${name}Label`, wd.text, wd.x, wd.y + 10, { size: 9 });
        const n = t.node(name, "HSlider", ".", { ...rect(wd.x + lw, wd.y, wd.w - lw, 12), value: f(Math.round(wd.value * 100)) });
        if (wd.focus && !focus) focus = n;
        break;
      }
      case "tabs": {
        const tp: Record<string, string | number> = { ...rect(wd.x, wd.y, wd.w, 14), current_tab: wd.selected ?? 0, clip_tabs: "false", tab_count: wd.tabs.length };
        wd.tabs.forEach((tb, j) => (tp[`tab_${j}/title`] = str(tb)));
        t.node(name, "TabBar", ".", tp);
        break;
      }
      case "tooltip": {
        const tx = wd.icon ? 25 : 7;
        const lines = wrapText({ measureText: (s: string) => ({ width: measure(s, 8) }) }, wd.text, wd.w - tx - 7);
        const h = Math.max(wd.icon ? 30 : 0, 20 + lines.length * 10.5);
        const p = t.node(name, "Panel", ".", { ...rect(wd.x, wd.y, wd.w, h), theme_type_variation: '&"PanelSmall"', mouse_filter: 2 });
        if (wd.icon) {
          t.node("IconSlot", "Panel", p, { ...rect(5, 5, 18, 18), theme_type_variation: '&"Slot"', mouse_filter: 2 });
          t.node("Icon", "TextureRect", p, { ...rect(6, 6, 16, 16), mouse_filter: 2, texture: icon(wd.icon) });
        }
        label(p, "Title", wd.title, tx, 13, { size: 9, variation: "TitleLabel" });
        label(p, "Text", wd.text, tx, 24, { size: 8, w: wd.w - tx - 7, variation: "MutedLabel", wrap: true });
        break;
      }
      case "cursor":
        t.node(name, "TextureRect", ".", { ...rect(wd.x, wd.y, 10, 11), mouse_filter: 2, texture: part(wd.kind === "arrow" ? "cursor_arrow" : "cursor_hand") });
        break;
      case "image": {
        const img = opts.images.get(wd.src);
        if (img) t.node(name, "TextureRect", ".", { ...rect(wd.x, wd.y, wd.w ?? 32, wd.h ?? 32), mouse_filter: 2, texture: t.extRef("Texture2D", `res://${img}`), expand_mode: 1 });
        break;
      }
    }
  });
  t.node("FocusHand", "TextureRect", ".", { visible: "false", ...rect(0, 0, 10, 11), mouse_filter: 2, texture: part("cursor_hand") });
  // root script properties (patched in after nodes so focus is known)
  const root = t.nodes[0]!.split("\n");
  root.push(`initial_focus = NodePath(${str(focus ?? "")})`, `focus_hand = NodePath("FocusHand")`);
  if (opts.order.length > 1) root.push(`next_scene = ${scn(opts.order[(i + 1) % opts.order.length])}`, `prev_scene = ${scn(opts.order[(i - 1 + opts.order.length) % opts.order.length])}`);
  if (back) root.push(`back_scene = ${scn(back)}`);
  t.nodes[0] = root.join("\n");
  // Godot writes theme overrides with "/" — "__" above is just a JS-friendly key.
  return t.toString().replace(/theme_override_(colors|constants|fonts|font_sizes)__/g, "theme_override_$1/");
}

async function writeGodot(w: Writer, root: string, doc: UiDoc, warnings: string[]) {
  const order = Object.keys(doc.screens);
  for (const s of STYLES) {
    for (const p of Object.keys(PARTS)) await w.write(`easyui/textures/${s}/${p}.png`, partCanvas(s, p).toBuffer("image/png"));
    await w.write(`easyui/themes/${s}.tres`, godotTheme(s));
  }
  for (const n of ICON_NAMES) await w.write(`easyui/icons/${n}.png`, iconCanvas(n)!.toBuffer("image/png"));
  for (const f of ["Kanit-Regular.ttf", "Kanit-Medium.ttf", "OFL.txt"]) await w.copy(path.join(FONT_DIR, f), `easyui/fonts/${f}`);
  // OS mouse cursor at ×3 (the window is 1440×810).
  const hand = partCanvas(doc.style, "cursor_hand");
  const big = createCanvas(hand.width * 3, hand.height * 3);
  const bg = big.getContext("2d");
  bg.imageSmoothingEnabled = false;
  bg.drawImage(hand, 0, 0, big.width, big.height);
  await w.write("easyui/cursor_hand_x3.png", big.toBuffer("image/png"));
  await w.copy(path.join(RUNTIME_DIR, "godot", "easyui_screen.gd"), "easyui/easyui_screen.gd");
  await w.copy(path.join(RUNTIME_DIR, "godot", "easyui_slot.gd"), "easyui/easyui_slot.gd");
  const images = await copyImages(w, root, doc, "easyui/backgrounds/", warnings);
  for (const sid of order) await w.write(`scenes/${sid}.tscn`, godotScene(doc, sid, { order, images }));
  const main = order.includes("title") ? "title" : order[0]!;
  await w.write(
    "project.godot",
    `; Engine configuration file. Generated by Easy UI.
config_version=5

[application]

config/name=${str(`${doc.name} (Easy UI)`)}
run/main_scene="res://scenes/${main}.tscn"
config/features=PackedStringArray("4.3")

[display]

window/size/viewport_width=${doc.viewport.width}
window/size/viewport_height=${doc.viewport.height}
window/size/window_width_override=${doc.viewport.width * 3}
window/size/window_height_override=${doc.viewport.height * 3}
window/stretch/mode="canvas_items"
mouse_cursor/custom_image="res://easyui/cursor_hand_x3.png"

[gui]

theme/custom="res://easyui/themes/${doc.style}.tres"

[rendering]

textures/canvas_textures/default_texture_filter=0
`,
  );
  await w.write("test_ui.gd", godotTest(order));
  await w.write("screenshot.gd", godotShot(order));
  await w.write(
    "README.txt",
    `Easy UI — Godot 4.3+ export of "${doc.name}"

Open this folder as a project and press F5. Tab / Shift+Tab cycle the screens, Esc goes back, arrows and
Enter move focus (the hand cursor follows the focused control).

Use it in your own game:
  1. Copy easyui/ into your project root (scenes use res://easyui/…).
  2. Project Settings → GUI → Theme → Custom: res://easyui/themes/${doc.style}.tres  (or set it on one Control).
     teak / lantern / paper / night themes are all included.
  3. Theme type variations: PanelSmall, Plate, Slot, SlotSelected, HpBar, MpBar, XpBar, StaminaBar,
     TitleLabel, MutedLabel, PlateLabel, CountLabel (set "Theme Type Variation" in the inspector).
  4. scenes/*.tscn are plain Controls you can open and edit; easyui_screen.gd only handles focus + demo nav.
  For crisp Thai text keep stretch mode "canvas_items" (window ${doc.viewport.width * 3}×${doc.viewport.height * 3}, viewport ${doc.viewport.width}×${doc.viewport.height}).

Headless check:  godot --headless --editor --quit --path .   (imports)   then
                 godot --headless --path . --script res://test_ui.gd
Screenshots:     xvfb-run godot --path . --script res://screenshot.gd   (writes shots/*.png)
Generated by Easy UI (MIT). UI parts and icons are CC0; Kanit is SIL OFL 1.1.
`,
  );
  void usedIcons;
}

function godotTest(order: string[]): string {
  return `extends SceneTree
## Headless check (after one import pass: godot --headless --editor --quit --path .):
##   godot --headless --path . --script res://test_ui.gd
## Instantiates every screen, checks the theme, nine-slice styleboxes, textures and initial focus.

const SCREENS := ${JSON.stringify(order)}


func _initialize() -> void:
	_run.call_deferred()


func _run() -> void:
	var bad := 0
	for style in ${JSON.stringify(STYLES)}:
		var th = load("res://easyui/themes/%s.tres" % style)
		if not (th is Theme):
			print("FAIL theme ", style)
			bad += 1
			continue
		var sb = th.get_stylebox("panel", "Panel")
		var slot = th.get_stylebox("panel", "Slot")
		print("T| ", style, " panel=", sb.get_class(), " margin=", sb.texture_margin_left if sb is StyleBoxTexture else -1, " slot=", slot.get_class(), " font=", th.default_font.get_class() if th.default_font else "none", " variations=", th.get_type_variation_list("ProgressBar"))
		if not (sb is StyleBoxTexture) or sb.texture == null or not (slot is StyleBoxTexture):
			bad += 1
	for id in SCREENS:
		var ps = load("res://scenes/%s.tscn" % id)
		if not (ps is PackedScene):
			print("FAIL load ", id)
			bad += 1
			continue
		var s: Control = ps.instantiate()
		root.add_child(s)
		await process_frame
		await process_frame
		var counts := {}
		var missing := 0
		for n in s.find_children("*", "", true, false):
			counts[n.get_class()] = counts.get(n.get_class(), 0) + 1
			if n is TextureRect and n.texture == null:
				missing += 1
		var f = root.get_viewport().gui_get_focus_owner()
		print("S| ", id, " nodes=", counts.values().reduce(func(a, b): return a + b, 0), " ", counts, " focus=", f.name if f else "-", " missing_tex=", missing)
		if missing:
			bad += 1
		if not s.initial_focus.is_empty() and f == null:
			print("FAIL focus ", id)
			bad += 1
		s.queue_free()
		await process_frame
	if bad:
		print("FAIL ", bad)
		quit(1)
		return
	print("OK")
	quit(0)
`;
}

function godotShot(order: string[]): string {
  return `extends SceneTree
## Screenshots of every screen (needs a display or xvfb-run, not --headless):
##   xvfb-run -a godot --path . --script res://screenshot.gd
## Writes shots/<screen>.png at the window size.

const SCREENS := ${JSON.stringify(order)}


func _initialize() -> void:
	_run.call_deferred()


func _run() -> void:
	var dir := ProjectSettings.globalize_path("res://shots")
	DirAccess.make_dir_recursive_absolute(dir)
	for id in SCREENS:
		var s: Control = load("res://scenes/%s.tscn" % id).instantiate()
		root.add_child(s)
		for i in 6:
			await process_frame
		var img := root.get_viewport().get_texture().get_image()
		img.save_png(dir.path_join("%s.png" % id))
		print("SHOT| ", id, " ", img.get_size())
		s.queue_free()
		await process_frame
	quit(0)
`;
}
