// Easy UI — on-screen touch controls logic (virtual stick / D-pad + action buttons), engine-free.
// easyui-touch.js draws it as a DOM overlay over any canvas; the Godot export has easyui_touch.gd.
//
//   const pad = new TouchPad({
//     profiles: {
//       map:  { stick: "8way", buttons: [{ id: "ok", label: "A", key: "Enter" }, { id: "back", label: "B", key: "Escape" }] },
//       side: { stick: "horizontal", buttons: [{ id: "jump", label: "⤒", key: " " }, { id: "hit", label: "J", key: "j" }] },
//     },
//     profile: "map",
//     sink: (key, down) => {},                // e.g. keyboardSink(window): synthetic keydown / keyup for the game's own keys
//   });
//   pad.stick(0.9, -0.1); pad.press("ok"); pad.release("ok"); pad.stickEnd(); pad.setProfile("side");
// Stick modes: "8way" (diagonals = two arrows), "4way", "horizontal" (← → only), "vertical", "none".
// Keys are KeyboardEvent.key values; `sink` only sees transitions (a key is never sent down twice). MIT License.

export const STICK_KEYS = { left: "ArrowLeft", right: "ArrowRight", up: "ArrowUp", down: "ArrowDown" };
export const STICK_MODES = ["8way", "4way", "horizontal", "vertical", "none"];
const CODES = { ArrowLeft: "ArrowLeft", ArrowRight: "ArrowRight", ArrowUp: "ArrowUp", ArrowDown: "ArrowDown", Enter: "Enter", Escape: "Escape", " ": "Space", Backspace: "Backspace", Tab: "Tab" };
/** KeyboardEvent.code for a key value ("e" → "KeyE", "1" → "Digit1"). */
export function keyCode(key) {
  if (CODES[key]) return CODES[key];
  if (/^[a-z]$/i.test(key)) return `Key${key.toUpperCase()}`;
  if (/^[0-9]$/.test(key)) return `Digit${key}`;
  return key;
}

/** Stick deflection (dx, dy in -1..1, y down) → which arrow directions are held. */
export function stickToDirs(dx, dy, mode = "8way", deadzone = 0.3) {
  const out = { left: false, right: false, up: false, down: false };
  const m = Math.hypot(dx, dy);
  if (mode === "none" || m < deadzone) return out;
  if (mode === "horizontal") {
    if (Math.abs(dx) >= deadzone) out[dx < 0 ? "left" : "right"] = true;
    return out;
  }
  if (mode === "vertical") {
    if (Math.abs(dy) >= deadzone) out[dy < 0 ? "up" : "down"] = true;
    return out;
  }
  const a = Math.atan2(dy, dx); // 0 = right, +π/2 = down
  const sectors = mode === "4way" ? 4 : 8;
  const s = ((Math.round(a / ((2 * Math.PI) / sectors)) % sectors) + sectors) % sectors;
  const dirs8 = [["right"], ["right", "down"], ["down"], ["left", "down"], ["left"], ["left", "up"], ["up"], ["right", "up"]];
  for (const d of sectors === 4 ? dirs8[s * 2] : dirs8[s]) out[d] = true;
  return out;
}

export class TouchPad {
  constructor({ profiles = {}, profile, sink = () => {}, deadzone = 0.3 } = {}) {
    this.profiles = profiles;
    this.sink = sink;
    this.deadzone = deadzone;
    this.down = new Set(); // keys currently held (as sent to the sink)
    this.stickKeys = new Set();
    this.buttonKeys = new Map(); // button id → key
    this.vector = { x: 0, y: 0 };
    this.setProfile(profile ?? Object.keys(profiles)[0] ?? null);
  }
  get current() { return this.profiles[this.profile] ?? { stick: "none", buttons: [] }; }
  get buttons() { return this.current.buttons ?? []; }
  get stickMode() { return this.current.stick ?? "none"; }
  /** Switch the control set (releases everything held so no key gets stuck). */
  setProfile(name) {
    if (name === this.profile) return false;
    this.releaseAll();
    this.profile = name;
    return true;
  }
  _send(key, down) {
    if (down === this.down.has(key)) return;
    if (down) this.down.add(key);
    else this.down.delete(key);
    this.sink(key, down);
  }
  _sync() {
    const want = new Set([...this.stickKeys, ...this.buttonKeys.values()]);
    for (const k of [...this.down]) if (!want.has(k)) this._send(k, false);
    for (const k of want) this._send(k, true);
  }
  /** Stick deflection, -1..1 each axis (y down). */
  stick(dx, dy) {
    this.vector = { x: dx, y: dy };
    const d = stickToDirs(dx, dy, this.stickMode, this.deadzone);
    this.stickKeys = new Set(Object.keys(d).filter((k) => d[k]).map((k) => STICK_KEYS[k]));
    this._sync();
    return d;
  }
  stickEnd() { return this.stick(0, 0); }
  /** D-pad style press of one direction ("left" | "right" | "up" | "down"). */
  dpad(dir, down) {
    const k = STICK_KEYS[dir];
    if (!k) return;
    if (down) this.stickKeys.add(k);
    else this.stickKeys.delete(k);
    this._sync();
  }
  press(id) {
    const b = this.buttons.find((x) => x.id === id);
    if (!b) return false;
    this.buttonKeys.set(id, b.key);
    this._sync();
    return true;
  }
  release(id) {
    if (!this.buttonKeys.delete(id)) return false;
    this._sync();
    return true;
  }
  /** Tap = press + release (menus, dialogue). */
  tap(id) { return this.press(id) && this.release(id); }
  releaseAll() {
    this.stickKeys = new Set();
    this.buttonKeys = new Map();
    this.vector = { x: 0, y: 0 };
    for (const k of [...this.down]) this._send(k, false);
  }
  held() { return [...this.down]; }
}

