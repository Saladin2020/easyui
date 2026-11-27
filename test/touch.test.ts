/** DSK-7: phone touch controls — stick quantisation, multitouch key state, layouts, auto-show. */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain JS runtime module (shipped as-is to Pixi games)
import { TouchPad, keyCode, shouldShow, stickToDirs, touchLayout } from "../runtime/pixi/easyui-touch-core.js";

const held = (d: Record<string, boolean>) => Object.keys(d).filter((k) => d[k]).sort().join("+");
const profiles = {
  map: { stick: "8way", buttons: [{ id: "ok", label: "A", key: "Enter" }, { id: "back", label: "B", key: "Escape" }, { id: "wait", label: "Z", key: "z" }] },
  side: { stick: "horizontal", buttons: [{ id: "jump", label: "↑", key: " " }, { id: "hit", label: "J", key: "j" }] },
  menu: { stick: "4way", buttons: [{ id: "ok", label: "A", key: "Enter" }] },
};
function make(profile = "map") {
  const log: string[] = [];
  const pad = new TouchPad({ profiles, profile, sink: (k: string, d: boolean) => log.push(`${d ? "+" : "-"}${k}`) });
  return { pad, log };
}

describe("stickToDirs", () => {
  it("8-way covers all eight directions", () => {
    const c = Math.SQRT1_2;
    expect(held(stickToDirs(1, 0))).toBe("right");
    expect(held(stickToDirs(c, c))).toBe("down+right");
    expect(held(stickToDirs(0, 1))).toBe("down");
    expect(held(stickToDirs(-c, c))).toBe("down+left");
    expect(held(stickToDirs(-1, 0))).toBe("left");
    expect(held(stickToDirs(-c, -c))).toBe("left+up");
    expect(held(stickToDirs(0, -1))).toBe("up");
    expect(held(stickToDirs(c, -c))).toBe("right+up");
  });
  it("deadzone, 4-way, horizontal, vertical, none", () => {
    expect(held(stickToDirs(0.1, 0.1))).toBe("");
    expect(held(stickToDirs(0.8, -0.6, "4way"))).toBe("right");
    expect(held(stickToDirs(0.5, -0.9, "4way"))).toBe("up");
    expect(held(stickToDirs(-0.6, -0.9, "horizontal"))).toBe("left");
    expect(held(stickToDirs(0.1, -0.9, "horizontal"))).toBe("");
    expect(held(stickToDirs(0.9, 0.5, "vertical"))).toBe("down");
    expect(held(stickToDirs(1, 0, "none"))).toBe("");
  });
});

describe("TouchPad", () => {
  it("sends only transitions; diagonal = two arrows", () => {
    const { pad, log } = make();
    pad.stick(0.7, -0.7);
    pad.stick(0.72, -0.69);
    pad.stick(1, 0);
    pad.stickEnd();
    expect(log).toEqual(["+ArrowRight", "+ArrowUp", "-ArrowUp", "-ArrowRight"]);
  });
  it("multitouch: stick and two buttons held together", () => {
    const { pad, log } = make();
    pad.stick(-1, 0);
    expect(pad.press("ok")).toBe(true);
    expect(pad.press("wait")).toBe(true);
    expect(pad.held().sort()).toEqual(["ArrowLeft", "Enter", "z"]);
    pad.release("ok");
    expect(pad.held().sort()).toEqual(["ArrowLeft", "z"]);
    expect(pad.press("nope")).toBe(false);
    expect(log.filter((l) => l === "+Enter")).toHaveLength(1);
  });
  it("two buttons on the same key keep it down until both lift", () => {
    const pad2 = new TouchPad({ profiles: { p: { stick: "none", buttons: [{ id: "a", key: "Enter" }, { id: "b", key: "Enter" }] } }, sink: () => {} });
    pad2.press("a"); pad2.press("b"); pad2.release("a");
    expect(pad2.held()).toEqual(["Enter"]);
    pad2.release("b");
    expect(pad2.held()).toEqual([]);
  });
  it("profile switch releases held keys; side-view stick is left/right only", () => {
    const { pad, log } = make();
    pad.stick(0, -1);
    pad.press("ok");
    expect(pad.setProfile("side")).toBe(true);
    expect(pad.held()).toEqual([]);
    expect(log.slice(-2).sort()).toEqual(["-ArrowUp", "-Enter"]);
    pad.stick(0.6, -0.8);
    expect(pad.held()).toEqual(["ArrowRight"]);
    expect(pad.tap("jump")).toBe(true);
    expect(log.slice(-2)).toEqual(["+ ", "- "]);
    expect(pad.setProfile("side")).toBe(false);
  });
  it("dpad presses", () => {
    const { pad } = make("menu");
    pad.dpad("down", true);
    expect(pad.held()).toEqual(["ArrowDown"]);
    pad.dpad("down", false);
    expect(pad.held()).toEqual([]);
  });
  it("keyCode", () => {
    expect(keyCode("e")).toBe("KeyE");
    expect(keyCode(" ")).toBe("Space");
    expect(keyCode("ArrowUp")).toBe("ArrowUp");
    expect(keyCode("5")).toBe("Digit5");
  });
});

