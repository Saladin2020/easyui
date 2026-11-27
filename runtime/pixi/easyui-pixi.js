// Easy UI — PixiJS v8 pixel UI kit (nine-slice panels, buttons, bars, inventory, hotbar, menus, Thai text).
// Usage:
//   import { loadUi } from "./easyui-pixi.js";
//   const ui = await loadUi(PIXI, "./easyui.atlas.json");            // atlas + Kanit fonts
//   app.stage.addChild(ui.panel({ w: 200, h: 120, title: "กระเป๋า" }));
//   const hp = ui.bar({ kind: "hp", w: 80, value: 72, max: 100, label: "HP", showText: true }); hp.set(50);
//   const screen = await ui.renderScreen(doc, "inventory");          // whole easyui/1 screen → Container
//   screen.bindKeys(window);                                          // ↑/↓/Enter on menus, ←→↑↓ on grids
//   const pause = ui.gameMenu({ pages, start: "pause", onAction, onChange }); // title / pause / settings / slots,
//   pause.bindKeys(window);                                           // keyboard + mouse / touch (easyui-menu-core.js)
// Lay out in viewport pixels (480×270) and create the app with `resolution: 3` so text stays sharp.
// MIT License. https://github.com/Saladin2020/easyui

import { MenuStack } from "./easyui-menu-core.js";
export { MenuStack };

const seg = typeof Intl !== "undefined" && Intl.Segmenter ? new Intl.Segmenter("th", { granularity: "word" }) : null;

/** Load the atlas JSON (PixiJS Spritesheet format, nine-slice margins in meta.easyui) and the fonts. */
export async function loadUi(PIXI, url, opts = {}) {
  const base = new URL(url, document.baseURI);
  const data = await (await fetch(base)).json();
  const meta = data.meta.easyui;
  const rel = (p) => new URL(p, base).href;
  if (typeof FontFace !== "undefined") {
    for (const [family, file] of Object.entries(meta.fonts ?? {})) {
      const face = new FontFace(family, `url(${rel(file)})`);
      await face.load();
      document.fonts.add(face);
    }
  }
  const tex = await PIXI.Assets.load(rel(data.meta.image));
  tex.source.scaleMode = "nearest";
  const sheet = new PIXI.Spritesheet(tex, data);
  await sheet.parse();
  return new UiKit(PIXI, sheet, meta, { style: opts.style ?? meta.defaultStyle ?? "teak", base });
}

export class UiKit {
  constructor(PIXI, sheet, meta, opts) {
    this.PIXI = PIXI;
    this.sheet = sheet;
    this.meta = meta;
    this.style = opts.style;
    this.base = opts.base;
  }

