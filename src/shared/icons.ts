import { hx, type Pixels, type RGBA } from "./frames.js";

/**
 * 24 procedural 16×16 item icons for a Thai village game (CC0). Each icon is drawn with a few shapes, then
 * auto-shaded (light top edge, dark bottom edge) and outlined, so the set stays consistent.
 */

const OUTLINE = hx("#1a1008");
const S = 16;

class Ico {
  p: Pixels = { width: S, height: S, data: new Uint8ClampedArray(S * S * 4) };
  /** Pixels that must not be auto-shaded (eyes, glints, text). */
  keep = new Set<number>();
  px(x: number, y: number, c: string, keep = false) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= S || y >= S) return;
    this.p.data.set(c === "clear" ? [0, 0, 0, 0] : hx(c), (y * S + x) * 4);
    if (keep) this.keep.add(y * S + x);
  }
  rect(x: number, y: number, w: number, h: number, c: string) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.px(xx, yy, c);
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, c: string) {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) this.px(x, y, c);
  }
  circle(cx: number, cy: number, r: number, c: string) {
    this.ellipse(cx, cy, r, r, c);
  }
  poly(pts: [number, number][], c: string) {
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const X = x + 0.5;
        const Y = y + 0.5;
        let inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const [xi, yi] = pts[i]!;
          const [xj, yj] = pts[j]!;
          if (yi > Y !== yj > Y && X < ((xj - xi) * (Y - yi)) / (yj - yi) + xi) inside = !inside;
        }
        if (inside) this.px(x, y, c);
      }
    }
  }
  line(x0: number, y0: number, x1: number, y1: number, c: string, keep = false) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) this.px(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, c, keep);
  }
  alpha(x: number, y: number) {
    return x < 0 || y < 0 || x >= S || y >= S ? 0 : this.p.data[(y * S + x) * 4 + 3]!;
  }
  /** Shade + outline. */
  done(): Pixels {
    const d = this.p.data;
    const src = new Uint8ClampedArray(d);
    const a = (x: number, y: number) => (x < 0 || y < 0 || x >= S || y >= S ? 0 : src[(y * S + x) * 4 + 3]!);
    const same = (x: number, y: number, x2: number, y2: number) => {
      if (a(x2, y2) === 0) return false;
      const i = (y * S + x) * 4;
      const j = (y2 * S + x2) * 4;
      return src[i] === src[j] && src[i + 1] === src[j + 1] && src[i + 2] === src[j + 2];
    };
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const i = (y * S + x) * 4;
        if (!src[i + 3] || this.keep.has(y * S + x)) continue;
        const k = !same(x, y, x, y - 1) && !same(x, y, x - 1, y) ? 1.25 : !same(x, y, x, y + 1) || !same(x, y, x + 1, y) ? 0.72 : 1;
        if (k !== 1) for (let c = 0; c < 3; c++) d[i + c] = Math.min(255, Math.round(src[i + c]! * k + (k > 1 ? 12 : 0)));
      }
    }
    const shaded = new Uint8ClampedArray(d);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        if (shaded[(y * S + x) * 4 + 3]) continue;
        if (a(x - 1, y) || a(x + 1, y) || a(x, y - 1) || a(x, y + 1)) d.set(OUTLINE, (y * S + x) * 4);
      }
    }
    return this.p;
  }
}

type Draw = (g: Ico) => void;

