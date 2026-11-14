import type { UiStyle } from "./types.js";

/**
 * CC0 procedural pixel UI parts. Pure functions returning RGBA so the web editor, the CLI renders and the
 * Godot / Pixi exports share identical pixels. Palettes match Easy Dialogue's box styles.
 */

export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export type RGBA = [number, number, number, number];

export function hx(h: string, a = 255): RGBA {
  const s = h.replace("#", "");
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16), a];
}
const mix = (a: RGBA, b: RGBA, t: number): RGBA => [0, 1, 2, 3].map((i) => Math.round(a[i]! + (b[i]! - a[i]!) * t)) as RGBA;
const grey = (c: RGBA): RGBA => {
  const l = Math.round(c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11);
  return [l, l, l, c[3]];
};

export interface Palette {
  outline: RGBA;
  hi: RGBA;
  base: RGBA;
  base2: RGBA;
  shadow: RGBA;
  inner: RGBA;
  fill: RGBA;
  ornament: RGBA;
  ornamentHi: RGBA;
  plate: RGBA;
  plateHi: RGBA;
  plateLo: RGBA;
}

export const PALETTES: Record<UiStyle, Palette> = {
  teak: {
    outline: hx("#0d0906"), hi: hx("#c08a52"), base: hx("#7a5230"), base2: hx("#6a4528"), shadow: hx("#3a2819"), inner: hx("#140e0a"),
    fill: hx("#21160e", 238), ornament: hx("#f4ae3d"), ornamentHi: hx("#ffe2a0"),
    plate: hx("#f4ae3d"), plateHi: hx("#ffd27a"), plateLo: hx("#b9741f"),
  },
  lantern: {
    outline: hx("#1a0705"), hi: hx("#ff8a6a"), base: hx("#b8322a"), base2: hx("#9e2820"), shadow: hx("#5e1510"), inner: hx("#f4ae3d"),
    fill: hx("#2a100c", 236), ornament: hx("#ffd27a"), ornamentHi: hx("#fff3c4"),
    plate: hx("#ffd27a"), plateHi: hx("#fff3c4"), plateLo: hx("#c48a2a"),
  },
  paper: {
    outline: hx("#3a2819"), hi: hx("#fff6dc"), base: hx("#e8d2a6"), base2: hx("#dcc496"), shadow: hx("#b8976a"), inner: hx("#8a6a44"),
    fill: hx("#f7ebd3", 246), ornament: hx("#b9411f"), ornamentHi: hx("#e5806c"),
    plate: hx("#8a3a22"), plateHi: hx("#b9573a"), plateLo: hx("#5e2414"),
  },
  night: {
    outline: hx("#05070f"), hi: hx("#8fc7e8"), base: hx("#2e3f78"), base2: hx("#283869"), shadow: hx("#151d3d"), inner: hx("#0a0e1f"),
    fill: hx("#0e1426", 232), ornament: hx("#ffd27a"), ornamentHi: hx("#ffffff"),
    plate: hx("#8fc7e8"), plateHi: hx("#c8ecff"), plateLo: hx("#4f86b0"),
  },
  // Hari Raya: deep green with gold, 8-point star (girih) corners
  raya: {
    outline: hx("#06140d"), hi: hx("#5fbf8a"), base: hx("#1f6b48"), base2: hx("#1a5c3e"), shadow: hx("#0f3a27"), inner: hx("#d9a93d"),
    fill: hx("#0c2419", 236), ornament: hx("#f2c14e"), ornamentHi: hx("#fff1b8"),
    plate: hx("#f2c14e"), plateHi: hx("#fff1b8"), plateLo: hx("#b07f1f"),
  },
};

