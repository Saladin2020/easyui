import type { Provider } from "../../src/shared/draw";
import { PARTS, type Pixels } from "../../src/shared/frames";
import { iconPixels, isIcon } from "../../src/shared/icons";
import type { UiStyle } from "../../src/shared/types";
import { fileUrl } from "./api";

function toCanvas(p: Pixels): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = p.width;
  c.height = p.height;
  const g = c.getContext("2d")!;
  const img = g.createImageData(p.width, p.height);
  img.data.set(p.data);
  g.putImageData(img, 0, 0);
  return c;
}

const parts = new Map<string, HTMLCanvasElement>();
const icons = new Map<string, HTMLCanvasElement>();
const images = new Map<string, HTMLImageElement | null>();

export function partCanvas(style: UiStyle, name: string): HTMLCanvasElement {
  const k = `${style}/${name}`;
  let c = parts.get(k);
  if (!c) {
    c = toCanvas(PARTS[name]!.make(style));
    parts.set(k, c);
  }
  return c;
}
export function iconCanvas(name: string): HTMLCanvasElement | null {
  if (!isIcon(name)) return null;
  let c = icons.get(name);
  if (!c) {
    c = toCanvas(iconPixels(name));
    icons.set(name, c);
  }
  return c;
}

/** Browser provider; `onLoad` fires when a workspace image finishes loading so the stage can redraw. */
export function browserProvider(onLoad: () => void): Provider {
  return {
    part: (style, name) => partCanvas(style, name),
    icon: (name) => iconCanvas(name),
    image: (src) => {
      if (!images.has(src)) {
        images.set(src, null);
        const img = new Image();
        img.onload = () => {
          images.set(src, img);
          onLoad();
        };
        img.src = fileUrl(src);
      }
      return images.get(src) ?? null;
    },
    size: (d) => ({ width: d.naturalWidth || d.width, height: d.naturalHeight || d.height }),
  };
}

export async function loadFonts(): Promise<void> {
  for (const [family, file] of [["Kanit", "Kanit-Regular.ttf"], ["Kanit Medium", "Kanit-Medium.ttf"]] as const) {
    const face = new FontFace(family, `url(/api/fonts/${file})`);
    await face.load();
    document.fonts.add(face);
  }
}