export const ICONS: Record<string, { th: string; en: string; draw: Draw }> = {
  package: { th: "พัสดุ", en: "Package", draw: (g) => {
    g.rect(2, 5, 12, 9, "#b07a43");
    g.poly([[2, 5], [5, 2], [14, 2], [14, 5]], "#cf9a5c");
    g.rect(7, 2, 2, 12, "#e8d2a6");
    g.rect(2, 8, 12, 1, "#e8d2a6");
    g.px(6, 1, "#e5806c", true); g.px(9, 1, "#e5806c", true); g.px(7, 1, "#e5806c", true); g.px(8, 1, "#e5806c", true);
  } },
  rice_bowl: { th: "ข้าวสวย", en: "Rice bowl", draw: (g) => {
    g.ellipse(8, 7.5, 5.5, 3.5, "#f7f2e4");
    g.poly([[1.5, 8], [14.5, 8], [12, 13], [4, 13]], "#4f86b0");
    g.rect(5, 13, 6, 1, "#2e5a80");
    g.rect(2, 10, 12, 1, "#c8ecff");
    g.px(6, 6, "#ffffff", true); g.px(9, 5, "#ffffff", true);
  } },
  mango: { th: "มะม่วง", en: "Mango", draw: (g) => {
    g.ellipse(8.5, 9, 5, 5.5, "#f4c13d");
    g.ellipse(10.5, 11, 3, 3, "#f08a2a");
    g.line(8, 3, 9, 4, "#5e3a1c");
    g.poly([[9, 3], [13, 1.5], [12, 4]], "#5fbf4a");
  } },
  lantern: { th: "โคมไฟ", en: "Lantern", draw: (g) => {
    g.ellipse(8, 8.5, 5, 4.5, "#d8402e");
    g.rect(5, 3, 6, 2, "#f4ae3d");
    g.rect(5, 12, 6, 2, "#f4ae3d");
    g.rect(7, 1, 2, 2, "#5e3a1c");
    g.line(8, 14, 8, 15, "#f4ae3d");
    g.rect(6, 6, 1, 5, "#ffb37a");
    g.px(10, 7, "#fff3c4", true);
  } },
  key: { th: "กุญแจ", en: "Key", draw: (g) => {
    g.circle(5, 5, 3.6, "#f4c13d");
    g.circle(5, 5, 1.4, "clear");
    g.line(7, 7, 13, 13, "#f4c13d");
    g.line(8, 7, 14, 13, "#f4c13d");
    g.rect(10, 12, 2, 2, "#f4c13d");
    g.rect(12, 10, 2, 2, "#f4c13d");
  } },
  coin: { th: "เหรียญบาท", en: "Coin", draw: (g) => {
    g.circle(8, 8, 6, "#f4ae3d");
    g.circle(8, 8, 4, "#ffd27a");
    g.rect(7, 5, 2, 6, "#b9741f");
    g.rect(6, 6, 4, 1, "#b9741f");
    g.rect(6, 9, 4, 1, "#b9741f");
  } },
  sticky_rice: { th: "กระติบข้าวเหนียว", en: "Sticky rice basket", draw: (g) => {
    g.rect(4, 4, 8, 3, "#d9a95f");
    g.ellipse(8, 10, 5, 4.5, "#c48a3c");
    for (let y = 7; y < 14; y += 2) g.rect(4, y, 8, 1, "#e8c27a");
    g.rect(7, 2, 2, 2, "#7a4a1e");
    g.rect(3, 14, 3, 1, "#7a4a1e");
    g.rect(10, 14, 3, 1, "#7a4a1e");
  } },
  banana: { th: "กล้วย", en: "Banana", draw: (g) => {
    g.ellipse(8, 7.5, 6.5, 5.5, "#f7d84a");
    g.ellipse(8, 4.2, 6.2, 4.8, "clear");
    g.line(5, 10, 11, 10, "#fff1a8", true);
    g.rect(1, 6, 2, 2, "#5e3a1c");
    g.px(14, 7, "#5e3a1c");
  } },
  coconut: { th: "มะพร้าว", en: "Coconut", draw: (g) => {
    g.circle(8, 9, 6, "#7a4a1e");
    g.circle(8, 6.5, 2.5, "#9a6d43");
    g.px(6, 6, "#2a1606", true); g.px(9, 6, "#2a1606", true); g.px(8, 8, "#2a1606", true);
    g.poly([[8, 4], [5, 1], [11, 1]], "#5fbf4a");
  } },
  fish: { th: "ปลาทู", en: "Mackerel", draw: (g) => {
    g.ellipse(7, 8, 5.5, 3.2, "#8fb7c8");
    g.ellipse(7, 9.5, 4.5, 1.5, "#dbe8ee");
    g.poly([[11, 8], [15, 4], [15, 12]], "#6f97a8");
    g.px(4, 7, "#0d0906", true);
    g.line(6, 6, 9, 6, "#4f7788");
  } },
  chili: { th: "พริก", en: "Chili", draw: (g) => {
    g.poly([[4, 5], [7, 4], [10, 7], [13, 13], [11, 13], [6, 8]], "#e0402e");
    g.rect(4, 2, 2, 3, "#3f7d52");
    g.rect(3, 4, 4, 1, "#5fbf4a");
    g.px(7, 6, "#ff9a8a", true);
  } },
  lotus: { th: "ดอกบัว", en: "Lotus", draw: (g) => {
    g.poly([[8, 2], [11, 8], [8, 12], [5, 8]], "#f29ab8");
    g.poly([[2, 6], [7, 10], [8, 12], [3, 11]], "#e5779c");
    g.poly([[14, 6], [9, 10], [8, 12], [13, 11]], "#e5779c");
    g.rect(3, 12, 10, 2, "#5fbf4a");
    g.px(8, 4, "#ffd6e6", true);
  } },
  thai_tea: { th: "ชาเย็น", en: "Thai iced tea", draw: (g) => {
    g.poly([[4, 4], [12, 4], [11, 14], [5, 14]], "#f08a2a");
    g.rect(4, 4, 8, 2, "#fff3e4");
    g.rect(5, 9, 6, 1, "#ffb36a");
    g.line(10, 1, 9, 6, "#e5806c", true);
    g.line(11, 1, 10, 6, "#e5806c", true);
  } },
  letter: { th: "จดหมาย", en: "Letter", draw: (g) => {
    g.rect(2, 4, 12, 9, "#f7ebd3");
    g.line(2, 4, 8, 9, "#cdb492");
    g.line(14, 4, 8, 9, "#cdb492");
    g.rect(7, 8, 2, 2, "#d8402e");
  } },
  map: { th: "แผนที่", en: "Map", draw: (g) => {
    g.poly([[2, 3], [6, 2], [10, 3], [14, 2], [14, 13], [10, 14], [6, 13], [2, 14]], "#e8d2a6");
    g.rect(6, 2, 1, 12, "#cdb492");
    g.rect(10, 3, 1, 11, "#cdb492");
    for (const [x, y] of [[3, 11], [5, 10], [7, 9], [8, 7]] as const) g.px(x, y, "#8a3a22", true);
    g.line(10, 4, 12, 6, "#d8402e", true);
    g.line(12, 4, 10, 6, "#d8402e", true);
  } },
  bell: { th: "ระฆัง", en: "Temple bell", draw: (g) => {
    g.poly([[5, 4], [11, 4], [13, 12], [3, 12]], "#d9a33d");
    g.rect(2, 12, 12, 2, "#b9741f");
    g.rect(7, 2, 2, 2, "#7a4a1e");
    g.rect(7, 14, 2, 1, "#5e3a1c");
    g.rect(5, 7, 6, 1, "#f4c13d");
  } },
  umbrella: { th: "ร่มบ่อสร้าง", en: "Paper umbrella", draw: (g) => {
    g.ellipse(8, 8, 7, 5.5, "#e0402e");
    g.rect(0, 8, 16, 8, "clear");
    for (const x of [3, 6, 9, 12]) g.line(8, 3, x, 8, "#ffd27a", true);
    g.line(8, 8, 8, 14, "#7a4a1e");
    g.px(7, 14, "#7a4a1e");
  } },
  candle: { th: "เทียน", en: "Candle", draw: (g) => {
    g.rect(6, 7, 4, 7, "#fff6dc");
    g.rect(4, 13, 8, 2, "#d9a33d");
    g.ellipse(8, 4, 2.2, 3.2, "#f4ae3d");
    g.rect(8, 3, 1, 3, "#fff3c4");
  } },
  garland: { th: "พวงมาลัย", en: "Jasmine garland", draw: (g) => {
    for (let i = 0; i < 12; i++) {
      const t = (i / 12) * Math.PI * 2;
      g.circle(8 + Math.cos(t) * 4.5, 7 + Math.sin(t) * 4.5, 1.4, "#fbf7ee");
    }
    g.circle(8, 12, 1.8, "#d8402e");
    g.rect(7, 13, 1, 2, "#5fbf4a");
    g.rect(9, 13, 1, 2, "#5fbf4a");
  } },
  herb: { th: "สมุนไพร", en: "Herb", draw: (g) => {
    g.poly([[8, 14], [3, 8], [4, 3], [8, 6]], "#5fbf4a");
    g.poly([[8, 14], [13, 8], [12, 3], [8, 6]], "#4aa63a");
    g.line(8, 6, 8, 14, "#2c6e26", true);
  } },
  medicine: { th: "ยาหอม", en: "Medicine", draw: (g) => {
    g.rect(4, 6, 8, 8, "#5fa8d8");
    g.rect(6, 3, 4, 3, "#c8ecff");
    g.rect(5, 2, 6, 1, "#b07a43");
    g.rect(5, 8, 6, 4, "#fff6dc");
    g.rect(7, 9, 2, 2, "#e0402e");
  } },
  scroll: { th: "คัมภีร์", en: "Scroll", draw: (g) => {
    g.rect(4, 3, 8, 10, "#efdcae");
    g.rect(3, 2, 10, 2, "#b07a43");
    g.rect(3, 12, 10, 2, "#b07a43");
    for (const y of [5, 7, 9]) g.rect(5, y, 6, 1, "#8a6a44");
  } },
  egg: { th: "ไข่", en: "Egg", draw: (g) => {
    g.ellipse(8, 8.5, 4.5, 5.5, "#f7ebd3");
    g.px(6, 5, "#ffffff", true);
    g.px(6, 6, "#ffffff", true);
  } },
  broom: { th: "ไม้กวาด", en: "Broom", draw: (g) => {
    g.line(12, 1, 7, 9, "#9a6d43");
    g.line(13, 2, 8, 9, "#7a4a1e");
    g.poly([[6, 8], [9, 10], [7, 15], [2, 13]], "#d9c27a");
    g.line(4, 12, 6, 10, "#b7a050", true);
    g.line(6, 13, 7, 11, "#b7a050", true);
  } },
};

export const ICON_NAMES = Object.keys(ICONS);

const cache = new Map<string, Pixels>();
export function iconPixels(name: string): Pixels {
  let p = cache.get(name);
  if (!p) {
    const def = ICONS[name];
    if (!def) throw new Error(`Unknown icon "${name}" (${ICON_NAMES.join(", ")})`);
    const g = new Ico();
    def.draw(g);
    p = g.done();
    cache.set(name, p);
  }
  return p;
}

export function isIcon(name: string): boolean {
  return name in ICONS;
}
export type { RGBA };