  /** Texture for `style/part` or `icon/name`. */
  tex(name) {
    const t = this.sheet.textures[name];
    if (!t) throw new Error(`easyui: no frame ${name}`);
    return t;
  }
  colors(style = this.style) {
    return this.meta.colors[style];
  }
  sprite(name) {
    const s = new this.PIXI.Sprite(this.tex(name));
    s.roundPixels = true;
    return s;
  }
  icon(name, scale = 1) {
    const s = this.sprite(`icon/${name}`);
    s.scale.set(scale);
    return s;
  }
  /** Nine-slice sprite of a UI part, margins from the atlas meta. */
  nine(part, w, h, style = this.style) {
    const m = this.meta.margins[part] ?? 0;
    if (!m) {
      const s = this.sprite(`${style}/${part}`);
      s.width = w;
      s.height = h;
      return s;
    }
    const n = new this.PIXI.NineSliceSprite({ texture: this.tex(`${style}/${part}`), leftWidth: m, topHeight: m, rightWidth: m, bottomHeight: m });
    n.width = w;
    n.height = h;
    n.roundPixels = true;
    return n;
  }
  /** Text placed by its baseline (like the CLI renderer), with a 1px drop shadow by default. */
  text(str, { x = 0, y = 0, size = 10, color, title = false, align = "left", shadow, style = this.style } = {}) {
    const C = this.colors(style);
    // padding keeps Thai upper vowels / tone marks (drawn above the measured ascent) from being clipped
    const st = { fontFamily: title ? ["Kanit Medium", "Kanit", "sans-serif"] : ["Kanit", "sans-serif"], fontSize: size, fill: color ?? C.text, padding: Math.ceil(size * 0.4) + 1 };
    const c = new this.PIXI.Container();
    // Pixi draws the first baseline at the measured ascent of the style's font (resolution-independent units).
    const asc = this.PIXI.CanvasTextMetrics.measureText(str || " ", new this.PIXI.TextStyle(st)).fontProperties.ascent;
    const mk = (fill, dx) => {
      const t = new this.PIXI.Text({ text: str, style: { ...st, fill } });
      t.anchor.set(align === "center" ? 0.5 : align === "right" ? 1 : 0, 0);
      t.position.set(dx, dx - asc); // Pixi v8 already offsets the padded texture, so no padding correction here
      return t;
    };
    if (shadow !== false) c.addChild(mk(shadow ?? C.shadow, 0.6));
    const main = mk(st.fill, 0);
    c.addChild(main);
    c.position.set(x, y);
    c.label = "text";
    c.setText = (s) => c.children.forEach((t) => (t.text = s));
    c.width_ = () => main.width;
    return c;
  }
  measure(str, size = 10, title = false) {
    return this.PIXI.CanvasTextMetrics.measureText(str, new this.PIXI.TextStyle({ fontFamily: title ? ["Kanit Medium", "Kanit"] : ["Kanit"], fontSize: size })).width;
  }
  wrap(str, maxW, size = 10) {
    const out = [];
    for (const para of String(str).split("\n")) {
      const words = seg ? [...seg.segment(para)].map((s) => s.segment) : para.split(/(\s+)/);
      let line = "";
      for (const w of words) {
        if (line && this.measure(line + w, size) > maxW) {
          out.push(line.trimEnd());
          line = w.trimStart();
        } else line += w;
      }
      out.push(line.trimEnd());
    }
    return out;
  }

  panel({ x = 0, y = 0, w, h, title, small = false, style = this.style }) {
    const c = new this.PIXI.Container();
    c.position.set(x, y);
    c.addChild(this.nine(small ? "panel_small" : "panel", w, h, style));
    if (title) this._plate(c, title, w, 0, style);
    return c;
  }
  _plate(c, title, w, y, style) {
    const tw = Math.round(this.measure(title, 9, true) + 16);
    const p = this.nine("plate", tw, 15, style);
    p.position.set(Math.round((w - tw) / 2), y - 7);
    c.addChild(p, this.text(title, { x: w / 2, y: y + 3.5, size: 9, align: "center", color: this.colors(style).button, title: true, shadow: false, style }));
  }

  /** Button with normal / hover / pressed / disabled / focus states. Returns a Container with setState(). */
  button({ x = 0, y = 0, w, h = 20, text = "", icon, state = "normal", style = this.style, onClick }) {
    const C = this.colors(style);
    const c = new this.PIXI.Container();
    c.position.set(x, y);
    const frames = {};
    for (const s of ["normal", "hover", "pressed", "disabled", "focus"]) {
      frames[s] = this.nine(`button_${s}`, w, h, style);
      c.addChild(frames[s]);
    }
    const fs = Math.min(10, Math.max(7, h - 9));
    const inner = new this.PIXI.Container();
    let tx = w / 2;
    if (icon) {
      const iw = this.measure(text, fs, true) + 19;
      const ix = (w - iw) / 2;
      const ic = this.icon(icon);
      ic.position.set(Math.round(ix), Math.round((h - 2 - 16) / 2));
      inner.addChild(ic);
      tx = ix + 19 + this.measure(text, fs, true) / 2;
    }
    const label = this.text(text, { x: tx, y: h / 2 + fs * 0.36 - 1, size: fs, align: "center", title: true, shadow: false, style });
    inner.addChild(label);
    c.addChild(inner);
    c.state = state;
    c.setState = (s) => {
      c.state = s;
      for (const k in frames) frames[k].visible = k === s;
      inner.y = s === "pressed" ? 1 : 0;
      const col = s === "disabled" ? C.disabled : s === "hover" || s === "focus" ? C.buttonHi : C.button;
      label.children.forEach((t) => (t.style.fill = col));
    };
    c.setState(state);
    c.eventMode = "static";
    c.cursor = "pointer";
    let base = state;
    c.on("pointerover", () => c.state !== "disabled" && c.setState("hover"));
    c.on("pointerout", () => c.state !== "disabled" && c.setState(base === "focus" ? "focus" : "normal"));
    c.on("pointerdown", () => c.state !== "disabled" && c.setState("pressed"));
    c.on("pointerup", () => {
      if (c.state === "disabled") return;
      c.setState("hover");
      onClick?.();
    });
    c.focus = (on) => {
      if (c.state === "disabled") return;
      base = on ? "focus" : "normal";
      c.setState(base);
    };
    c.click = () => c.state !== "disabled" && onClick?.();
    return c;
  }

