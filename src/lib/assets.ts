import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GlobalFonts } from "@napi-rs/canvas";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Package root, whether running from src/lib (tsx), dist/ (built) or a test. */
export const pkgRoot = [path.resolve(here, "../.."), path.resolve(here, "..")].find((p) => existsSync(path.join(p, "samples", "screens"))) ?? path.resolve(here, "../..");

export const RUNTIME_DIR = path.join(pkgRoot, "runtime");
export const FONT_DIR = path.join(pkgRoot, "assets", "fonts");

let registered = false;
/** Kanit for Thai labels in screen renders. */
export function registerFonts(): void {
  if (registered) return;
  GlobalFonts.registerFromPath(path.join(FONT_DIR, "Kanit-Regular.ttf"), "Kanit");
  GlobalFonts.registerFromPath(path.join(FONT_DIR, "Kanit-Medium.ttf"), "Kanit Medium");
  registered = true;
}
