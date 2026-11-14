import { describe, expect, it } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { wrapText } from "../src/shared/draw.js";
import { registerFonts } from "../src/lib/assets.js";
import { iconSheetPng, renderScreenPng, styleSheetPng } from "../src/lib/render.js";
import { sampleDoc, tempWorkspace } from "./helpers.js";

const PNG = [0x89, 0x50, 0x4e, 0x47];
const dims = (b: Buffer) => [b.readUInt32BE(16), b.readUInt32BE(20)];

describe("screen renderer", () => {
  it("renders every sample screen at ×3 with widget boxes", async () => {
    const { root, cleanup } = await tempWorkspace();
    try {
      const doc = await sampleDoc();
      for (const sid of Object.keys(doc.screens)) {
        const r = await renderScreenPng(root, doc, sid, { scale: 3 });
        expect([...r.png.subarray(0, 4)]).toEqual(PNG);
        expect(dims(r.png)).toEqual([1440, 810]);
        expect(r.hits).toHaveLength(doc.screens[sid]!.widgets.length);
      }
    } finally {
      await cleanup();
    }
  });

  it("is deterministic and the style override changes pixels", async () => {
    const { root, cleanup } = await tempWorkspace();
    try {
      const doc = await sampleDoc();
      const a = await renderScreenPng(root, doc, "inventory", { scale: 1 });
      const b = await renderScreenPng(root, doc, "inventory", { scale: 1 });
      const c = await renderScreenPng(root, doc, "inventory", { scale: 1, style: "night" });
      expect(a.png.equals(b.png)).toBe(true);
      expect(a.png.equals(c.png)).toBe(false);
      await expect(renderScreenPng(root, doc, "nope")).rejects.toThrow(/not in doc/);
    } finally {
      await cleanup();
    }
  });

  it("wraps Thai between words, never inside a syllable", () => {
    registerFonts();
    const g = createCanvas(10, 10).getContext("2d");
    g.font = "8px Kanit";
    const text = "มะม่วงสุกหอมหวาน ฟื้นพลัง 20 HP ใช้ทำข้าวเหนียวมะม่วงได้";
    const lines = wrapText(g, text, 120);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join("").replace(/\s/g, "")).toBe(text.replace(/\s/g, ""));
    for (const ln of lines) expect(ln).not.toMatch(/^[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/);
  });

  it("writes icon and style sheets", () => {
    expect([...iconSheetPng().subarray(0, 4)]).toEqual(PNG);
    expect(dims(styleSheetPng(2))[0]).toBeGreaterThan(400);
  });
});
