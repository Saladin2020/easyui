/** CLI smoke test: init a temp workspace, check, render, icons and export through the real CLI. */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
// node + the tsx CLI directly: spawning "npx" fails on Windows without a shell
const TSX_CLI = `${process.cwd()}/node_modules/tsx/dist/cli.mjs`;

const ws = mkdtempSync(path.join(os.tmpdir(), "easyui-cli-"));
const cli = (...args) => execFileSync(process.execPath, [TSX_CLI, "src/cli.ts", ...args, "--workspace", ws], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const plain = (...args) => execFileSync(process.execPath, [TSX_CLI, "src/cli.ts", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
let failed = false;
const ok = (cond, label) => {
  console.log(`${cond ? "ok  " : "FAIL"} ${label}`);
  if (!cond) failed = true;
};
const png = (f) => existsSync(f) && readFileSync(f).toString("ascii", 1, 4) === "PNG";

cli("init");
ok(existsSync(path.join(ws, "screens", "village.easyui.json")) && existsSync(path.join(ws, "backgrounds", "thai_village_street.png")), "init copies the demo doc + backgrounds");
const check = JSON.parse(cli("check", "village", "--json"));
ok(check.errors.length === 0 && check.warnings.length === 0, "check: demo doc is clean");

const bad = JSON.parse(readFileSync(path.join(ws, "screens", "village.easyui.json"), "utf8"));
bad.screens.hud.widgets[2].kind = "rage";
bad.screens.hud.widgets.push({ type: "icon", x: 10, y: 10, icon: "dragon" });
writeFileSync(path.join(ws, "screens", "broken.easyui.json"), JSON.stringify(bad));
let out = "";
try {
  cli("check", "broken");
} catch (e) {
  out = String(e.stdout) + String(e.stderr);
}
ok(/screens\.hud\.widgets\[2\]\.kind/.test(out) && /unknown icon "dragon"/.test(out), "check reports the JSON path + unknown icon");

const shot = path.join(ws, "inv.png");
cli("render", "inventory", "--out", shot, "--scale", "2");
const b = readFileSync(shot);
ok(png(shot) && b.readUInt32BE(16) === 960 && b.readUInt32BE(20) === 540, "render → 960×540 PNG at ×2");
cli("render", "village:pause", "--out", path.join(ws, "pause-night.png"), "--style", "night", "--scale", "1");
ok(png(path.join(ws, "pause-night.png")), "render doc:screen with a style override");
plain("icons", "--out", path.join(ws, "icons.png"), "--styles", path.join(ws, "styles.png"));
ok(png(path.join(ws, "icons.png")) && png(path.join(ws, "styles.png")), "icons → icon + style sheets");
ok(/sticky_rice\s+กระติบข้าวเหนียว/.test(plain("icons")), "icons lists Thai names");
ok(/inventory\s+teak/.test(cli("list", "--doc", "village")), "list --doc shows screens");

cli("export", "--preset", "all", "--scale", "1");
for (const f of ["exports/village-godot/project.godot", "exports/village-godot/easyui/themes/teak.tres", "exports/village-godot/scenes/inventory.tscn", "exports/village-pixi/easyui.atlas.json", "exports/village-pixi/index.html", "exports/village-png/screens/title.png", "exports/village-json/village.easyui.json"]) {
  ok(existsSync(path.join(ws, f)), `export → ${f}`);
}

rmSync(ws, { recursive: true, force: true });
console.log(failed ? "CLI smoke FAILED" : "CLI smoke OK");
process.exit(failed ? 1 : 0);