  /** Vertical menu (keyboard: ↑/↓/Enter via bindKeys). `onSelect(index, label)`. */
  menu({ x = 0, y = 0, w, items, selected = 0, disabled = [], itemH = 20, gap = 4, panel = true, title, style = this.style, onSelect }) {
    const c = new this.PIXI.Container();
    const px = panel ? 18 : 0;
    const py = panel ? 10 : 0;
    const top = title ? 10 : 0;
    if (panel) {
      const bw = w + px * 2;
      const bh = items.length * itemH + (items.length - 1) * gap + py * 2 + top;
      const p = this.nine("panel", bw, bh, style);
      p.position.set(x - px, y - py);
      c.addChild(p);
      if (title) {
        const t = new this.PIXI.Container();
        t.position.set(x - px, y - py);
        this._plate(t, title, bw, 0, style);
        c.addChild(t);
      }
    }
    const hand = this.sprite(`${style}/cursor_hand`);
    const buttons = items.map((it, i) => {
      const b = this.button({ x, y: y + top + i * (itemH + gap), w, h: itemH, text: it, state: disabled.includes(i) ? "disabled" : "normal", style, onClick: () => onSelect?.(i, it) });
      b.on("pointerover", () => c.select(i));
      c.addChild(b);
      return b;
    });
    c.addChild(hand);
    c.index = selected;
    c.buttons = buttons;
    c.select = (i) => {
      if (buttons[i]?.state === "disabled") return;
      c.index = i;
      buttons.forEach((b, k) => b.focus(k === i));
      hand.position.set(x - 13, buttons[i].y + (itemH - 11) / 2);
    };
    c.move = (d) => {
      for (let k = 1; k <= items.length; k++) {
        const i = (c.index + d * k + items.length * 4) % items.length;
        if (buttons[i].state !== "disabled") return c.select(i);
      }
    };
    c.activate = () => buttons[c.index]?.click();
    c.select(selected);
    return c;
  }