/** Text colours per style (CSS strings) — shared by the renderer, Godot theme and Pixi helper. */
export const STYLE_COLORS: Record<UiStyle, { text: string; muted: string; title: string; button: string; buttonHi: string; disabled: string; accent: string; shadow: string; slotCount: string }> = {
  teak: { text: "#f7ebd3", muted: "#cdb492", title: "#ffd27a", button: "#2a1606", buttonHi: "#1a0d03", disabled: "#6e5a44", accent: "#f4ae3d", shadow: "#0d0906", slotCount: "#ffffff" },
  lantern: { text: "#fff3e4", muted: "#f2b7a6", title: "#ffd27a", button: "#2a0d08", buttonHi: "#1a0503", disabled: "#7a4a40", accent: "#ffd27a", shadow: "#1a0705", slotCount: "#ffffff" },
  paper: { text: "#3a2819", muted: "#7a5a3a", title: "#8a3a22", button: "#fff6dc", buttonHi: "#ffffff", disabled: "#b8a283", accent: "#b9411f", shadow: "#fff6dc", slotCount: "#3a2819" },
  night: { text: "#e6efff", muted: "#9fb3d9", title: "#ffd27a", button: "#0a1630", buttonHi: "#050b1a", disabled: "#4a5677", accent: "#ffd27a", shadow: "#05070f", slotCount: "#ffffff" },
  raya: { text: "#f3f7ec", muted: "#a9cdb4", title: "#f2c14e", button: "#0c2419", buttonHi: "#06140d", disabled: "#4f6e5c", accent: "#f2c14e", shadow: "#06140d", slotCount: "#ffffff" },
};

export const STYLE_LABELS: Record<UiStyle, string> = {
  teak: "ไม้สัก · teak",
  lantern: "โคมแดง · red lantern",
  paper: "กระดาษสา · rice paper",
  night: "ตลาดกลางคืน · night market",
  raya: "รายอ · Hari Raya",
};

function make(w: number, h: number): Pixels {
  return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
}
function put(p: Pixels, x: number, y: number, c: RGBA) {
  if (x < 0 || y < 0 || x >= p.width || y >= p.height) return;
  p.data.set(c, (y * p.width + x) * 4);
}
function rows(p: Pixels, art: string[], map: Record<string, RGBA>) {
  art.forEach((r, y) => [...r].forEach((ch, x) => map[ch] && put(p, x, y, map[ch]!)));
}

/** Panel frame: 24×24, slice margin 8 (same as Easy Dialogue's box). */
export function panelFrame(style: UiStyle): Pixels {
  const P = PALETTES[style];
  const S = 24;
  const p = make(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = Math.min(x, S - 1 - x);
      const dy = Math.min(y, S - 1 - y);
      const d = Math.min(dx, dy);
      if (dx + dy < 2) continue;
      let c: RGBA;
      if (d === 0) c = P.outline;
      else if (d === 1) c = y < S / 2 && dy === 1 ? P.hi : x < S / 2 && dx === 1 ? P.hi : P.base;
      else if (d === 2) c = P.base;
      else if (d === 3) c = dy === 3 && y > S / 2 ? P.outline : dx === 3 && x > S / 2 ? P.outline : P.shadow;
      else if (d === 4) c = P.inner;
      else c = P.fill;
      if (dx + dy === 2) c = P.outline;
      put(p, x, y, c);
    }
  }
  if (style === "raya") {
    // 8-point star (khatim) in each corner, and a dotted gold girih band along the edges
    const star = [".o.o.", "ooooo", ".oho.", "ooooo", ".o.o."];
    const ink: Record<string, RGBA> = { o: P.ornament, h: P.ornamentHi };
    for (const [cx, cy] of [[1, 1], [S - 6, 1], [1, S - 6], [S - 6, S - 6]] as const)
      star.forEach((r, y) => [...r].forEach((ch, x) => ink[ch] && put(p, cx + x, cy + y, ink[ch]!)));
    for (let i = 8; i < S - 8; i += 2) {
      put(p, i, 2, P.ornament);
      put(p, i, S - 3, P.ornament);
      put(p, 2, i, P.ornament);
      put(p, S - 3, i, P.ornament);
    }
    return p;
  }
  for (const [cx, cy] of [[2, 2], [S - 4, 2], [2, S - 4], [S - 4, S - 4]] as const) {
    put(p, cx, cy, P.ornamentHi);
    put(p, cx + 1, cy, P.ornament);
    put(p, cx, cy + 1, P.ornament);
    put(p, cx + 1, cy + 1, P.outline);
  }
  return p;
}

