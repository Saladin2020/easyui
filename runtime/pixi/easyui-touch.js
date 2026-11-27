// Easy UI — on-screen touch controls for phones: a DOM overlay (virtual stick or D-pad + action buttons + menu
// button) that turns touches into the game's own keyboard keys, so every scene that reads keys works unchanged.
//
//   import { mountTouchControls, keyboardSink } from "./easyui-touch.js";
//   const touch = mountTouchControls({
//     profiles: { map: { stick: "8way", buttons: [{ id: "ok", label: "A", key: "Enter" }] } },
//     profile: "map", mode: "auto",            // "auto" (touch devices only) | "on" | "off"
//     menu: { label: "≡", key: "p" },           // optional top-right menu button
//     fullscreen: true,                         // optional ⛶ button next to it (toggleFullscreen())
//     game: { w: 480, h: 270 },                 // the canvas size, for touchLayout()
//     onLayout: (L) => {},                      // place the canvas: L.game = { x, y, w, h, scale } (CSS px)
//   });
//   touch.setProfile("side"); touch.setMode("on");
// Multitouch (one pointer per control), safe-area aware (env(safe-area-inset-*)), landscape + portrait layouts.
// Art is drawn here as original pixel art (CC0). MIT License.
import { TouchPad, touchLayout, shouldShow, keyCode } from "./easyui-touch-core.js";

export { TouchPad, touchLayout, shouldShow, stickToDirs, keyCode } from "./easyui-touch-core.js";

/** A sink that dispatches synthetic keydown / keyup events (the game's normal key handlers receive them). */
export function keyboardSink(target = globalThis.window) {
  return (key, down) => target.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { key, code: keyCode(key), bubbles: true, cancelable: true }));
}

const INK = "#1a1420";
/** Pixel-art disc on a small canvas: rim, face, top-left highlight, bottom-right shade, optional dither ring. */
function disc(px, face, rim, { ring = false, hole = 0 } = {}) {
  const c = document.createElement("canvas");
  c.width = c.height = px;
  const g = c.getContext("2d");
  const R = px / 2, r2 = (R - 0.5) ** 2;
  for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) {
    const dx = x + 0.5 - R, dy = y + 0.5 - R, d2 = dx * dx + dy * dy;
    if (d2 > r2) continue;
    const d = Math.sqrt(d2);
    if (hole && d < hole) continue;
    let col = face;
    if (d > R - 1.6) col = INK;
    else if (d > R - 2.8) col = rim;
    else if (ring && (x + y) % 2 === 0 && d > R * 0.55) col = rim;
    else if (dx + dy < -R * 0.55) col = "#ffffff";
    else if (dx + dy > R * 0.75) col = rim;
    g.fillStyle = col;
    g.fillRect(x, y, 1, 1);
  }
  return c;
}
/** D-pad cross (pixel art). */
function cross(px, face, rim) {
  const c = document.createElement("canvas");
  c.width = c.height = px;
  const g = c.getContext("2d");
  const t = Math.round(px / 3);
  g.fillStyle = INK;
  g.fillRect(t - 1, 0, t + 2, px);
  g.fillRect(0, t - 1, px, t + 2);
  g.fillStyle = face;
  g.fillRect(t, 1, t, px - 2);
  g.fillRect(1, t, px - 2, t);
  g.fillStyle = rim;
  g.fillRect(t + 1, t + 1, t - 2, t - 2);
  return c;
}
const css = (el, s) => Object.assign(el.style, s);
function pixelImg(canvas) {
  const im = document.createElement("img");
  im.src = canvas.toDataURL();
  im.draggable = false;
  css(im, { position: "absolute", inset: "0", width: "100%", height: "100%", imageRendering: "pixelated", pointerEvents: "none" });
  return im;
}
function safeInsets() {
  const p = document.createElement("div");
  css(p, { position: "fixed", visibility: "hidden", paddingTop: "env(safe-area-inset-top)", paddingRight: "env(safe-area-inset-right)", paddingBottom: "env(safe-area-inset-bottom)", paddingLeft: "env(safe-area-inset-left)" });
  document.body.appendChild(p);
  const s = getComputedStyle(p);
  const v = { top: parseFloat(s.paddingTop) || 0, right: parseFloat(s.paddingRight) || 0, bottom: parseFloat(s.paddingBottom) || 0, left: parseFloat(s.paddingLeft) || 0 };
  p.remove();
  return v;
}

