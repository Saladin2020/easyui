import { createCanvas } from "@napi-rs/canvas";
import { PARTS, STYLE_COLORS, type Pixels } from "../shared/frames.js";
import { ICONS, ICON_NAMES, iconPixels } from "../shared/icons.js";
import { STYLES, type UiStyle } from "../shared/types.js";

export interface AtlasFrame {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Shelf-pack every UI part (per style) and every icon into one PNG. Deterministic order; 2px gutters. */
export function buildAtlas(styles: readonly UiStyle[] = STYLES, width = 256) {
  const items: { name: string; px: Pixels }[] = [];
  for (const s of styles) for (const p of Object.keys(PARTS)) items.push({ name: `${s}/${p}`, px: PARTS[p]!.make(s) });
  for (const n of ICON_NAMES) items.push({ name: `icon/${n}`, px: iconPixels(n) });
  const order = [...items].sort((a, b) => b.px.height - a.px.height || a.name.localeCompare(b.name));
  const G = 2;
  let x = G;
  let y = G;
  let rowH = 0;
  const frames: AtlasFrame[] = [];
  for (const it of order) {
    if (x + it.px.width + G > width) {
      x = G;
      y += rowH + G;
      rowH = 0;
    }
    frames.push({ name: it.name, x, y, w: it.px.width, h: it.px.height });
    x += it.px.width + G;
    rowH = Math.max(rowH, it.px.height);
  }
  let height = 1;
  while (height < y + rowH + G) height *= 2;
  const c = createCanvas(width, height);
  const g = c.getContext("2d");
  const byName = new Map(items.map((i) => [i.name, i.px]));
  for (const f of frames) {
    const px = byName.get(f.name)!;
    const img = g.createImageData(px.width, px.height);
    img.data.set(px.data);
    g.putImageData(img, f.x, f.y);
  }
  return { png: c.toBuffer("image/png"), width, height, frames };
}

/** PixiJS v8 Spritesheet JSON; nine-slice margins + colours + fonts in meta.easyui. */
export function atlasJson(frames: AtlasFrame[], size: { width: number; height: number }, opts: { image: string; defaultStyle: UiStyle; styles: readonly UiStyle[]; fonts: Record<string, string> }) {
  return {
    frames: Object.fromEntries(frames.map((f) => [f.name, { frame: { x: f.x, y: f.y, w: f.w, h: f.h }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: f.w, h: f.h }, sourceSize: { w: f.w, h: f.h } }])),
    meta: {
      app: "easyui",
      version: "1",
      image: opts.image,
      format: "RGBA8888",
      size: { w: size.width, h: size.height },
      scale: "1",
      easyui: {
        format: "easyui/1",
        defaultStyle: opts.defaultStyle,
        styles: opts.styles,
        margins: Object.fromEntries(Object.entries(PARTS).map(([k, v]) => [k, v.margin])),
        colors: STYLE_COLORS,
        icons: Object.fromEntries(ICON_NAMES.map((n) => [n, { th: ICONS[n]!.th, en: ICONS[n]!.en }])),
        fonts: opts.fonts,
      },
    },
  };
}