/** Small panel / tooltip: 12×12, margin 4. */
export function panelSmall(style: UiStyle): Pixels {
  const P = PALETTES[style];
  const S = 12;
  const p = make(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = Math.min(x, S - 1 - x);
      const dy = Math.min(y, S - 1 - y);
      const d = Math.min(dx, dy);
      if (dx + dy < 1) continue;
      let c: RGBA;
      if (d === 0 || dx + dy === 1) c = P.outline;
      else if (d === 1) c = y < S / 2 && dy === 1 ? P.hi : x < S / 2 && dx === 1 ? P.hi : P.base;
      else if (d === 2) c = P.shadow;
      else c = P.fill;
      put(p, x, y, c);
    }
  }
  return p;
}

/** Title plate: 16×16, margin 5. */
export function plateFrame(style: UiStyle): Pixels {
  const P = PALETTES[style];
  const S = 16;
  const p = make(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = Math.min(x, S - 1 - x);
      const dy = Math.min(y, S - 1 - y);
      const d = Math.min(dx, dy);
      if (dx + dy < 1) continue;
      let c: RGBA;
      if (d === 0 || dx + dy === 1) c = P.outline;
      else if (d === 1) c = y < S / 2 && dy === 1 ? P.plateHi : x < S / 2 && dx === 1 ? P.plateHi : P.plateLo;
      else c = P.plate;
      put(p, x, y, c);
    }
  }
  return p;
}

/**
 * Buttons: 16×16, margin 5, bottom lip 2px (pressed drops 1px and loses the lip).
 * normal = plate colours, hover = lighter, pressed = darker, disabled = grey, focus = normal + ornament ring.
 */
export function buttonFrame(style: UiStyle, state: "normal" | "hover" | "pressed" | "disabled" | "focus"): Pixels {
  const P = PALETTES[style];
  const S = 16;
  const p = make(S, S);
  let face = P.plate;
  let hi = P.plateHi;
  let lo = P.plateLo;
  if (state === "hover") {
    face = mix(P.plate, P.plateHi, 0.45);
    hi = mix(P.plateHi, hx("#ffffff"), 0.5);
  } else if (state === "pressed") {
    face = mix(P.plate, P.plateLo, 0.45);
    hi = P.plate;
  } else if (state === "disabled") {
    face = grey(mix(P.plate, P.shadow, 0.5));
    hi = grey(P.plate);
    lo = grey(P.plateLo);
  }
  const ring = state === "focus" ? P.ornamentHi : P.outline;
  const top = state === "pressed" ? 1 : 0;
  const lip = state === "pressed" ? 0 : 2;
  for (let y = top; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const yy = y - top;
      const h = S - top;
      const dx = Math.min(x, S - 1 - x);
      const dyTop = yy;
      const dyBot = h - 1 - yy;
      const dy = Math.min(dyTop, dyBot);
      if (dx + dy < 1) continue;
      let c: RGBA;
      if (dx === 0 || dy === 0 || dx + dy === 1) c = ring;
      else if (dyBot <= lip) c = lo;
      else if (dyTop === 1 || dx === 1) c = dyTop === 1 ? hi : x < S / 2 ? hi : lo;
      else c = face;
      put(p, x, y, c);
    }
  }
  if (state === "focus") {
    // inner gold studs in the corners
    for (const [cx, cy] of [[2, 2], [S - 3, 2]] as const) put(p, cx, cy, P.ornamentHi);
  }
  return p;
}

