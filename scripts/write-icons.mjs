/**
 * Bake favicon / PWA icons: a tiny teak panel with HP/MP bars and a gold button.
 * Usage: node scripts/write-icons.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas } from "@napi-rs/canvas";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "web", "public");

const PAL = {
  ".": [0, 0, 0, 0],
  s: [36, 29, 71, 255],
  k: [13, 9, 6, 255],
  w: [122, 82, 48, 255],
  W: [192, 138, 82, 255],
  f: [33, 22, 14, 255],
  y: [244, 174, 61, 255],
  Y: [255, 226, 160, 255],
  r: [224, 82, 63, 255],
  b: [91, 168, 230, 255],
};
const ART = [
  "ssssssssssssssss",
  "skkkkkkkkkkkkkks",
  "skYWWWWWWWWWWYks",
  "skWwwwwwwwwwwWks",
  "skWwkkkkkkkkwWks",
  "skWwkrrrrrrkwWks",
  "skWwkbbbbffkwWks",
  "skWwkkkkkkkkwWks",
  "skWwffffffffwWks",
  "skWwkkkkkkkkwWks",
  "skWwkYYYYYYkwWks",
  "skWwkyyyyyykwWks",
  "skWwkkkkkkkkwWks",
  "skYWWWWWWWWWWYks",
  "skkkkkkkkkkkkkks",
  "ssssssssssssssss",
];

function render(size) {
  const c = createCanvas(size, size);
  const g = c.getContext("2d");
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const ch = ART[Math.floor((y * 16) / size)][Math.floor((x * 16) / size)];
      img.data.set(PAL[ch], (y * size + x) * 4);
    }
  }
  g.putImageData(img, 0, 0);
  return c.toBuffer("image/png");
}

await mkdir(outDir, { recursive: true });
for (const [name, size] of [["favicon-32.png", 32], ["icon-192.png", 192], ["icon-512.png", 512], ["apple-touch-icon.png", 180]]) await writeFile(path.join(outDir, name), render(size));
await writeFile(path.join(root, "docs", "assets", "icon-512.png"), render(512));
const rects = [];
ART.forEach((row, y) => [...row].forEach((ch, x) => ch !== "." && rects.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="rgba(${PAL[ch].slice(0, 3).join(",")},${PAL[ch][3] / 255})"/>`)));
await writeFile(path.join(outDir, "favicon.svg"), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">${rects.join("")}</svg>\n`);
await writeFile(path.join(outDir, "site.webmanifest"), `${JSON.stringify({ name: "Easy UI", short_name: "Easy UI", icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }, { src: "/icon-512.png", sizes: "512x512", type: "image/png" }], theme_color: "#f4ae3d", background_color: "#140e0a", display: "standalone" }, null, 2)}\n`);
console.log("icons written");
