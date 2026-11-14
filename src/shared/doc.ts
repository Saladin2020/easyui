import { isIcon } from "./icons.js";
import { widgetBox } from "./draw.js";
import { BAR_KINDS, BUTTON_STATES, FORMAT, STYLES, WIDGET_TYPES, type Diagnostic, type ItemRef, type UiDoc, type Widget } from "./types.js";

export const SAFE_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export interface Validation {
  doc: UiDoc | null;
  errors: Diagnostic[];
  warnings: Diagnostic[];
}

/** Validate an `easyui/1` document. Errors make it unusable; warnings are layout hints (off-screen, unknown icon…). */
export function validateDoc(raw: unknown): Validation {
  const errors: Diagnostic[] = [];
  const warnings: Diagnostic[] = [];
  const err = (path: string, message: string) => errors.push({ path, message, severity: "error" });
  const warn = (path: string, message: string) => warnings.push({ path, message, severity: "warning" });
  if (!isObj(raw)) return { doc: null, errors: [{ path: "", message: "document must be an object", severity: "error" }], warnings };
  if (raw.format !== FORMAT) err("format", `must be "${FORMAT}"`);
  if (typeof raw.name !== "string" || !raw.name) err("name", "required string");
  if (!STYLES.includes(raw.style as never)) err("style", `one of ${STYLES.join(", ")}`);
  const vp = raw.viewport;
  let VW = 480;
  let VH = 270;
  if (!isObj(vp) || !isNum(vp.width) || !isNum(vp.height) || vp.width < 64 || vp.height < 64 || vp.width > 1920 || vp.height > 1080) err("viewport", "{width, height} between 64 and 1920×1080");
  else {
    VW = vp.width;
    VH = vp.height;
  }
  if (raw.background !== undefined && typeof raw.background !== "string") err("background", "string (png path, #hex or none)");
  if (!isObj(raw.screens) || !Object.keys(raw.screens).length) err("screens", "object with at least one screen");
  else {
    for (const [sid, s] of Object.entries(raw.screens)) {
      const sp = `screens.${sid}`;
      if (!SAFE_ID.test(sid)) err(sp, "screen id must be a-z, 0-9, _ or -");
      if (!isObj(s)) {
        err(sp, "must be an object");
        continue;
      }
      if (s.style !== undefined && !STYLES.includes(s.style as never)) err(`${sp}.style`, `one of ${STYLES.join(", ")}`);
      if (s.dim !== undefined && (!isNum(s.dim) || s.dim < 0 || s.dim > 1)) err(`${sp}.dim`, "number 0..1");
      if (s.background !== undefined && typeof s.background !== "string") err(`${sp}.background`, "string");
      if (!Array.isArray(s.widgets)) {
        err(`${sp}.widgets`, "array");
        continue;
      }
      s.widgets.forEach((w, i) => checkWidget(w, `${sp}.widgets[${i}]`, err, warn, VW, VH));
    }
  }
  return { doc: errors.length ? null : (raw as unknown as UiDoc), errors, warnings };
}

