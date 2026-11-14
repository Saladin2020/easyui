import { readFile } from "node:fs/promises";
import { createCanvas, loadImage, type Canvas, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import { drawScreen, type Ctx, type DrawOptions, type HitRect, type Provider } from "../shared/draw.js";
import { PARTS, STYLE_COLORS, STYLE_LABELS, type Pixels } from "../shared/frames.js";
import { ICONS, ICON_NAMES, iconPixels, isIcon } from "../shared/icons.js";
import { STYLES, type Screen, type UiDoc, type UiStyle } from "../shared/types.js";
import { registerFonts } from "./assets.js";
import { resolveInside } from "./workspace.js";

export function pixelsToCanvas(p: Pixels): Canvas {
  const c = createCanvas(p.width, p.height);
  const g = c.getContext("2d");
  const img = g.createImageData(p.width, p.height);
  img.data.set(p.data);
  g.putImageData(img, 0, 0);
  return c;
}

const partCache = new Map<string, Canvas>();
export function partCanvas(style: UiStyle, name: string): Canvas {
  const k = `${style}/${name}`;
  let c = partCache.get(k);
  if (!c) {
    const def = PARTS[name];
    if (!def) throw new Error(`Unknown UI part ${name}`);
    c = pixelsToCanvas(def.make(style));
    partCache.set(k, c);
  }
  return c;
}
const iconCache = new Map<string, Canvas>();
export function iconCanvas(name: string): Canvas | null {
  if (!isIcon(name)) return null;
  let c = iconCache.get(name);
  if (!c) {
    c = pixelsToCanvas(iconPixels(name));
    iconCache.set(name, c);
  }
  return c;
}

/** Provider backed by @napi-rs/canvas; preloads every workspace image a doc references. */
export async function nodeProvider(root: string, doc: UiDoc): Promise<Provider> {
  const images = new Map<string, Image>();
  const want = new Set<string>();
  if (doc.background) want.add(doc.background);
  for (const s of Object.values(doc.screens)) {
    if (s.background) want.add(s.background);
    for (const w of s.widgets) if (w.type === "image") want.add(w.src);
  }
  for (const src of want) {
    if (src === "none" || src.startsWith("#")) continue;
    try {
      images.set(src, await loadImage(await readFile(resolveInside(root, src))));
    } catch {
      /* missing → reported by fileWarnings, rendered as a dark fill */
    }
  }
  return {
    part: (style, name) => partCanvas(style, name),
    icon: (name) => iconCanvas(name),
    image: (src) => images.get(src) ?? null,
    size: (d) => ({ width: d.width, height: d.height }),
  };
}

export async function renderScreenPng(root: string, doc: UiDoc, screenId: string, opts: DrawOptions = {}): Promise<{ png: Buffer; hits: HitRect[]; width: number; height: number }> {
  registerFonts();
  const screen: Screen | undefined = doc.screens[screenId];
  if (!screen) throw new Error(`Screen "${screenId}" not in doc (have: ${Object.keys(doc.screens).join(", ")})`);
  const S = opts.scale ?? 3;
  const c = createCanvas(doc.viewport.width * S, doc.viewport.height * S);
  const hits = drawScreen(c.getContext("2d") as unknown as Ctx, doc, screen, await nodeProvider(root, doc), { ...opts, scale: S });
  return { png: c.toBuffer("image/png"), hits, width: c.width, height: c.height };
}

function label(g: SKRSContext2D, t: string, x: number, y: number, size: number, color: string, align: "left" | "center" | "right" = "left") {
  g.font = `${size}px Kanit, sans-serif`;
  g.textAlign = align;
  g.fillStyle = color;
  g.fillText(t, x, y);
}

/** Icon sheet: every icon at ×scale with Thai + English names. */
export function iconSheetPng(scale = 4, cols = 6): Buffer {
  registerFonts();
  const cell = 16 * scale;
  const cw = cell + 76;
  const ch = cell + 34;
  const rows = Math.ceil(ICON_NAMES.length / cols);
  const c = createCanvas(cols * cw + 24, rows * ch + 24);
  const g = c.getContext("2d");
  g.imageSmoothingEnabled = false;
  g.fillStyle = "#1d140d";
  g.fillRect(0, 0, c.width, c.height);
  ICON_NAMES.forEach((n, i) => {
    const x = 12 + (i % cols) * cw;
    const y = 12 + Math.floor(i / cols) * ch;
    g.fillStyle = "#2a1d13";
    g.fillRect(x + 4, y + 2, cw - 8, ch - 4);
    g.drawImage(iconCanvas(n)!, x + (cw - cell) / 2, y + 4, cell, cell);
    let fs = 14;
    for (; fs > 9; fs--) {
      g.font = `${fs}px Kanit, sans-serif`;
      if (g.measureText(ICONS[n]!.th).width <= cw - 12) break;
    }
    label(g, ICONS[n]!.th, x + cw / 2, y + cell + 18, fs, "#f7ebd3", "center");
    label(g, n, x + cw / 2, y + cell + 30, 10, "#a08566", "center");
  });
  return c.toBuffer("image/png");
}

/** Style sheet: every part in every style at ×scale, one row per style. */
export function styleSheetPng(scale = 4): Buffer {
  registerFonts();
  const names = Object.keys(PARTS);
  const pad = 10;
  const widths = names.map((n) => PARTS[n]!.make("teak").width * scale);
  const rowH = 26 * scale + 30;
  const c = createCanvas(widths.reduce((a, b) => a + b + pad, pad) + 10, STYLES.length * rowH + 10);
  const g = c.getContext("2d");
  g.imageSmoothingEnabled = false;
  g.fillStyle = "#1d140d";
  g.fillRect(0, 0, c.width, c.height);
  STYLES.forEach((s, r) => {
    const y = 10 + r * rowH;
    label(g, STYLE_LABELS[s], pad, y + 16, 16, STYLE_COLORS.teak.title);
    let x = pad;
    names.forEach((n, i) => {
      const pc = partCanvas(s, n);
      g.drawImage(pc, x, y + 26, pc.width * scale, pc.height * scale);
      x += widths[i]! + pad;
    });
  });
  return c.toBuffer("image/png");
}