/** Enter / leave fullscreen (and try to lock landscape on phones); safe to call anywhere. */
export async function toggleFullscreen(target = document.documentElement) {
  const d = document;
  try {
    if (d.fullscreenElement || d.webkitFullscreenElement) return void (await (d.exitFullscreen ?? d.webkitExitFullscreen)?.call(d));
    await (target.requestFullscreen ?? target.webkitRequestFullscreen)?.call(target, { navigationUI: "hide" });
    await globalThis.screen?.orientation?.lock?.("landscape").catch(() => {});
  } catch {
    /* not allowed here (iOS Safari on iPhone has no element fullscreen) */
  }
}

export function mountTouchControls(opts = {}) {
  const root = opts.root ?? document.body;
  const game = opts.game ?? { w: 480, h: 270 };
  const opacity = opts.opacity ?? 0.6;
  let mode = opts.mode ?? "auto";
  const sink = opts.sink ?? keyboardSink();
  const pad = new TouchPad({ profiles: opts.profiles ?? {}, profile: opts.profile, sink, deadzone: opts.deadzone ?? 0.3 });
  const style = opts.style ?? "stick";
  const el = document.createElement("div");
  el.className = "easyui-touch";
  el.dataset.easyuiTouch = "";
  css(el, { position: "fixed", inset: "0", pointerEvents: "none", zIndex: String(opts.zIndex ?? 20), userSelect: "none", webkitUserSelect: "none", touchAction: "none", fontFamily: opts.font ?? "inherit" });
  root.appendChild(el);
  const art = { face: opts.face ?? "#f2e6c8", rim: opts.rim ?? "#b48a52", accent: opts.accent ?? "#e8a33a" };

  // stick
  const stickBox = document.createElement("div");
  stickBox.dataset.touch = "stick";
  css(stickBox, { position: "absolute", pointerEvents: "auto", touchAction: "none", opacity: String(opacity) });
  const base = pixelImg(style === "dpad" ? cross(27, art.face, art.rim) : disc(32, "#2a2230", art.rim, { ring: true }));
  stickBox.appendChild(base);
  const knob = document.createElement("div");
  css(knob, { position: "absolute", pointerEvents: "none" });
  knob.appendChild(pixelImg(disc(16, art.face, art.rim)));
  if (style !== "dpad") stickBox.appendChild(knob);
  el.appendChild(stickBox);

  // buttons (rebuilt per profile)
  let btnEls = [];
  const menuEl = opts.menu ? document.createElement("div") : null;
  if (menuEl) {
    menuEl.dataset.touch = "menu";
    css(menuEl, { position: "absolute", pointerEvents: "auto", touchAction: "none", opacity: String(opacity), display: "flex", alignItems: "center", justifyContent: "center", color: INK, fontWeight: "700" });
    const c = document.createElement("canvas");
    c.width = 20; c.height = 12;
    const g = c.getContext("2d");
    g.fillStyle = INK; g.fillRect(0, 0, 20, 12);
    g.fillStyle = art.accent; g.fillRect(1, 1, 18, 10);
    g.fillStyle = "#ffffff"; g.fillRect(1, 1, 18, 1);
    menuEl.appendChild(pixelImg(c));
    const t = document.createElement("span");
    t.textContent = opts.menu.label ?? "≡";
    css(t, { position: "relative", fontSize: "min(4.5vmin, 22px)" });
    menuEl.appendChild(t);
    el.appendChild(menuEl);
  }

  // optional fullscreen toggle (left of the menu button)
  const fsEl = opts.fullscreen ? document.createElement("div") : null;
  if (fsEl) {
    fsEl.dataset.touch = "fullscreen";
    fsEl.title = "Fullscreen";
    css(fsEl, { position: "absolute", pointerEvents: "auto", touchAction: "none", opacity: String(opacity), display: "flex", alignItems: "center", justifyContent: "center", color: INK, fontWeight: "700" });
    fsEl.appendChild(pixelImg(disc(12, art.face, art.rim)));
    const t = document.createElement("span");
    t.textContent = "⛶";
    css(t, { position: "relative", fontSize: "min(3.6vmin, 18px)", pointerEvents: "none" });
    fsEl.appendChild(t);
    fsEl.addEventListener("pointerup", (e) => { e.preventDefault(); toggleFullscreen(opts.fullscreenTarget); });
    el.appendChild(fsEl);
  }

  let L = null;
  let shown = false;
  function buildButtons() {
    for (const b of btnEls) b.remove();
    btnEls = pad.buttons.map((b, i) => {
      const d = document.createElement("div");
      d.dataset.touch = b.id;
      css(d, { position: "absolute", pointerEvents: "auto", touchAction: "none", opacity: String(opacity), display: "flex", alignItems: "center", justifyContent: "center", color: INK, fontWeight: "700" });
      d.appendChild(pixelImg(disc(20, i === 0 ? art.accent : art.face, art.rim)));
      const t = document.createElement("span");
      t.textContent = b.label ?? b.id;
      css(t, { position: "relative", fontSize: "min(4.2vmin, 20px)", lineHeight: "1", textAlign: "center", pointerEvents: "none" });
      d.appendChild(t);
      bindHold(d, () => pad.press(b.id), () => pad.release(b.id));
      el.appendChild(d);
      return d;
    });
    stickBox.style.display = pad.stickMode === "none" ? "none" : "";
    place();
  }
  function bindHold(d, on, off) {
    let id = null;
    d.addEventListener("pointerdown", (e) => { e.preventDefault(); id = e.pointerId; d.setPointerCapture?.(id); d.style.filter = "brightness(0.8)"; on(); });
    const end = (e) => { if (e.pointerId !== id) return; id = null; d.style.filter = ""; off(); };
    d.addEventListener("pointerup", end);
    d.addEventListener("pointercancel", end);
    d.addEventListener("lostpointercapture", end);
  }
  if (menuEl) bindHold(menuEl, () => sink(opts.menu.key ?? "Escape", true), () => sink(opts.menu.key ?? "Escape", false));

  // stick input: one pointer drives it
  let sp = null;
  const moveStick = (e) => {
    if (!L) return;
    const r = stickBox.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2, R = r.width / 2;
    let dx = (e.clientX - cx) / R, dy = (e.clientY - cy) / R;
    const m = Math.hypot(dx, dy);
    if (m > 1) (dx /= m), (dy /= m);
    pad.stick(dx, dy);
    css(knob, { transform: `translate(${Math.round(dx * R * 0.55)}px, ${Math.round(dy * R * 0.55)}px)` });
  };
  stickBox.addEventListener("pointerdown", (e) => { e.preventDefault(); sp = e.pointerId; stickBox.setPointerCapture?.(sp); moveStick(e); });
  stickBox.addEventListener("pointermove", (e) => e.pointerId === sp && moveStick(e));
  const stickEnd = (e) => { if (e.pointerId !== sp) return; sp = null; pad.stickEnd(); css(knob, { transform: "" }); };
  stickBox.addEventListener("pointerup", stickEnd);
  stickBox.addEventListener("pointercancel", stickEnd);
  stickBox.addEventListener("lostpointercapture", stickEnd);

  function place() {
    const w = globalThis.innerWidth, h = globalThis.innerHeight;
    L = touchLayout({ w, h, safe: safeInsets(), game, buttons: pad.buttons.length, size: opts.size ?? 1 });
    const s = L.stick;
    css(stickBox, { left: `${s.x - s.r}px`, top: `${s.y - s.r}px`, width: `${s.r * 2}px`, height: `${s.r * 2}px` });
    css(knob, { left: `${s.r * 0.55}px`, top: `${s.r * 0.55}px`, width: `${s.r * 0.9}px`, height: `${s.r * 0.9}px` });
    btnEls.forEach((d, i) => { const b = L.buttons[i]; css(d, { left: `${b.x - b.r}px`, top: `${b.y - b.r}px`, width: `${b.r * 2}px`, height: `${b.r * 2}px` }); });
    if (fsEl) css(fsEl, { left: `${L.aux.x}px`, top: `${L.aux.y}px`, width: `${L.aux.w}px`, height: `${L.aux.h}px` });
    if (menuEl) css(menuEl, { left: `${L.menu.x}px`, top: `${L.menu.y}px`, width: `${L.menu.w}px`, height: `${L.menu.h}px` });
    opts.onLayout?.(L, shown);
    return L;
  }
  const env = () => ({ maxTouchPoints: globalThis.navigator?.maxTouchPoints ?? 0, coarse: globalThis.matchMedia?.("(pointer: coarse)").matches ?? false });
  function applyMode() {
    shown = shouldShow(mode, env());
    el.style.display = shown ? "" : "none";
    if (!shown) pad.releaseAll();
    place();
  }
  const onResize = () => place();
  globalThis.addEventListener("resize", onResize);
  globalThis.addEventListener("orientationchange", onResize);
  buildButtons();
  applyMode();

  return {
    pad,
    el,
    get visible() { return shown; },
    get mode() { return mode; },
    get layout() { return L; },
    get profile() { return pad.profile; },
    setProfile(name) { if (pad.setProfile(name)) buildButtons(); },
    setMode(m) { mode = m; applyMode(); },
    relayout: place,
    destroy() { pad.releaseAll(); globalThis.removeEventListener("resize", onResize); globalThis.removeEventListener("orientationchange", onResize); el.remove(); },
  };
}