  /**
   * Game menu (title screen, pause menu, settings, save / load slots, controls help) drawn from a MenuStack.
   * Keyboard: ↑↓ W S move · ←→ A D change · Enter Space E pick · Esc Backspace back. Mouse / touch: hover selects,
   * tap picks; tap the left third of a choice row to go back one option; tap a slider where you want it.
   * `text(str, { x, y, size, color, align })` lets a game draw labels with its own font (e.g. Easy Font bitmap text);
   * the default is this kit's Kanit text. Returns a Container with .menu (MenuStack), .key(k), .bindKeys(target), .render().
   */
  gameMenu({ pages, start, values, closable = true, w = 230, itemH = 22, gap = 3, vw = 480, vh = 270, dim = 0.6, text, hint, style = this.style, onAction, onChange, onClose, onOpen }) {
    const P = this.PIXI;
    const C = this.colors(style);
    const c = new P.Container();
    c.label = "gameMenu";
    const menu = new MenuStack({ pages, start, values, closable, onAction, onChange, onClose, onOpen });
    const T = text ?? ((s, o) => this.text(s, { ...o, style, shadow: false }));
    const render = () => {
      for (const d of c.removeChildren()) d.destroy({ children: true });
      const v = menu.view();
      const shade = new P.Graphics().rect(0, 0, vw, vh).fill({ color: 0x080503, alpha: dim });
      shade.eventMode = "static"; // swallow taps behind the menu
      c.addChild(shade);
      const rowsH = v.rows.reduce((a, r) => a + (r.kind === "info" ? 14 : itemH) + gap, -gap);
      const top = v.title ? 18 : 10;
      const ph = rowsH + top + 26;
      const px = Math.round((vw - w) / 2);
      const py = Math.max(4, Math.round((vh - ph) / 2));
      c.addChild(this.panel({ x: px, y: py, w, h: ph, style }));
      if (v.title) c.addChild(T(v.title, { x: vw / 2, y: py + 14, size: 10, color: C.title, align: "center" }));
      let y = py + top + 4;
      const ix = px + 12;
      const iw = w - 24;
      v.rows.forEach((r, i) => {
        if (r.kind === "info") {
          c.addChild(T(r.label, { x: ix + 2, y: y + 10, size: 9, color: C.text }));
          y += 14 + gap;
          return;
        }
        const row = new P.Container();
        row.position.set(ix, y);
        const st = r.disabled ? "disabled" : i === v.index ? "focus" : "normal";
        row.addChild(this.nine(`button_${st}`, iw, itemH, style));
        const col = r.disabled ? C.disabled : i === v.index ? C.buttonHi : C.button;
        const mid = itemH / 2 + 4;
        if (r.kind === "action") row.addChild(T(r.label, { x: iw / 2, y: mid, size: 10, color: col, align: "center" }));
        else row.addChild(T(r.label, { x: 8, y: mid, size: 10, color: col }));
        if (r.kind === "choice") row.addChild(T(`◀ ${r.valueLabel ?? r.value} ▶`, { x: iw - 8, y: mid, size: 10, color: col, align: "right" }));
        if (r.kind === "slider") {
          const tw = Math.round(iw * 0.42);
          const tx = iw - tw - 8;
          const track = this.nine("slider_track", tw, 6, style);
          track.position.set(tx, itemH / 2 - 3);
          const fw = Math.round((tw - 4) * Math.max(0, Math.min(1, r.ratio ?? 0)));
          row.addChild(track);
          if (fw > 0) {
            const fill = this.nine("slider_fill", Math.max(2, fw), 4, style);
            fill.position.set(tx + 2, itemH / 2 - 2);
            row.addChild(fill);
          }
          const knob = this.sprite(`${style}/slider_knob`);
          knob.position.set(Math.round(tx + 2 + fw - 3.5), itemH / 2 - 5);
          row.addChild(knob);
          row.__slider = { tx, tw };
        }
        if (i === v.index) {
          const hand = this.sprite(`${style}/cursor_hand`);
          hand.position.set(-13, (itemH - 11) / 2);
          row.addChild(hand);
        }
        row.eventMode = "static";
        row.cursor = r.disabled ? "default" : "pointer";
        const ratioOf = (e) => {
          const p = row.toLocal(e.global);
          return row.__slider ? (p.x - row.__slider.tx - 2) / (row.__slider.tw - 4) : p.x / iw;
        };
        row.on("pointerover", () => menu.select(i));
        row.on("pointertap", (e) => menu.tap(i, ratioOf(e)));
        row.on("pointermove", (e) => { if (row.__slider && e.buttons & 1) menu.select(i) && menu.change(0, ratioOf(e)); });
        c.addChild(row);
        y += itemH + gap;
      });
      const h = typeof hint === "function" ? hint(v) : hint;
      if (h) c.addChild(T(h, { x: vw / 2, y: py + ph - 7, size: 8, color: C.muted ?? C.text, align: "center" }));
    };
    menu.subscribe(render);
    render();
    c.menu = menu;
    c.render = render;
    c.key = (k) => menu.key(k);
    c.bindKeys = (target = window) => {
      const h = (e) => { if (c.visible && c.parent && menu.key(e.key)) e.preventDefault(); };
      target.addEventListener("keydown", h);
      return () => target.removeEventListener("keydown", h);
    };
    return c;
  }

  /** HP / MP / XP / stamina bar. Returns a Container with set(value, max). */
  bar({ x = 0, y = 0, w, h = 10, kind = "hp", value = 1, max = 1, label, showText = false, style = this.style }) {
    const c = new this.PIXI.Container();
    c.position.set(x, y);
    let bx = 0;
    if (label) {
      c.addChild(this.text(label, { y: h - 1.5, size: 8, color: this.colors(style).title, title: true, style }));
      bx = 22;
    }
    const bg = this.nine("bar_bg", w, h, style);
    bg.x = bx;
    const fill = this.nine(`bar_${kind}`, w - 4, h - 4, style);
    fill.position.set(bx + 2, 2);
    c.addChild(bg, fill);
    const t = showText ? this.text("", { x: bx + w / 2, y: h - 2.6, size: Math.max(6, h - 4), align: "center", color: "#ffffff", shadow: "#000000", style }) : null;
    if (t) c.addChild(t);
    c.set = (v, m = max) => {
      value = v;
      max = m;
      const r = Math.max(0, Math.min(1, m > 0 ? v / m : 0));
      const fw = Math.round((w - 4) * r);
      fill.visible = fw > 0;
      fill.width = Math.max(2, fw);
      t?.setText(`${Math.round(v)}/${Math.round(m)}`);
    };
    c.set(value, max);
    return c;
  }