/** Inventory slot: 20×20, margin 5 (dark well). Selected adds a 2px ornament glow ring. */
export function slotFrame(style: UiStyle, selected = false): Pixels {
  const P = PALETTES[style];
  const S = 20;
  const p = make(S, S);
  const well: RGBA = style === "paper" ? hx("#d8c49e") : mix(P.inner, hx("#000000"), 0.35);
  const deep: RGBA = style === "paper" ? hx("#c4ad84") : mix(P.inner, hx("#000000"), 0.6);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = Math.min(x, S - 1 - x);
      const dy = Math.min(y, S - 1 - y);
      const d = Math.min(dx, dy);
      if (dx + dy < 1) continue;
      let c: RGBA;
      if (selected && d <= 1) c = d === 0 ? P.outline : P.ornament;
      else if (d === 0 || dx + dy === 1) c = P.outline;
      else if (d === 1) c = y === S - 2 || x === S - 2 ? P.hi : P.shadow;
      else if (d === 2) c = y === 2 || x === 2 ? deep : well;
      else c = well;
      put(p, x, y, c);
    }
  }
  if (selected) for (const [cx, cy] of [[0, 0], [S - 1, 0], [0, S - 1], [S - 1, S - 1]] as const) put(p, cx, cy, P.ornamentHi);
  return p;
}

/** Bar background: 12×10, margin 3. */
export function barFrame(style: UiStyle): Pixels {
  const P = PALETTES[style];
  const p = make(12, 10);
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 12; x++) {
      const dx = Math.min(x, 11 - x);
      const dy = Math.min(y, 9 - y);
      const d = Math.min(dx, dy);
      if (dx + dy < 1) continue;
      put(p, x, y, d === 0 || dx + dy === 1 ? P.outline : d === 1 ? (y === 8 ? P.hi : P.shadow) : hx("#0a0705"));
    }
  }
  return p;
}

export const BAR_COLORS = {
  hp: { hi: "#ff9a8a", base: "#e0402e", lo: "#8e1c14" },
  mp: { hi: "#a8dcff", base: "#3d8fe0", lo: "#1d4a8a" },
  xp: { hi: "#c8f2a0", base: "#5fbf4a", lo: "#2c6e26" },
  stamina: { hi: "#ffe9a0", base: "#f4ae3d", lo: "#a8641a" },
} as const;

/** Bar fill: 4×6, margin 1 (stretch horizontally). */
export function barFill(kind: keyof typeof BAR_COLORS): Pixels {
  const c = BAR_COLORS[kind];
  const p = make(4, 6);
  const col = [hx(c.hi), hx(c.base), hx(c.base), hx(c.base), hx(c.lo), hx(c.lo)];
  for (let y = 0; y < 6; y++) for (let x = 0; x < 4; x++) put(p, x, y, col[y]!);
  return p;
}

/** Checkbox 10×10 (off / on). */
export function checkbox(style: UiStyle, on: boolean): Pixels {
  const P = PALETTES[style];
  const p = make(10, 10);
  const well: RGBA = style === "paper" ? hx("#fff6dc") : hx("#0a0705");
  for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) put(p, x, y, x === 0 || y === 0 || x === 9 || y === 9 ? P.outline : x === 1 || y === 1 ? P.shadow : well);
  if (on) rows(p, ["", "", "        o", "       oo", " o    oo", " oo  oo", "  oooo", "   oo"], { o: P.ornament });
  return p;
}

/** Slider track 12×6 (margin 3) and knob 7×10. */
export function sliderTrack(style: UiStyle): Pixels {
  const P = PALETTES[style];
  const p = make(12, 6);
  for (let y = 0; y < 6; y++) for (let x = 0; x < 12; x++) {
    const edge = y === 0 || y === 5 || x === 0 || x === 11;
    if ((x === 0 || x === 11) && (y === 0 || y === 5)) continue;
    put(p, x, y, edge ? P.outline : y === 1 ? P.shadow : hx("#0a0705"));
  }
  return p;
}
export function sliderFill(style: UiStyle): Pixels {
  const P = PALETTES[style];
  const p = make(4, 4);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) put(p, x, y, y === 0 ? P.ornamentHi : y === 3 ? P.plateLo : P.ornament);
  return p;
}
export function sliderKnob(style: UiStyle): Pixels {
  const P = PALETTES[style];
  const p = make(7, 10);
  rows(p, [" kkkkk ", "khhhhhk", "khpppok", "khpppok", "khpppok", "khpppok", "khpppok", "kpooook", " kkkkk ", "       "], { k: P.outline, h: P.plateHi, p: P.plate, o: P.plateLo });
  return p;
}