function checkWidget(w: unknown, p: string, err: (p: string, m: string) => void, warn: (p: string, m: string) => void, VW: number, VH: number) {
  if (!isObj(w)) return err(p, "widget must be an object");
  if (!WIDGET_TYPES.includes(w.type as never)) return err(`${p}.type`, `one of ${WIDGET_TYPES.join(", ")}`);
  if (!isNum(w.x) || !isNum(w.y)) err(p, "x and y are required numbers");
  const need = (k: string, kind: "num" | "str" | "arr", min?: number) => {
    const v = w[k];
    if (kind === "num" && (!isNum(v) || (min !== undefined && v < min))) err(`${p}.${k}`, `number${min !== undefined ? ` ≥ ${min}` : ""}`);
    if (kind === "str" && typeof v !== "string") err(`${p}.${k}`, "string");
    if (kind === "arr" && !Array.isArray(v)) err(`${p}.${k}`, "array");
  };
  const opt = (k: string, kind: "num" | "str" | "bool", min?: number) => {
    if (w[k] === undefined) return;
    if (kind === "bool" && typeof w[k] !== "boolean") err(`${p}.${k}`, "boolean");
    else if (kind !== "bool") need(k, kind, min);
  };
  const icon = (k: string, v: unknown) => {
    if (typeof v !== "string") return err(k, "icon name string");
    if (!isIcon(v)) warn(k, `unknown icon "${v}" (see: easyui icons)`);
  };
  const items = (k: string, arr: unknown, max: number) => {
    if (!Array.isArray(arr)) return err(k, "array of {icon, count?} or null");
    if (arr.length > max) warn(k, `${arr.length} items but only ${max} slots`);
    arr.forEach((it, i) => {
      if (it === null) return;
      if (!isObj(it)) return err(`${k}[${i}]`, "{icon, count?} or null");
      icon(`${k}[${i}].icon`, (it as unknown as ItemRef).icon);
      if (it.count !== undefined && (!isNum(it.count) || it.count < 0)) err(`${k}[${i}].count`, "number ≥ 0");
    });
  };
  switch (w.type) {
    case "panel":
      need("w", "num", 8);
      need("h", "num", 8);
      opt("title", "str");
      opt("small", "bool");
      break;
    case "label":
      need("text", "str");
      opt("size", "num", 5);
      opt("w", "num", 8);
      opt("color", "str");
      break;
    case "button":
      need("w", "num", 10);
      need("text", "str");
      opt("h", "num", 10);
      if (w.state !== undefined && !BUTTON_STATES.includes(w.state as never)) err(`${p}.state`, `one of ${BUTTON_STATES.join(", ")}`);
      if (w.icon !== undefined) icon(`${p}.icon`, w.icon);
      break;
    case "menu":
      need("w", "num", 10);
      need("items", "arr");
      if (Array.isArray(w.items) && !w.items.length) err(`${p}.items`, "at least one item");
      opt("selected", "num", 0);
      opt("itemH", "num", 10);
      break;
    case "bar":
      need("w", "num", 8);
      need("value", "num");
      need("max", "num", 0);
      if (!BAR_KINDS.includes(w.kind as never)) err(`${p}.kind`, `one of ${BAR_KINDS.join(", ")}`);
      opt("h", "num", 6);
      break;
    case "inventory":
      need("cols", "num", 1);
      need("rows", "num", 1);
      opt("slot", "num", 12);
      if (isNum(w.cols) && isNum(w.rows)) items(`${p}.items`, w.items, w.cols * w.rows);
      break;
    case "hotbar":
      need("slots", "num", 1);
      opt("slot", "num", 12);
      if (isNum(w.slots)) items(`${p}.items`, w.items, w.slots);
      break;
    case "icon":
      icon(`${p}.icon`, w.icon);
      opt("scale", "num", 1);
      break;
    case "toggle":
      need("text", "str");
      if (typeof w.on !== "boolean") err(`${p}.on`, "boolean");
      break;
    case "slider":
      need("w", "num", 20);
      need("text", "str");
      if (!isNum(w.value) || w.value < 0 || w.value > 1) err(`${p}.value`, "number 0..1");
      break;
    case "tabs":
      need("w", "num", 20);
      need("tabs", "arr");
      break;
    case "tooltip":
      need("w", "num", 40);
      need("title", "str");
      need("text", "str");
      if (w.icon !== undefined) icon(`${p}.icon`, w.icon);
      break;
    case "image":
      need("src", "str");
      break;
  }
  if (isNum(w.x) && isNum(w.y)) {
    try {
      const b = widgetBox(w as unknown as Widget);
      if (b.x + b.w < 0 || b.y + b.h < 0 || b.x > VW || b.y > VH) warn(p, "widget is entirely off-screen");
      else if (b.x < 0 || b.y < 0 || b.x + b.w > VW || b.y + b.h > VH) warn(p, `widget sticks out of the ${VW}×${VH} viewport`);
    } catch {
      /* malformed widget already reported */
    }
  }
}

export function docSummary(doc: UiDoc) {
  return {
    name: doc.name,
    style: doc.style,
    viewport: doc.viewport,
    screens: Object.entries(doc.screens).map(([id, s]) => ({ id, title: s.title ?? id, style: s.style ?? doc.style, widgets: s.widgets.length, types: [...new Set(s.widgets.map((w) => w.type))] })),
  };
}

/** Icons referenced by a doc (for exports / atlases). */
export function usedIcons(doc: UiDoc): string[] {
  const out = new Set<string>();
  for (const s of Object.values(doc.screens)) {
    for (const w of s.widgets) {
      if ((w.type === "icon" || w.type === "button" || w.type === "tooltip") && w.icon) out.add(w.icon);
      if (w.type === "inventory" || w.type === "hotbar") for (const it of w.items) if (it) out.add(it.icon);
    }
  }
  return [...out].sort();
}