  slot({ x = 0, y = 0, size = 22, item = null, selected = false, style = this.style }) {
    const c = new this.PIXI.Container();
    c.position.set(x, y);
    const a = this.nine("slot", size, size, style);
    const b = this.nine("slot_selected", size, size, style);
    const content = new this.PIXI.Container();
    c.addChild(a, b, content);
    c.setItem = (it) => {
      content.removeChildren();
      c.item = it;
      if (!it) return;
      const k = size >= 36 ? 2 : 1;
      const ic = this.icon(it.icon, k);
      ic.position.set(Math.round((size - 16 * k) / 2), Math.round((size - 16 * k) / 2));
      content.addChild(ic);
      if (it.count > 1) content.addChild(this.text(String(it.count), { x: size - 2.5, y: size - 2.5, size: 7, align: "right", color: this.colors(style).slotCount, shadow: "#000000", style }));
    };
    c.setSelected = (on) => {
      a.visible = !on;
      b.visible = on;
    };
    c.setItem(item);
    c.setSelected(selected);
    c.eventMode = "static";
    c.cursor = "pointer";
    return c;
  }

  /** Inventory grid; arrow keys via bindKeys, click to select. `onSelect(index, item)`. */
  inventoryGrid({ x = 0, y = 0, cols, rows, slot = 22, gap = 2, items = [], selected = -1, style = this.style, onSelect }) {
    const c = new this.PIXI.Container();
    c.position.set(x, y);
    c.cols = cols;
    c.slots = [];
    for (let i = 0; i < cols * rows; i++) {
      const s = this.slot({ x: (i % cols) * (slot + gap), y: Math.floor(i / cols) * (slot + gap), size: slot, item: items[i] ?? null, style });
      s.on("pointertap", () => c.select(i));
      c.slots.push(s);
      c.addChild(s);
    }
    c.index = selected;
    c.select = (i, silent = false) => {
      c.index = i;
      c.slots.forEach((s, k) => s.setSelected(k === i));
      if (!silent) onSelect?.(i, c.slots[i]?.item ?? null);
    };
    c.move = (dx, dy) => {
      const i = Math.max(0, c.index);
      const col = (i % cols + dx + cols) % cols;
      const row = (Math.floor(i / cols) + dy + rows) % rows;
      c.select(row * cols + col);
    };
    c.setItems = (list) => c.slots.forEach((s, k) => s.setItem(list[k] ?? null));
    if (selected >= 0) c.select(selected, true);
    return c;
  }

  hotbar({ x = 0, y = 0, slots, slot = 22, items = [], selected = -1, keys = true, style = this.style, onSelect }) {
    const g = this.inventoryGrid({ x, y, cols: slots, rows: 1, slot, gap: 2, items, selected, style, onSelect });
    if (keys) {
      g.slots.forEach((s, i) => {
        const b = this.sprite(`${style}/key_badge`);
        b.position.set(-1, -1);
        s.addChild(b, this.text(String((i + 1) % 10), { x: 2.5, y: 5, size: 6, align: "center", color: this.colors(style).button, shadow: false, style }));
      });
    }
    return g;
  }

  toggle({ x = 0, y = 0, text = "", on = false, focus = false, style = this.style, onChange }) {
    const c = new this.PIXI.Container();
    c.position.set(x, y);
    const off = this.sprite(`${style}/check_off`);
    const onS = this.sprite(`${style}/check_on`);
    off.y = onS.y = 1;
    c.addChild(off, onS, this.text(text, { x: 15, y: 10, size: 9, style }));
    if (focus) {
      const h = this.sprite(`${style}/cursor_hand`);
      h.position.set(-13, 1);
      c.addChild(h);
    }
    c.set = (v) => {
      c.on_ = v;
      off.visible = !v;
      onS.visible = v;
    };
    c.set(on);
    c.eventMode = "static";
    c.cursor = "pointer";
    c.on("pointertap", () => {
      c.set(!c.on_);
      onChange?.(c.on_);
    });
    return c;
  }

