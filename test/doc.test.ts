import { describe, expect, it } from "vitest";
import { docSummary, usedIcons, validateDoc } from "../src/shared/doc.js";
import { sampleDoc } from "./helpers.js";

describe("validateDoc", () => {
  it("accepts the sample doc with no errors or warnings", async () => {
    const v = validateDoc(await sampleDoc());
    expect(v.errors).toEqual([]);
    expect(v.warnings).toEqual([]);
    const s = docSummary(v.doc!);
    expect(s.screens.map((x) => x.id)).toEqual(["title", "hud", "pause", "settings", "inventory", "shop"]);
  });

  it("reports errors with paths", async () => {
    const d = await sampleDoc();
    const bad = JSON.parse(JSON.stringify(d));
    bad.format = "easyui/0";
    bad.screens.title.widgets[0].type = "blink";
    bad.screens.hud.widgets.push({ type: "bar", x: 0, y: 0, w: 40, kind: "rage", value: 1, max: 2 });
    bad.screens.settings.widgets.push({ type: "slider", x: 1, y: 1, w: 50, text: "x", value: 3 });
    bad.screens["Bad Id"] = { widgets: [] };
    const v = validateDoc(bad);
    expect(v.doc).toBeNull();
    const paths = v.errors.map((e) => e.path);
    expect(paths).toContain("format");
    expect(paths).toContain("screens.title.widgets[0].type");
    expect(paths.some((p) => /screens\.hud\.widgets\[\d+\]\.kind/.test(p))).toBe(true);
    expect(paths.some((p) => /screens\.settings\.widgets\[\d+\]\.value/.test(p))).toBe(true);
    expect(paths).toContain("screens.Bad Id");
  });

  it("warns about off-screen widgets, unknown icons and overfull grids", async () => {
    const d = await sampleDoc();
    d.screens.hud!.widgets.push({ type: "icon", x: 900, y: 10, icon: "dragon" });
    d.screens.hud!.widgets.push({ type: "hotbar", x: 470, y: 250, slots: 2, items: [null, null, { icon: "key" }] });
    const v = validateDoc(d);
    expect(v.errors).toEqual([]);
    const msgs = v.warnings.map((w) => w.message).join("\n");
    expect(msgs).toMatch(/off-screen/);
    expect(msgs).toMatch(/unknown icon "dragon"/);
    expect(msgs).toMatch(/3 items but only 2 slots/);
    expect(msgs).toMatch(/sticks out/);
  });

  it("collects used icons", async () => {
    const icons = usedIcons(await sampleDoc());
    expect(icons).toContain("mango");
    expect(icons).toContain("lantern");
    expect(icons.length).toBeGreaterThan(20);
  });
});