/** Tabs: 16×14, margin 5 (selected is taller visually by colour). */
export function tabFrame(style: UiStyle, on: boolean): Pixels {
  const P = PALETTES[style];
  const p = make(16, 14);
  const face = on ? P.base : P.shadow;
  for (let y = 0; y < 14; y++) for (let x = 0; x < 16; x++) {
    const dx = Math.min(x, 15 - x);
    if (y === 0 && dx < 2) continue;
    if (y === 1 && dx < 1) continue;
    let c: RGBA;
    if (dx === 0 || y === 0 || (y === 1 && dx === 1)) c = P.outline;
    else if (y === 13) c = on ? face : P.outline;
    else if (y === 1 || dx === 1) c = on ? P.hi : P.base2;
    else c = face;
    put(p, x, y, c);
  }
  return p;
}

/** Pointing-hand cursor 10×11 and arrow cursor 6×7. */
export function cursorHand(style: UiStyle): Pixels {
  const P = PALETTES[style];
  const p = make(10, 11);
  rows(p, ["  kk", " kwwk", " kwwk", " kwwkkk", " kwwwwwkk", "kkwwwwwwk", "kwwwwwwwk", "kwwwwwwwk", " kwwwwwk", "  kwwwwk", "  kkkkkk"], { k: P.outline, w: hx("#fff6dc") });
  return p;
}
export function cursorArrow(style: UiStyle): Pixels {
  const P = PALETTES[style];
  const p = make(6, 7);
  rows(p, ["kk....", "kak...", "kaak..", "kaaak.", "kaak..", "kak...", "kk...."], { k: P.outline, a: P.ornament });
  return p;
}

/** Hotbar key badge 7×7. */
export function keyBadge(style: UiStyle): Pixels {
  const P = PALETTES[style];
  const p = make(7, 7);
  for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
    if ((x === 0 || x === 6) && (y === 0 || y === 6)) continue;
    put(p, x, y, x === 0 || y === 0 || x === 6 || y === 6 ? P.outline : P.plate);
  }
  return p;
}

/** Every UI part with its nine-slice margin (0 = plain sprite). Keys are file names in exports. */
export const PARTS: Record<string, { make: (s: UiStyle) => Pixels; margin: number }> = {
  panel: { make: panelFrame, margin: 8 },
  panel_small: { make: panelSmall, margin: 4 },
  plate: { make: plateFrame, margin: 5 },
  button_normal: { make: (s) => buttonFrame(s, "normal"), margin: 5 },
  button_hover: { make: (s) => buttonFrame(s, "hover"), margin: 5 },
  button_pressed: { make: (s) => buttonFrame(s, "pressed"), margin: 5 },
  button_disabled: { make: (s) => buttonFrame(s, "disabled"), margin: 5 },
  button_focus: { make: (s) => buttonFrame(s, "focus"), margin: 5 },
  slot: { make: (s) => slotFrame(s, false), margin: 5 },
  slot_selected: { make: (s) => slotFrame(s, true), margin: 5 },
  bar_bg: { make: barFrame, margin: 3 },
  bar_hp: { make: () => barFill("hp"), margin: 1 },
  bar_mp: { make: () => barFill("mp"), margin: 1 },
  bar_xp: { make: () => barFill("xp"), margin: 1 },
  bar_stamina: { make: () => barFill("stamina"), margin: 1 },
  check_off: { make: (s) => checkbox(s, false), margin: 0 },
  check_on: { make: (s) => checkbox(s, true), margin: 0 },
  slider_track: { make: sliderTrack, margin: 3 },
  slider_fill: { make: sliderFill, margin: 1 },
  slider_knob: { make: sliderKnob, margin: 0 },
  tab_on: { make: (s) => tabFrame(s, true), margin: 5 },
  tab_off: { make: (s) => tabFrame(s, false), margin: 5 },
  cursor_hand: { make: cursorHand, margin: 0 },
  cursor_arrow: { make: cursorArrow, margin: 0 },
  key_badge: { make: keyBadge, margin: 0 },
};
export type PartName = keyof typeof PARTS;