/** Show the controls? mode "on" | "off" | "auto" (auto: touch screens / coarse pointers only). */
export function shouldShow(mode = "auto", env = {}) {
  if (mode === "on") return true;
  if (mode === "off") return false;
  return Boolean((env.maxTouchPoints ?? 0) > 0 || env.coarse);
}

/**
 * Where everything goes on a w×h screen (CSS px) with safe-area insets.
 * Landscape: the game is fitted and centred, stick bottom-left, buttons bottom-right; with fit "auto" (default) the game
 * shrinks to leave side gutters for them when it stays ≥ 65% of full size ("gutters" always, "overlay" never).
 * Portrait: the game sits at the top at full width; the controls fill the band below it (overlaid when the band is short).
 */
export function touchLayout({ w, h, safe = {}, game = { w: 480, h: 270 }, buttons = 2, size = 1, integer = false, fit = "auto" }) {
  const S = { top: safe.top ?? 0, right: safe.right ?? 0, bottom: safe.bottom ?? 0, left: safe.left ?? 0 };
  const aw = Math.max(1, w - S.left - S.right), ah = Math.max(1, h - S.top - S.bottom);
  const orientation = w >= h ? "landscape" : "portrait";
  const unit = Math.max(36, Math.min(72, Math.min(w, h) * 0.12)) * size; // one button's diameter
  const r = Math.round(unit * 1.15); // stick radius
  const pad = Math.round(unit * 0.35);
  const fitScale = (fw, fh) => {
    let k = Math.min(fw / game.w, fh / game.h);
    if (integer && k >= 1) k = Math.floor(k);
    return k;
  };
  let scale = fitScale(aw, ah);
  // landscape: keep the stick and buttons in side gutters when that costs at most 35% of the game's size
  let gutter = 0;
  if (orientation === "landscape" && fit !== "overlay") {
    const gw = 2 * r + 2 * pad;
    const k = fitScale(aw - 2 * gw, ah);
    if (fit === "gutters" || k >= scale * 0.65) (gutter = gw), (scale = k);
  }
  const gw = Math.round(game.w * scale), gh = Math.round(game.h * scale);
  const g = { w: gw, h: gh, scale, x: 0, y: 0 };
  let band; // the rect the controls live in
  if (orientation === "portrait") {
    g.x = S.left + Math.round((aw - gw) / 2);
    g.y = S.top;
    const below = h - S.bottom - (g.y + gh);
    band = below >= r * 2 + pad * 2 ? { x: S.left, y: g.y + gh, w: aw, h: below } : { x: S.left, y: h - S.bottom - (r * 2 + pad * 2), w: aw, h: r * 2 + pad * 2 };
  } else {
    g.x = S.left + Math.round((aw - gw) / 2);
    g.y = S.top + Math.round((ah - gh) / 2);
    band = { x: S.left, y: h - S.bottom - (r * 2 + pad * 2), w: aw, h: r * 2 + pad * 2 };
  }
  // a tall portrait band keeps the controls in the lower part, where thumbs rest
  const mid = band.y + band.h / 2;
  const cy = Math.round(orientation === "portrait" ? Math.max(mid, band.y + band.h - pad - r - unit * 0.6) : mid);
  const stick = { x: band.x + pad + r, y: cy, r };
  // buttons: a 2-row diamond-ish cluster anchored bottom-right
  const out = [];
  const br = Math.round(unit / 2);
  const cx = band.x + band.w - pad - br;
  const slots = [[0, 0], [-1.25, 0.55], [-0.35, -1.2], [-1.6, -0.75], [-2.5, 0.2], [-0.9, -2.3]];
  for (let i = 0; i < buttons; i++) {
    const [sx, sy] = slots[i] ?? [-(i - 3) * 1.25 - 2.5, 0.2];
    out.push({ x: Math.round(cx + sx * unit), y: Math.round(cy + br * 0.6 + sy * unit), r: br });
  }
  // menu button top-right: in the band below the game (portrait), else in the screen's top-right corner
  const mh = Math.round(unit * 0.6);
  const roomy = orientation === "portrait" && band.y >= g.y + gh;
  const menu = { x: w - S.right - pad - unit, y: roomy ? band.y + Math.round(pad / 2) : S.top + pad, w: unit, h: mh };
  // one spare slot left of the menu button (e.g. a fullscreen toggle)
  const aux = { x: menu.x - pad - mh, y: menu.y, w: mh, h: mh };
  return { orientation, game: g, band, stick, buttons: out, menu, aux, unit, gutter, safe: S };
}