  slider({ x = 0, y = 0, w, text = "", value = 0.5, focus = false, style = this.style, onChange }) {
    const c = new this.PIXI.Container();
    c.position.set(x, y);
    const lw = Math.round(w * 0.42);
    const tw = w - lw;
    const track = this.nine("slider_track", tw, 6, style);
    track.position.set(lw, 3);
    const fill = this.nine("slider_fill", tw - 4, 4, style);
    fill.position.set(lw + 2, 4);
    const knob = this.sprite(`${style}/slider_knob`);
    c.addChild(this.text(text, { y: 10, size: 9, style }), track, fill, knob);
    if (focus) {
      const h = this.sprite(`${style}/cursor_hand`);
      h.position.set(-13, 1);
      c.addChild(h);
    }
    c.set = (v) => {
      c.value = Math.max(0, Math.min(1, v));
      const fw = Math.round((tw - 4) * c.value);
      fill.visible = fw > 0;
      fill.width = Math.max(2, fw);
      knob.position.set(Math.round(lw + 2 + fw - 3.5), 1);
    };
    c.set(value);
    track.eventMode = "static";
    track.cursor = "pointer";
    track.on("pointertap", (e) => {
      const p = track.toLocal(e.global);
      c.set((p.x - 2) / (tw - 4));
      onChange?.(c.value);
    });
    return c;
  }

  tabs({ x = 0, y = 0, w, tabs, selected = 0, style = this.style, onSelect }) {
    const c = new this.PIXI.Container();
    c.position.set(x, y);
    const n = tabs.length;
    const tw = Math.floor((w - (n - 1) * 2) / n);
    c.select = (s) => {
      c.removeChildren();
      c.index = s;
      tabs.forEach((t, i) => {
        const on = i === s;
        const f = this.nine(on ? "tab_on" : "tab_off", tw, on ? 14 : 12, style);
        f.position.set(i * (tw + 2), on ? 0 : 2);
        f.eventMode = "static";
        f.cursor = "pointer";
        f.on("pointertap", () => {
          c.select(i);
          onSelect?.(i, t);
        });
        c.addChild(f, this.text(t, { x: i * (tw + 2) + tw / 2, y: 10.5, size: 8, align: "center", color: on ? this.colors(style).title : this.colors(style).muted, title: true, style }));
      });
    };
    c.select(selected);
    return c;
  }

  tooltip({ x = 0, y = 0, w, title, text, icon, style = this.style }) {
    const C = this.colors(style);
    const c = new this.PIXI.Container();
    c.position.set(x, y);
    const tx = icon ? 25 : 7;
    const lines = this.wrap(text, w - tx - 7, 8);
    const h = Math.max(icon ? 30 : 0, 20 + lines.length * 10.5);
    c.addChild(this.nine("panel_small", w, h, style));
    if (icon) {
      const s = this.nine("slot", 18, 18, style);
      s.position.set(5, 5);
      const ic = this.icon(icon);
      ic.position.set(6, 6);
      c.addChild(s, ic);
    }
    c.addChild(this.text(title, { x: tx, y: 13, size: 9, color: C.title, title: true, style }));
    lines.forEach((ln, i) => c.addChild(this.text(ln, { x: tx, y: 24 + i * 10.5, size: 8, color: C.muted, style })));
    return c;
  }

