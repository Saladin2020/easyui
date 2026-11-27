// Easy UI — game menu logic (title menu, pause menu, settings, save slots), engine-free.
// The Pixi view (`ui.gameMenu` in easyui-pixi.js) draws it; tests drive it directly.
//
//   const m = new MenuStack({
//     pages: {
//       pause: { title: "พัก", rows: [{ id: "resume", label: "เล่นต่อ" }, { id: "settings", label: "ตั้งค่า", to: "settings" }] },
//       settings: { title: "ตั้งค่า", rows: [
//         { id: "lang", label: "ภาษา", kind: "choice", options: [{ value: "th", label: "ไทย" }, { value: "en", label: "English" }] },
//         { id: "volume", label: "เสียง", kind: "slider", value: 0.8, step: 0.1 } ] },
//     },
//     start: "pause",
//     onAction: (row, menu) => {},          // action rows (no `to`)
//     onChange: (row, value, menu) => {},   // choice / slider rows
//     onClose: (menu) => {},                // Esc on the first page (when closable)
//   });
//   m.key("ArrowDown"); m.key("Enter");      // keyboard: ↑↓ / W S move, ←→ / A D change, Enter Space E pick, Esc Backspace back
//   m.tap(1); m.tap(2, 0.9);                 // pointer / touch: row index, optional x ratio (choice ◀ ▶ halves, slider position)
// Rows: { id, label, kind: "action" | "choice" | "slider" | "info", to?, options?, value?, min?, max?, step?, disabled?, hint? }.
// `rows` may be a function (re-read on every render: e.g. save slots). MIT License.

