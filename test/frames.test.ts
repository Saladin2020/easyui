import { describe, expect, it } from "vitest";
import { PARTS, PALETTES, STYLE_COLORS } from "../src/shared/frames.js";
import { ICONS, ICON_NAMES, iconPixels } from "../src/shared/icons.js";
import { STYLES } from "../src/shared/types.js";
import { fnv1a } from "./helpers.js";

const alphaCount = (d: Uint8ClampedArray) => {
  let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i]! > 0) n++;
  return n;
};

describe("UI parts", () => {
  it("every part renders in every style with a usable nine-slice margin", () => {
    for (const s of STYLES) {
      expect(PALETTES[s]).toBeTruthy();
      expect(STYLE_COLORS[s].text).toMatch(/^#[0-9a-f]{6}$/);
      for (const [name, def] of Object.entries(PARTS)) {
        const p = def.make(s);
        expect(p.data.length, `${s}/${name}`).toBe(p.width * p.height * 4);
        expect(alphaCount(p.data), `${s}/${name}`).toBeGreaterThan(0);
        if (def.margin) {
          expect(def.margin * 2, `${s}/${name} margin`).toBeLessThanOrEqual(Math.min(p.width, p.height));
          expect(def.margin * 2, `${s}/${name} margin`).toBeLessThan(Math.max(p.width, p.height));
        }
      }
    }
  });

  it("styles differ and parts are deterministic", () => {
    const panels = STYLES.map((s) => fnv1a(PARTS.panel!.make(s).data));
    expect(new Set(panels).size).toBe(STYLES.length);
    expect(fnv1a(PARTS.button_focus!.make("teak").data)).toBe(fnv1a(PARTS.button_focus!.make("teak").data));
    for (const st of ["normal", "hover", "pressed", "disabled", "focus"]) expect(PARTS[`button_${st}`]).toBeTruthy();
  });

  it("panel corners are transparent (rounded) and the centre is filled", () => {
    const p = PARTS.panel!.make("teak");
    expect(p.data[3]).toBe(0);
    const c = ((p.height >> 1) * p.width + (p.width >> 1)) * 4;
    expect(p.data[c + 3]).toBeGreaterThan(200);
  });
});

describe("item icons", () => {
  it("has 24 named 16×16 icons with Thai + English names", () => {
    expect(ICON_NAMES).toHaveLength(24);
    for (const n of ICON_NAMES) {
      expect(ICONS[n]!.th).toMatch(/[\u0E00-\u0E7F]/);
      expect(ICONS[n]!.en.length).toBeGreaterThan(1);
      const p = iconPixels(n);
      expect([p.width, p.height]).toEqual([16, 16]);
      const filled = alphaCount(p.data);
      expect(filled, n).toBeGreaterThan(30);
      expect(filled, n).toBeLessThan(256);
    }
  });

  it("icons are distinct, outlined and have no stray opaque-black erasers", () => {
    const hashes = ICON_NAMES.map((n) => fnv1a(iconPixels(n).data));
    expect(new Set(hashes).size).toBe(ICON_NAMES.length);
    for (const n of ICON_NAMES) {
      const d = iconPixels(n).data;
      let pureBlack = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] === 255 && d[i] === 0 && d[i + 1] === 0 && d[i + 2] === 0) pureBlack++;
      expect(pureBlack, `${n} has #000000 pixels`).toBe(0);
    }
  });
});
