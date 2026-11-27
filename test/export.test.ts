import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PARTS } from "../src/shared/frames.js";
import { ICON_NAMES } from "../src/shared/icons.js";
import { STYLES } from "../src/shared/types.js";
import { buildAtlas } from "../src/lib/atlas.js";
import { exportUi } from "../src/lib/export.js";
import { tempWorkspace } from "./helpers.js";

let root: string;
let cleanup: () => Promise<void>;
beforeAll(async () => {
  ({ root, cleanup } = await tempWorkspace());
});
afterAll(() => cleanup());

const SCREENS = ["title", "hud", "pause", "settings", "inventory", "shop", "raya"];

describe("atlas", () => {
  it("packs every part ×4 styles + icons without overlap, inside a power-of-two sheet", () => {
    const a = buildAtlas(STYLES);
    expect(a.frames).toHaveLength(STYLES.length * Object.keys(PARTS).length + ICON_NAMES.length);
    expect(Math.log2(a.height) % 1).toBe(0);
    for (const f of a.frames) {
      expect(f.x + f.w).toBeLessThanOrEqual(a.width);
      expect(f.y + f.h).toBeLessThanOrEqual(a.height);
    }
    for (let i = 0; i < a.frames.length; i++)
      for (let j = i + 1; j < a.frames.length; j++) {
        const p = a.frames[i]!;
        const q = a.frames[j]!;
        const overlap = p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;
        expect(overlap, `${p.name} × ${q.name}`).toBe(false);
      }
  });
});

describe("exportUi", () => {
  it("godot: project, a theme per style with StyleBoxTexture nine-slices, one scene per screen", async () => {
    const res = await exportUi(root, { doc: "village", preset: "godot" });
    const dir = res.dirs[0]!;
    const project = await readFile(path.join(dir, "project.godot"), "utf8");
    expect(project).toMatch(/run\/main_scene="res:\/\/scenes\/title\.tscn"/);
    expect(project).toMatch(/theme\/custom="res:\/\/easyui\/themes\/teak\.tres"/);
    expect(project).toMatch(/stretch\/mode="canvas_items"/);
    for (const s of STYLES) {
      const tres = await readFile(path.join(dir, "easyui", "themes", `${s}.tres`), "utf8");
      expect(tres).toMatch(/^\[gd_resource type="Theme"/);
      expect(tres).toMatch(/\[sub_resource type="StyleBoxTexture" id="sb_panel"\]/);
      expect(tres).toMatch(/texture_margin_left = 8\.0/);
      expect(tres).toMatch(/HpBar\/base_type = &"ProgressBar"/);
      expect(tres).toMatch(/default_font = ExtResource\("f_body"\)/);
      for (const m of tres.matchAll(/path="res:\/\/([^"]+)"/g)) expect(existsSync(path.join(dir, m[1]!)), m[1]).toBe(true);
    }
    expect((await readdir(path.join(dir, "scenes"))).sort()).toEqual(SCREENS.map((s) => `${s}.tscn`).sort());
    const inv = await readFile(path.join(dir, "scenes", "inventory.tscn"), "utf8");
    expect(inv).toMatch(/type="GridContainer"/);
    expect(inv).toMatch(/columns = 7/);
    expect(inv).toMatch(/theme_type_variation = &"SlotSelected"/);
    expect(inv).toMatch(/theme_override_font_sizes\/font_size/);
    for (const sid of SCREENS) {
      const t = await readFile(path.join(dir, "scenes", `${sid}.tscn`), "utf8");
      for (const m of t.matchAll(/path="res:\/\/([^"]+)"/g)) expect(existsSync(path.join(dir, m[1]!)), `${sid}: ${m[1]}`).toBe(true);
      expect(t).not.toMatch(/__/);
    }
    expect(existsSync(path.join(dir, "easyui", "fonts", "Kanit-Regular.ttf"))).toBe(true);
    expect(existsSync(path.join(dir, "test_ui.gd"))).toBe(true);
  });

  it("pixi: atlas JSON in Spritesheet format with nine-slice meta, helper, fonts and demo", async () => {
    const res = await exportUi(root, { doc: "village", preset: "pixi" });
    const dir = res.dirs[0]!;
    const atlas = JSON.parse(await readFile(path.join(dir, "easyui.atlas.json"), "utf8"));
    expect(Object.keys(atlas.frames)).toContain("teak/panel");
    expect(Object.keys(atlas.frames)).toContain("icon/mango");
    expect(atlas.meta.image).toBe("easyui.atlas.png");
    expect(atlas.meta.easyui.margins.panel).toBe(8);
    expect(atlas.meta.easyui.colors.night.title).toMatch(/^#/);
    expect(atlas.meta.easyui.icons.mango.th).toBe("มะม่วง");
    const doc = JSON.parse(await readFile(path.join(dir, "village.easyui.json"), "utf8"));
    expect(doc.background).toBe("images/thai_village_street.png");
    for (const f of ["easyui-pixi.js", "easyui-menu-core.js", "index.html", "easyui.atlas.png", "fonts/Kanit-Regular.ttf", "images/thai_village_shops.png"]) expect(existsSync(path.join(dir, f)), f).toBe(true);
  });

  it("png + json + all", async () => {
    const res = await exportUi(root, { doc: "village", preset: "all", scale: 1 });
    expect(res.dirs.map((d) => path.basename(d))).toEqual(["village-json", "village-png", "village-pixi", "village-godot"]);
    const png = res.dirs[1]!;
    expect((await readdir(path.join(png, "screens"))).length).toBe(SCREENS.length);
    expect((await readdir(path.join(png, "icons"))).length).toBe(30);
    expect(existsSync(path.join(png, "parts", "lantern", "button_focus.png"))).toBe(true);
    expect(JSON.parse(await readFile(path.join(res.dirs[0]!, "village.easyui.json"), "utf8")).format).toBe("easyui/1");
  });

  it("refuses output outside the workspace unless trusted", async () => {
    await expect(exportUi(root, { doc: "village", preset: "json", out: "../../escape" })).rejects.toThrow(/outside the workspace/);
    await expect(exportUi(root, { doc: "../x", preset: "json" })).rejects.toThrow(/Invalid doc id/);
  });
});