const KEYS = {
  up: ["arrowup", "w"],
  down: ["arrowdown", "s"],
  left: ["arrowleft", "a"],
  right: ["arrowright", "d"],
  ok: ["enter", " ", "space", "e", "z"],
  back: ["escape", "backspace", "x"],
};
const isKey = (k, kind) => KEYS[kind].includes(String(k).toLowerCase());
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class MenuStack {
  constructor({ pages, start, values = {}, closable = true, onAction, onChange, onClose, onOpen } = {}) {
    if (!pages || !pages[start]) throw new Error(`easyui menu: no start page "${start}"`);
    this.pages = pages;
    this.values = { ...values };
    this.closable = closable;
    this.cb = { onAction, onChange, onClose, onOpen };
    this.stack = [{ page: start, index: 0 }];
    this.listeners = new Set();
    this.index = this.firstEnabled(0, 1);
    this.events = [];
  }
  get top() { return this.stack[this.stack.length - 1]; }
  get page() { return this.top.page; }
  get index() { return this.top.index; }
  set index(i) { this.top.index = i; }
  get title() { const t = this.pages[this.page].title; return typeof t === "function" ? t() : t; }
  rows() {
    const r = this.pages[this.page].rows;
    return (typeof r === "function" ? r(this) : r).map((row) => ({ kind: "action", ...row, value: this.valueOf(row) }));
  }
  row(i = this.index) { return this.rows()[i]; }
  valueOf(row) {
    if (row.kind !== "choice" && row.kind !== "slider") return row.value;
    return row.id in this.values ? this.values[row.id] : row.value ?? (row.kind === "choice" ? row.options?.[0]?.value : row.min ?? 0);
  }
  value(id) { return this.values[id]; }
  set(id, v) { this.values[id] = v; this.emit(); }
  selectable(row) { return row && !row.disabled && row.kind !== "info"; }
  firstEnabled(from, dir) {
    const rows = this.rows();
    for (let k = 0; k < rows.length; k++) {
      const i = (from + dir * k + rows.length * 4) % rows.length;
      if (this.selectable(rows[i])) return i;
    }
    return 0;
  }
  subscribe(f) { this.listeners.add(f); return () => this.listeners.delete(f); }
  emit() { for (const f of this.listeners) f(this); }
  log(e) { this.events.push(e); if (this.events.length > 50) this.events.shift(); }

  select(i) {
    const rows = this.rows();
    if (!this.selectable(rows[i])) return false;
    if (this.index === i) return true;
    this.index = i;
    this.emit();
    return true;
  }
  move(d) {
    const rows = this.rows();
    if (!rows.length) return;
    this.index = this.firstEnabled(this.index + d, d);
    this.emit();
  }
  change(d, ratio) {
    const row = this.row();
    if (!this.selectable(row)) return false;
    let v;
    if (row.kind === "choice") {
      const opts = row.options ?? [];
      const at = Math.max(0, opts.findIndex((o) => o.value === row.value));
      v = opts[(at + d + opts.length) % opts.length]?.value;
    } else if (row.kind === "slider") {
      const min = row.min ?? 0, max = row.max ?? 1, step = row.step ?? (max - min) / 10;
      v = ratio !== undefined ? min + Math.round((clamp(ratio, 0, 1) * (max - min)) / step) * step : clamp((row.value ?? min) + d * step, min, max);
      v = Math.round(v * 1000) / 1000;
    } else return false;
    this.values[row.id] = v;
    this.log(`change:${row.id}=${v}`);
    this.cb.onChange?.(row, v, this);
    this.emit();
    return true;
  }
  activate() {
    const row = this.row();
    if (!this.selectable(row)) return false;
    if (row.kind === "choice" || row.kind === "slider") return this.change(1);
    this.log(`action:${row.id}`);
    if (row.to) this.open(row.to);
    else this.cb.onAction?.(row, this);
    this.emit();
    return true;
  }
  open(page) {
    if (!this.pages[page]) throw new Error(`easyui menu: no page "${page}"`);
    this.stack.push({ page, index: 0 });
    this.index = this.firstEnabled(0, 1);
    this.log(`open:${page}`);
    this.cb.onOpen?.(page, this);
    this.emit();
  }
  /** Back one page; on the first page closes the menu (if closable). Returns false when nothing happened. */
  back() {
    if (this.stack.length > 1) {
      this.stack.pop();
      this.log(`back:${this.page}`);
      this.emit();
      return true;
    }
    if (!this.closable) return false;
    this.log("close");
    this.cb.onClose?.(this);
    return true;
  }
  /** Reset to a page (e.g. reopening the pause menu). */
  reset(page) {
    this.stack = [{ page, index: 0 }];
    this.index = this.firstEnabled(0, 1);
    this.emit();
  }
  /** Keyboard. Returns true when the key was used. */
  key(k) {
    if (isKey(k, "up")) return this.move(-1), true;
    if (isKey(k, "down")) return this.move(1), true;
    if (isKey(k, "left")) return this.change(-1);
    if (isKey(k, "right")) return this.change(1);
    if (isKey(k, "ok")) return this.activate();
    if (isKey(k, "back")) return this.back();
    return false;
  }
  /** Pointer / touch on row i. `ratio` is the x position across the row (0..1): choice rows go back on the left third,
   *  sliders jump to the position. */
  tap(i, ratio) {
    if (!this.select(i)) return false;
    const row = this.row();
    if (row.kind === "choice") return this.change(ratio !== undefined && ratio < 0.34 ? -1 : 1);
    if (row.kind === "slider") return this.change(0, ratio ?? 0.5);
    return this.activate();
  }
  /** Plain-data view of the current page (for tests, Godot ports and screen readers). */
  view() {
    return { page: this.page, title: this.title, index: this.index, depth: this.stack.length, rows: this.rows().map((r) => ({ id: r.id, label: r.label, kind: r.kind, value: r.value, valueLabel: r.kind === "choice" ? r.options?.find((o) => o.value === r.value)?.label : r.kind === "slider" ? `${Math.round(((r.value - (r.min ?? 0)) / ((r.max ?? 1) - (r.min ?? 0))) * 100)}%` : undefined, ratio: r.kind === "slider" ? (r.value - (r.min ?? 0)) / ((r.max ?? 1) - (r.min ?? 0)) : undefined, disabled: Boolean(r.disabled), hint: r.hint })) };
  }
}
