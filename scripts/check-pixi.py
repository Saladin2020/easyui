"""Headless Chrome check of a PixiJS export: no console errors, every screen builds, keys + clicks work.

  python3 scripts/check-pixi.py <pixi-export-dir> [screenshot-prefix]

Serves the folder on 127.0.0.1:8979, waits for window.__ready, renders every screen through easyui-pixi.js,
drives the menu / inventory with the keyboard, clicks a button, prints a JSON report and (optionally) saves
<prefix>-<screen>.png for each screen.
"""
import asyncio, json, os, subprocess, sys, time
from playwright.async_api import async_playwright

DIR = sys.argv[1]
SHOT = sys.argv[2] if len(sys.argv) > 2 else None
PORT = 8979
srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--bind", "127.0.0.1"], cwd=DIR, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get("CHROME_PATH", "/usr/bin/google-chrome"), args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader"])
        pg = await b.new_page(viewport={"width": 1500, "height": 950})
        errs = []
        pg.on("console", lambda m: errs.append(f"{m.type}: {m.text}") if m.type in ("error", "warning") else None)
        pg.on("pageerror", lambda e: errs.append(str(e)))
        # the page probes ./pixi.min.js before the CDN — that 404 is expected
        pg.on("response", lambda r: errs.append(f"http {r.status}: {r.url}") if r.status >= 400 and not r.url.endswith("/pixi.min.js") else None)
        await pg.goto(f"http://127.0.0.1:{PORT}/index.html")
        await pg.wait_for_function("window.__ready === true", timeout=40000)
        report = {"frames": await pg.evaluate("window.__ui.frames"), "screens": {}}
        for sid in await pg.evaluate("window.__ui.screens"):
            await pg.evaluate("(s) => window.__ui.show(s)", sid)
            await pg.wait_for_timeout(250)
            report["screens"][sid] = await pg.evaluate("window.__ui.widgets")
            if SHOT:
                await pg.locator("canvas").screenshot(path=f"{SHOT}-{sid}.png")
        # keyboard: title menu down + Enter fires a select action
        await pg.evaluate("window.__ui.show('title')")
        await pg.wait_for_timeout(200)
        await pg.keyboard.press("ArrowDown")
        await pg.keyboard.press("ArrowDown")
        await pg.keyboard.press("Enter")
        # inventory: arrows move the selection; click the "use" button
        await pg.evaluate("window.__ui.show('inventory')")
        await pg.wait_for_timeout(200)
        await pg.keyboard.press("ArrowRight")
        box = await pg.locator("canvas").bounding_box()
        k = box["width"] / 480
        await pg.mouse.click(box["x"] + (232 + 47) * k, box["y"] + (132 + 10) * k)
        await pg.wait_for_timeout(150)
        report["actions"] = await pg.evaluate("window.__ui.actions")
        real = [e for e in errs if "GL Driver Message" not in e and "Failed to load resource" not in e]
        report["errors"] = real
        print(json.dumps(report, ensure_ascii=False))
        acts = report["actions"]
        ok = (
            not real
            and len(report["screens"]) >= 5
            and all(v > 0 for v in report["screens"].values())
            and any(a.get("action") == "select" and a.get("label") == "ตั้งค่า" for a in acts)
            and any(a.get("id") == "grid" and a.get("index") == 3 for a in acts)
            and any(a.get("id") == "use" and a.get("action") == "click" for a in acts)
        )
        await b.close()
        if not ok:
            sys.exit(1)


try:
    asyncio.run(main())
finally:
    srv.terminate()
