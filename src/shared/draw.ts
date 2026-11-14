import { PARTS, STYLE_COLORS, type PartName } from "./frames.js";
import type { ItemRef, Screen, UiDoc, UiStyle, Widget } from "./types.js";

/**
 * Screen renderer shared by the CLI (@napi-rs/canvas) and the web editor (browser canvas).
 * Everything is laid out in viewport pixels (480×270 by default) and drawn at `scale` with nearest-neighbour
 * frames and Kanit text, so Thai stays sharp at any size.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Drawable = any;

export interface Ctx {
  imageSmoothingEnabled: boolean;
  fillStyle: any;
  font: string;
  textAlign: any;
  textBaseline: any;
  globalAlpha: number;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(t: string, x: number, y: number): void;
  measureText(t: string): { width: number };
  drawImage(img: Drawable, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number): void;
  save(): void;
  restore(): void;
}

export interface Provider {
  /** Drawable for a UI part of a style (frames.ts PARTS key). */
  part(style: UiStyle, name: PartName): Drawable;
  icon(name: string): Drawable | null;
  /** Workspace image (background or image widget), already loaded; null when missing. */
  image(src: string): Drawable | null;
  size(d: Drawable): { width: number; height: number };
}

export interface HitRect {
  index: number;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export const FONT_BODY = "Kanit";
export const FONT_TITLE = '"Kanit Medium"';

const segmenter = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter("th", { granularity: "word" }) : null;

/** Word-wrap with Thai word segmentation (no spaces needed). Widths in the context's current font. */
export function wrapText(g: Pick<Ctx, "measureText">, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    const words = segmenter ? [...segmenter.segment(para)].map((s) => s.segment) : para.split(/(\s+)/);
    let line = "";
    for (const w of words) {
      if (line && g.measureText(line + w).width > maxW) {
        out.push(line.trimEnd());
        line = w.trimStart();
      } else line += w;
    }
    out.push(line.trimEnd());
  }
  return out;
}

/** Widget bounding box in viewport pixels (for hit testing / the editor). */
export function widgetBox(w: Widget): { x: number; y: number; w: number; h: number } {
  switch (w.type) {
    case "panel":
      return { x: w.x, y: w.y, w: w.w, h: w.h };
    case "button":
      return { x: w.x, y: w.y, w: w.w, h: w.h ?? 20 };
    case "menu": {
      const ih = w.itemH ?? 20;
      const gap = w.gap ?? 4;
      const px = w.panel === false ? 0 : 18;
      const py = w.panel === false ? 0 : 10;
      const top = w.title ? 10 : 0;
      return { x: w.x - px, y: w.y - py, w: w.w + px * 2, h: w.items.length * ih + (w.items.length - 1) * gap + py * 2 + top };
    }
    case "bar":
      return { x: w.x, y: w.y, w: w.w + (w.label ? 22 : 0), h: w.h ?? 10 };
    case "inventory": {
      const s = w.slot ?? 22;
      const gap = w.gap ?? 2;
      return { x: w.x, y: w.y, w: w.cols * s + (w.cols - 1) * gap, h: w.rows * s + (w.rows - 1) * gap };
    }
    case "hotbar": {
      const s = w.slot ?? 22;
      return { x: w.x, y: w.y, w: w.slots * s + (w.slots - 1) * 2, h: s };
    }
    case "icon":
      return { x: w.x, y: w.y, w: 16 * (w.scale ?? 1), h: 16 * (w.scale ?? 1) };
    case "toggle":
      return { x: w.x, y: w.y, w: w.w ?? 120, h: 12 };
    case "slider":
      return { x: w.x, y: w.y, w: w.w, h: 12 };
    case "tabs":
      return { x: w.x, y: w.y, w: w.w, h: 14 };
    case "tooltip":
      return { x: w.x, y: w.y, w: w.w, h: 40 };
    case "cursor":
      return { x: w.x, y: w.y, w: 10, h: 11 };
    case "image":
      return { x: w.x, y: w.y, w: w.w ?? 32, h: w.h ?? 32 };
    case "label":
      return { x: w.align === "center" ? w.x - (w.w ?? 100) / 2 : w.align === "right" ? w.x - (w.w ?? 100) : w.x, y: w.y - (w.size ?? 10), w: w.w ?? 100, h: (w.size ?? 10) * 1.4 };
  }
}

