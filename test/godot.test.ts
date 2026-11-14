/**
 * Optional Godot check: GODOT=/path/to/godot npx vitest run test/godot.test.ts
 * Exports the demo UI, imports it headless, then test_ui.gd instantiates every screen, checks the themes'
 * StyleBoxTexture nine-slices, textures and initial focus.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { exportUi } from "../src/lib/export.js";
import { tempWorkspace } from "./helpers.js";

const GODOT = process.env.GODOT;
let root: string;
let cleanup: () => Promise<void>;
beforeAll(async () => {
  if (GODOT) ({ root, cleanup } = await tempWorkspace());
});
afterAll(() => cleanup?.());

describe.skipIf(!GODOT)("Godot export", () => {
  it("themes load and every screen instantiates with its focus", async () => {
    const out = path.join(root, "exports", "godot");
    await exportUi(root, { doc: "village", preset: "godot", out });
    // Godot 4.3 has no --import flag; editor passes import the assets (the editor may crash on quit — ignored, so run twice).
    for (let i = 0; i < 2; i++) spawnSync(GODOT!, ["--headless", "--editor", "--quit", "--path", out], { encoding: "utf8", timeout: 180_000 });
    const run = spawnSync(GODOT!, ["--headless", "--path", out, "--script", "res://test_ui.gd"], { encoding: "utf8", timeout: 120_000 });
    expect(run.stdout).toMatch(/^OK$/m);
    expect(run.stdout).toMatch(/^T\| teak panel=StyleBoxTexture margin=8 slot=StyleBoxTexture font=FontFile/m);
    expect(run.stdout).toMatch(/^S\| inventory .*"PanelContainer": 35.* focus=Use missing_tex=0/m);
    expect(run.stdout).toMatch(/^S\| title .* focus=Item0/m);
    const main = spawnSync(GODOT!, ["--headless", "--path", out, "--quit-after", "30"], { encoding: "utf8", timeout: 120_000 });
    expect(main.stderr + main.stdout).not.toMatch(/SCRIPT ERROR|Parse Error/);
  }, 600_000);
});