  /**
   * Build a whole `easyui/1` screen. Returns a Container with `byId` (id → component), `menus`, `grids`
   * and `bindKeys(target)` (↑/↓/Enter for the first menu, arrows for the first grid).
   */
  async renderScreen(doc, screenId, { base = this.base, onAction } = {}) {
    const P = this.PIXI;
    const screen = doc.screens[screenId];
    if (!screen) throw new Error(`easyui: no screen ${screenId}`);
    const style = screen.style ?? doc.style;
    const VW = doc.viewport.width;
    const VH = doc.viewport.height;
    const root = new P.Container();
    root.byId = {};
    root.menus = [];
    root.grids = [];
    const bg = screen.background ?? doc.background ?? "none";
    if (bg.startsWith("#")) root.addChild(new P.Graphics().rect(0, 0, VW, VH).fill(bg));
    else {
      root.addChild(new P.Graphics().rect(0, 0, VW, VH).fill("#140e0a"));
      if (bg !== "none") {
        const t = await P.Assets.load(new URL(bg, base).href);
        t.source.scaleMode = "nearest";
        const s = new P.Sprite(t);
        const k = Math.max(VW / t.width, VH / t.height);
        s.scale.set(k);
        s.position.set((VW - t.width * k) / 2, VH - t.height * k);
        root.addChild(s);
      }
    }
    if (screen.dim) root.addChild(new P.Graphics().rect(0, 0, VW, VH).fill({ color: "#080503", alpha: screen.dim }));
    for (const [i, w] of screen.widgets.entries()) {
      const o = { ...w, style };
      const act = (detail) => onAction?.({ screen: screenId, id: w.id ?? `${w.type}_${i}`, type: w.type, ...detail });
      let v;
      switch (w.type) {
        case "panel": v = this.panel(o); break;
        case "label": {
          const size = w.size ?? 10;
          const lines = w.w ? this.wrap(w.text, w.w, size) : [w.text];
          v = new P.Container();
          lines.forEach((ln, k) => v.addChild(this.text(ln, { x: w.x, y: w.y + k * size * 1.35, size, color: w.color ?? (w.font === "title" ? this.colors(style).title : undefined), align: w.align, title: w.font === "title", shadow: w.shadow === false ? false : undefined, style })));
          break;
        }
        case "button": v = this.button({ ...o, onClick: () => act({ action: "click" }) }); break;
        case "menu": v = this.menu({ ...o, onSelect: (index, label) => act({ action: "select", index, label }) }); root.menus.push(v); break;
        case "bar": v = this.bar(o); break;
        case "inventory": v = this.inventoryGrid({ ...o, onSelect: (index, item) => act({ action: "select", index, item }) }); root.grids.push(v); break;
        case "hotbar": v = this.hotbar({ ...o, onSelect: (index, item) => act({ action: "select", index, item }) }); root.grids.push(v); break;
        case "icon": v = this.icon(w.icon, w.scale ?? 1); v.position.set(w.x, w.y); break;
        case "toggle": v = this.toggle({ ...o, onChange: (on) => act({ action: "toggle", on }) }); break;
        case "slider": v = this.slider({ ...o, onChange: (value) => act({ action: "change", value }) }); break;
        case "tabs": v = this.tabs({ ...o, onSelect: (index, label) => act({ action: "tab", index, label }) }); break;
        case "tooltip": v = this.tooltip(o); break;
        case "cursor": v = this.sprite(`${style}/${w.kind === "arrow" ? "cursor_arrow" : "cursor_hand"}`); v.position.set(w.x, w.y); break;
        case "image": {
          const t = await P.Assets.load(new URL(w.src, base).href);
          t.source.scaleMode = "nearest";
          v = new P.Sprite(t);
          v.position.set(w.x, w.y);
          if (w.w) v.width = w.w;
          if (w.h) v.height = w.h;
          break;
        }
        default: continue;
      }
      root.byId[w.id ?? `${w.type}_${i}`] = v;
      root.addChild(v);
    }
    root.bindKeys = (target = window) => {
      const h = (e) => {
        const m = root.menus[0];
        const g = root.grids.find((x) => x.slots.length > x.cols) ?? root.grids[0];
        if (m && (e.key === "ArrowUp" || e.key === "ArrowDown")) m.move(e.key === "ArrowUp" ? -1 : 1);
        else if (m && (e.key === "Enter" || e.key === " ")) m.activate();
        else if (g && e.key.startsWith("Arrow")) g.move(e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0, e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0);
        else if (g && /^[1-9]$/.test(e.key)) {
          const hb = root.grids.find((x) => x.slots.length === x.cols);
          if (hb && Number(e.key) <= hb.slots.length) hb.select(Number(e.key) - 1);
        } else return;
        e.preventDefault();
      };
      target.addEventListener("keydown", h);
      return () => target.removeEventListener("keydown", h);
    };
    return root;
  }
}
