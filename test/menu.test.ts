/** DSK-6: game menus (title, pause, settings, save slots) — keyboard and pointer / touch, engine-free core. */
import { describe, expect, it } from "vitest";
// @ts-expect-error plain JS runtime module (shipped as-is to Pixi games)
import { MenuStack } from "../runtime/pixi/easyui-menu-core.js";

const slots = [{ slot: "slot_1", exists: true }, { slot: "slot_2", exists: false }];
function make(over: Record<string, unknown> = {}) {
  const log: string[] = [];
  const m = new MenuStack({
    start: "pause",
    pages: {
      pause: { title: "พักเกม", rows: [
        { id: "resume", label: "เล่นต่อ" },
        { id: "save", label: "บันทึก", to: "save" },
        { id: "settings", label: "ตั้งค่า", to: "settings" },
        { id: "controls", label: "วิธีเล่น", to: "controls" },
        { id: "title", label: "กลับหน้าแรก" },
      ] },
      save: { title: "ช่องบันทึก", rows: () => slots.map((s, i) => ({ id: s.slot, label: `ช่อง ${i + 1}`, hint: s.exists ? "มีข้อมูล" : "ว่าง" })) },
      settings: { title: "ตั้งค่า", rows: [
        { id: "lang", label: "ภาษา", kind: "choice", options: [{ value: "th", label: "ไทย" }, { value: "en", label: "English" }, { value: "ms", label: "Bahasa Melayu" }] },
        { id: "volume", label: "เสียง", kind: "slider", value: 0.8, step: 0.1 },
        { id: "font", label: "ฟอนต์", kind: "choice", options: [{ value: "sarabun", label: "สารบรรณ" }, { value: "makham", label: "มะขาม" }] },
        { id: "locked", label: "ล็อก", disabled: true },
      ] },
      controls: { title: "วิธีเล่น", rows: [{ id: "i1", label: "ลูกศร เดิน", kind: "info" }, { id: "ok", label: "กลับ", to: undefined }] },
    },
    onAction: (row: { id: string }) => log.push(`action:${row.id}`),
    onChange: (row: { id: string }, v: unknown) => log.push(`change:${row.id}=${v}`),
    onClose: () => log.push("close"),
    ...over,
  });
  return { m, log };
}

describe("MenuStack keyboard", () => {
  it("moves with arrows / WS, wraps, and picks actions with Enter / Space / E", () => {
    const { m, log } = make();
    expect(m.view().rows[m.index].id).toBe("resume");
    m.key("ArrowUp");
    expect(m.row().id).toBe("title"); // wraps to the bottom
    m.key("s");
    expect(m.row().id).toBe("resume");
    m.key("Enter");
    m.key("ArrowDown"); m.key("ArrowDown"); m.key("ArrowDown"); m.key("ArrowDown");
    m.key(" ");
    expect(log).toEqual(["action:resume", "action:title"]);
  });

  it("opens sub-pages, goes back with Esc, and closes from the first page", () => {
    const { m, log } = make();
    m.key("ArrowDown"); m.key("e");
    expect(m.page).toBe("save");
    expect(m.view().rows.map((r: { hint: string }) => r.hint)).toEqual(["มีข้อมูล", "ว่าง"]);
    m.key("Escape");
    expect(m.page).toBe("pause");
    expect(m.row().id).toBe("save"); // the parent keeps its cursor
    m.key("Escape");
    expect(log).toEqual(["close"]);
  });

  it("changes choices with ←→ / AD (wrapping) and sliders in steps, clamped", () => {
    const { m, log } = make();
    m.open("settings");
    m.key("ArrowRight");
    expect(m.value("lang")).toBe("en");
    m.key("a"); m.key("a");
    expect(m.value("lang")).toBe("ms");
    m.key("ArrowDown");
    m.key("ArrowRight"); m.key("ArrowRight"); m.key("ArrowRight");
    expect(m.value("volume")).toBe(1);
    m.key("ArrowLeft");
    expect(m.value("volume")).toBeCloseTo(0.9);
    m.key("ArrowDown");
    m.key("Enter"); // Enter on a choice steps forward
    expect(m.value("font")).toBe("makham");
    m.key("ArrowDown"); // the disabled row is skipped
    expect(m.row().id).toBe("lang");
    expect(log).toContain("change:font=makham");
    expect(m.view().rows.find((r: { id: string }) => r.id === "lang").valueLabel).toBe("Bahasa Melayu");
  });

  it("skips info rows and ignores unknown keys", () => {
    const { m } = make();
    m.open("controls");
    expect(m.row().id).toBe("ok");
    m.key("ArrowDown");
    expect(m.row().id).toBe("ok");
    expect(m.key("q")).toBe(false);
  });
});

describe("MenuStack pointer / touch", () => {
  it("tap picks a row; tap on a choice's left third steps back; tap on a slider sets the value", () => {
    const { m, log } = make();
    m.tap(2);
    expect(m.page).toBe("settings");
    m.tap(0, 0.9);
    expect(m.value("lang")).toBe("en");
    m.tap(0, 0.1);
    expect(m.value("lang")).toBe("th");
    m.tap(1, 0.31);
    expect(m.value("volume")).toBeCloseTo(0.3);
    expect(m.tap(3)).toBe(false); // disabled
    expect(m.view().rows[1].ratio).toBeCloseTo(0.3);
    expect(log.filter((l) => l.startsWith("change:"))).toEqual(["change:lang=en", "change:lang=th", "change:volume=0.3"]);
  });

  it("non-closable title menus stay open on Esc and reset() returns to a page", () => {
    const { m, log } = make({ closable: false });
    expect(m.key("Escape")).toBe(false);
    m.open("settings");
    m.reset("pause");
    expect(m.view()).toMatchObject({ page: "pause", depth: 1, index: 0, title: "พักเกม" });
    expect(log).toEqual([]);
  });
});