describe("shouldShow", () => {
  it("auto shows on touch screens only; on/off force", () => {
    expect(shouldShow("auto", { maxTouchPoints: 5 })).toBe(true);
    expect(shouldShow("auto", { coarse: true })).toBe(true);
    expect(shouldShow("auto", { maxTouchPoints: 0, coarse: false })).toBe(false);
    expect(shouldShow("on", {})).toBe(true);
    expect(shouldShow("off", { maxTouchPoints: 5 })).toBe(false);
  });
});

describe("touchLayout", () => {
  const inside = (L: any, w: number, h: number) => {
    for (const b of [...L.buttons, { ...L.stick }]) {
      expect(b.x - b.r).toBeGreaterThanOrEqual(L.safe.left);
      expect(b.x + b.r).toBeLessThanOrEqual(w - L.safe.right);
      expect(b.y - b.r).toBeGreaterThanOrEqual(L.safe.top);
      expect(b.y + b.r).toBeLessThanOrEqual(h - L.safe.bottom);
    }
  };
  const overlaps = (a: any, b: any) => Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r;
  it("landscape phone with a notch: game fitted, controls inside the safe area, no overlaps", () => {
    const L = touchLayout({ w: 844, h: 390, safe: { left: 47, right: 47, bottom: 21 }, buttons: 5 });
    expect(L.orientation).toBe("landscape");
    expect(L.game.h).toBeLessThanOrEqual(390);
    expect(L.game.x).toBeGreaterThanOrEqual(47);
    inside(L, 844, 390);
    for (let i = 0; i < L.buttons.length; i++) for (let j = i + 1; j < L.buttons.length; j++) expect(overlaps(L.buttons[i], L.buttons[j])).toBe(false);
    for (const b of L.buttons) expect(overlaps(b, L.stick)).toBe(false);
  });
  it("landscape: side gutters keep the stick off the game; overlay mode lets the game fill the height", () => {
    const L = touchLayout({ w: 844, h: 390, safe: { left: 47, right: 47 }, buttons: 3 });
    expect(L.gutter).toBeGreaterThan(0);
    expect(L.stick.x + L.stick.r).toBeLessThanOrEqual(L.game.x);
    expect(L.game.w).toBeGreaterThan(400);
    const O = touchLayout({ w: 844, h: 390, safe: { left: 47, right: 47 }, buttons: 3, fit: "overlay" });
    expect(O.gutter).toBe(0);
    expect(O.game.h).toBe(390);
    // a nearly 16:9 tablet would lose too much → overlay
    expect(touchLayout({ w: 1024, h: 600, buttons: 3 }).gutter).toBe(0);
  });
  it("portrait phone: game on top at full width, controls in the band below", () => {
    const L = touchLayout({ w: 390, h: 844, safe: { top: 47, bottom: 34 }, buttons: 4 });
    expect(L.orientation).toBe("portrait");
    expect(L.game.w).toBe(390);
    expect(L.game.y).toBe(47);
    expect(L.stick.y - L.stick.r).toBeGreaterThanOrEqual(L.game.y + L.game.h);
    for (const b of L.buttons) expect(b.y - b.r).toBeGreaterThanOrEqual(L.game.y + L.game.h);
    inside(L, 390, 844);
    expect(L.menu.y).toBeGreaterThanOrEqual(L.game.y + L.game.h); // menu button does not cover the game
    expect(L.aux.x + L.aux.w).toBeLessThanOrEqual(L.menu.x);
  });
  it("small portrait screens overlay the controls at the bottom", () => {
    const L = touchLayout({ w: 320, h: 300, buttons: 2 });
    inside(L, 320, 300);
  });
});

describe("shipping", () => {
  it("the DOM module and Godot script ship next to the core", () => {
    expect(existsSync("runtime/pixi/easyui-touch.js")).toBe(true);
    const gd = readFileSync("runtime/godot/easyui_touch.gd", "utf8");
    expect(gd).toContain("TouchScreenButton");
    expect(gd).toContain("Input.action_press");
  });
});