export interface DrawOptions {
  scale?: number;
  /** Override the screen / doc style. */
  style?: UiStyle;
  /** Highlight a widget index (editor selection). */
  selected?: number;
}

export function drawScreen(g: Ctx, doc: UiDoc, screen: Screen, P: Provider, opts: DrawOptions = {}): HitRect[] {
  const S = opts.scale ?? 3;
  const style: UiStyle = opts.style ?? screen.style ?? doc.style;
  const C = STYLE_COLORS[style];
  const VW = doc.viewport.width;
  const VH = doc.viewport.height;
  g.imageSmoothingEnabled = false;
  g.textBaseline = "alphabetic";
  const hits: HitRect[] = [];

  const nine = (part: PartName, x: number, y: number, w: number, h: number) => {
    const img = P.part(style, part);
    const m = PARTS[part]!.margin;
    const { width: iw, height: ih } = P.size(img);
    if (!m) return g.drawImage(img, 0, 0, iw, ih, x * S, y * S, w * S, h * S);
    const xs = [0, m, iw - m, iw];
    const ys = [0, m, ih - m, ih];
    const dx = [x, x + m, x + w - m, x + w];
    const dy = [y, y + m, y + h - m, y + h];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const sw = xs[c + 1]! - xs[c]!;
        const sh = ys[r + 1]! - ys[r]!;
        const dw = dx[c + 1]! - dx[c]!;
        const dh = dy[r + 1]! - dy[r]!;
        if (sw > 0 && sh > 0 && dw > 0 && dh > 0) g.drawImage(img, xs[c]!, ys[r]!, sw, sh, dx[c]! * S, dy[r]! * S, dw * S, dh * S);
      }
    }
  };
  const sprite = (img: Drawable, x: number, y: number, k = 1) => {
    if (!img) return;
    const { width, height } = P.size(img);
    g.drawImage(img, 0, 0, width, height, Math.round(x) * S, Math.round(y) * S, width * k * S, height * k * S);
  };
  const text = (t: string, x: number, y: number, o: { size?: number; color?: string; align?: "left" | "center" | "right"; title?: boolean; shadow?: string | false } = {}) => {
    const size = o.size ?? 10;
    g.font = `${size * S}px ${o.title ? `${FONT_TITLE}, ${FONT_BODY}` : FONT_BODY}, sans-serif`;
    g.textAlign = o.align ?? "left";
    if (o.shadow !== false) {
      g.fillStyle = o.shadow ?? C.shadow;
      g.fillText(t, (x + 0.6) * S, (y + 0.6) * S);
    }
    g.fillStyle = o.color ?? C.text;
    g.fillText(t, x * S, y * S);
    g.textAlign = "left";
  };
  const measure = (t: string, size = 10, title = false) => {
    g.font = `${size * S}px ${title ? `${FONT_TITLE}, ${FONT_BODY}` : FONT_BODY}, sans-serif`;
    return g.measureText(t).width / S;
  };
  const slot = (x: number, y: number, s: number, item: ItemRef | null | undefined, selected: boolean) => {
    nine(selected ? "slot_selected" : "slot", x, y, s, s);
    if (item) {
      const ic = P.icon(item.icon);
      const k = s >= 36 ? 2 : 1;
      if (ic) sprite(ic, x + (s - 16 * k) / 2, y + (s - 16 * k) / 2, k);
      if (item.count !== undefined && item.count > 1) text(String(item.count), x + s - 2.5, y + s - 2.5, { size: 7, align: "right", color: C.slotCount, shadow: "#000000" });
    }
  };
  const button = (x: number, y: number, w: number, h: number, label: string, state: string, icon?: string) => {
    nine(`button_${state}` as PartName, x, y, w, h);
    const off = state === "pressed" ? 1 : 0;
    const col = state === "disabled" ? C.disabled : state === "hover" || state === "focus" ? C.buttonHi : C.button;
    const fs = Math.min(10, Math.max(7, h - 9));
    let tx = x + w / 2;
    if (icon) {
      const ic = P.icon(icon);
      const iw = measure(label, fs, true) + 19;
      const ix = x + (w - iw) / 2;
      if (ic) sprite(ic, ix, y + (h - 2 - 16) / 2 + off);
      tx = ix + 19 + measure(label, fs, true) / 2;
    }
    text(label, tx, y + h / 2 + fs * 0.36 + off - 1, { size: fs, align: "center", color: col, title: true, shadow: false });
  };

  // background
  const bg = screen.background ?? doc.background ?? "none";
  if (bg.startsWith("#")) {
    g.fillStyle = bg;
    g.fillRect(0, 0, VW * S, VH * S);
  } else {
    g.fillStyle = "#140e0a";
    g.fillRect(0, 0, VW * S, VH * S);
    const img = bg !== "none" ? P.image(bg) : null;
    if (img) {
      const { width, height } = P.size(img);
      const k = Math.max(VW / width, VH / height);
      g.drawImage(img, 0, 0, width, height, ((VW - width * k) / 2) * S, (VH - height * k) * S, width * k * S, height * k * S);
    }
  }
  if (screen.dim) {
    g.fillStyle = `rgba(8,5,3,${screen.dim})`;
    g.fillRect(0, 0, VW * S, VH * S);
  }

  screen.widgets.forEach((w, index) => {
    switch (w.type) {
      case "panel": {
        nine(w.small ? "panel_small" : "panel", w.x, w.y, w.w, w.h);
        if (w.title) {
          const tw = measure(w.title, 9, true) + 16;
          const px = w.x + (w.w - tw) / 2;
          nine("plate", px, w.y - 7, tw, 15);
          text(w.title, w.x + w.w / 2, w.y + 3.5, { size: 9, align: "center", color: C.button, title: true, shadow: false });
        }
        break;
      }
      case "label": {
        const size = w.size ?? 10;
        const lines = w.w ? wrapText({ measureText: (t: string) => ({ width: measure(t, size, w.font === "title") }) }, w.text, w.w) : [w.text];
        lines.forEach((ln, i) => text(ln, w.x, w.y + i * size * 1.35, { size, color: w.color ?? (w.font === "title" ? C.title : C.text), align: w.align, title: w.font === "title", shadow: w.shadow === false ? false : undefined }));
        break;
      }
      case "button":
        button(w.x, w.y, w.w, w.h ?? 20, w.text, w.state ?? "normal", w.icon);
        break;
      case "menu": {
        const ih = w.itemH ?? 20;
        const gap = w.gap ?? 4;
        if (w.panel !== false) {
          const b = widgetBox(w);
          nine("panel", b.x, b.y, b.w, b.h);
          if (w.title) {
            const tw = measure(w.title, 9, true) + 16;
            nine("plate", b.x + (b.w - tw) / 2, b.y - 7, tw, 15);
            text(w.title, b.x + b.w / 2, b.y + 3.5, { size: 9, align: "center", color: C.button, title: true, shadow: false });
          }
        }
        const top = w.title ? 10 : 0;
        w.items.forEach((it, i) => {
          const y = w.y + top + i * (ih + gap);
          const st = w.disabled?.includes(i) ? "disabled" : i === (w.selected ?? 0) ? "focus" : "normal";
          button(w.x, y, w.w, ih, it, st);
          if (st === "focus") sprite(P.part(style, "cursor_hand"), w.x - 13, y + (ih - 11) / 2);
        });
        break;
      }
      case "bar": {
        const h = w.h ?? 10;
        let x = w.x;
        if (w.label) {
          text(w.label, x, w.y + h - 1.5, { size: 8, color: C.title, title: true });
          x += 22;
        }
        nine("bar_bg", x, w.y, w.w, h);
        const ratio = Math.max(0, Math.min(1, w.max > 0 ? w.value / w.max : 0));
        const fw = Math.round((w.w - 4) * ratio);
        if (fw > 0) nine(`bar_${w.kind}` as PartName, x + 2, w.y + 2, fw, h - 4);
        if (w.showText) text(`${Math.round(w.value)}/${Math.round(w.max)}`, x + w.w / 2, w.y + h - 2.6, { size: Math.max(6, h - 4), align: "center", color: "#ffffff", shadow: "#000000" });
        break;
      }
      case "inventory": {
        const s = w.slot ?? 22;
        const gap = w.gap ?? 2;
        for (let i = 0; i < w.cols * w.rows; i++) slot(w.x + (i % w.cols) * (s + gap), w.y + Math.floor(i / w.cols) * (s + gap), s, w.items[i], i === w.selected);
        break;
      }
      case "hotbar": {
        const s = w.slot ?? 22;
        for (let i = 0; i < w.slots; i++) {
          const x = w.x + i * (s + 2);
          slot(x, w.y, s, w.items[i], i === w.selected);
          if (w.keys !== false) {
            sprite(P.part(style, "key_badge"), x - 1, w.y - 1);
            text(String((i + 1) % 10), x + 2.5, w.y + 5, { size: 6, align: "center", color: C.button, shadow: false });
          }
        }
        break;
      }
      case "icon": {
        const ic = P.icon(w.icon);
        if (ic) sprite(ic, w.x, w.y, w.scale ?? 1);
        break;
      }
      case "toggle": {
        sprite(P.part(style, w.on ? "check_on" : "check_off"), w.x, w.y + 1);
        text(w.text, w.x + 15, w.y + 10, { size: 9 });
        if (w.focus) sprite(P.part(style, "cursor_hand"), w.x - 13, w.y + 1);
        break;
      }
      case "slider": {
        const lw = Math.round(w.w * 0.42);
        text(w.text, w.x, w.y + 10, { size: 9 });
        const tx = w.x + lw;
        const tw = w.w - lw;
        nine("slider_track", tx, w.y + 3, tw, 6);
        const v = Math.max(0, Math.min(1, w.value));
        const fw = Math.round((tw - 4) * v);
        if (fw > 0) nine("slider_fill", tx + 2, w.y + 4, fw, 4);
        sprite(P.part(style, "slider_knob"), tx + 2 + fw - 3.5, w.y + 1);
        if (w.focus) sprite(P.part(style, "cursor_hand"), w.x - 13, w.y + 1);
        break;
      }
      case "tabs": {
        const n = w.tabs.length;
        const tw = Math.floor((w.w - (n - 1) * 2) / n);
        w.tabs.forEach((t, i) => {
          const on = i === (w.selected ?? 0);
          nine(on ? "tab_on" : "tab_off", w.x + i * (tw + 2), w.y + (on ? 0 : 2), tw, on ? 14 : 12);
          text(t, w.x + i * (tw + 2) + tw / 2, w.y + 10.5, { size: 8, align: "center", color: on ? C.title : C.muted, title: true });
        });
        break;
      }
      case "tooltip": {
        const ic = w.icon ? P.icon(w.icon) : null;
        const tx = w.x + (ic ? 25 : 7);
        const lines = wrapText({ measureText: (t: string) => ({ width: measure(t, 8) }) }, w.text, w.w - (tx - w.x) - 7);
        const h = Math.max(ic ? 30 : 0, 20 + lines.length * 10.5);
        nine("panel_small", w.x, w.y, w.w, h);
        if (ic) {
          nine("slot", w.x + 5, w.y + 5, 18, 18);
          sprite(ic, w.x + 6, w.y + 6);
        }
        text(w.title, tx, w.y + 13, { size: 9, color: C.title, title: true });
        lines.forEach((ln, i) => text(ln, tx, w.y + 24 + i * 10.5, { size: 8, color: C.muted }));
        break;
      }
      case "cursor":
        sprite(P.part(style, w.kind === "arrow" ? "cursor_arrow" : "cursor_hand"), w.x, w.y);
        break;
      case "image": {
        const img = P.image(w.src);
        if (img) {
          const { width, height } = P.size(img);
          g.drawImage(img, 0, 0, width, height, w.x * S, w.y * S, (w.w ?? width) * S, (w.h ?? height) * S);
        }
        break;
      }
    }
    const b = widgetBox(w);
    hits.push({ index, type: w.type, ...b });
  });

  if (opts.selected !== undefined && hits[opts.selected]) {
    const h = hits[opts.selected]!;
    g.fillStyle = "rgba(143,199,232,0.9)";
    for (const [x, y, ww, hh] of [[h.x - 1, h.y - 1, h.w + 2, 1], [h.x - 1, h.y + h.h, h.w + 2, 1], [h.x - 1, h.y, 1, h.h], [h.x + h.w, h.y, 1, h.h]] as const) g.fillRect(x * S, y * S, ww * S, hh * S);
  }
  return hits;
}
