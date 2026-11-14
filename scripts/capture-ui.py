"""Headless Chrome screenshots of the web editor (README images) + console error check.

  python3 scripts/capture-ui.py [url] [out-prefix]

Saves <prefix>-inventory.png (inventory screen, a slot grid selected) and <prefix>-settings.png (paper style,
a slider selected after a drag). Needs Playwright for Python and Chrome (CHROME_PATH or /usr/bin/google-chrome).
"""
import asyncio, os, sys
from playwright.async_api import async_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8838/"
OUT = sys.argv[2] if len(sys.argv) > 2 else "docs/assets/ui-editor"


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get("CHROME_PATH", "/usr/bin/google-chrome"))
        pg = await b.new_page(viewport={"width": 1680, "height": 1050}, device_scale_factor=1)
        errs = []
        pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto(URL)
        await pg.wait_for_selector(".stage-canvas")
        await pg.locator(".panel-list .item-btn", has_text="Inventory").first.click()
        await pg.wait_for_timeout(500)
        c = pg.locator(".stage-canvas")
        box = await c.bounding_box()
        k = box["width"] / 480
        await pg.mouse.click(box["x"] + 100 * k, box["y"] + 100 * k)  # the item grid
        await pg.wait_for_selector(".icon-picker, .prop-grid")
        await pg.wait_for_timeout(400)
        await pg.screenshot(path=f"{OUT}-inventory.png")
        await pg.locator(".panel-list .item-btn", has_text="Settings").first.click()
        await pg.wait_for_timeout(400)
        # drag the "voice" slider row 6px to the right
        x, y = box["x"] + 300 * k, box["y"] + 122 * k
        await pg.mouse.move(x, y)
        await pg.mouse.down()
        await pg.mouse.move(x + 6 * k, y, steps=4)
        await pg.mouse.up()
        await pg.wait_for_timeout(400)
        dirty = await pg.locator(".badge-dirty").count()
        await pg.screenshot(path=f"{OUT}-settings.png")
        print("saved", OUT + "-inventory.png", OUT + "-settings.png", "dirty after drag:", bool(dirty))
        print("console errors:", errs)
        await b.close()
        if errs or not dirty:
            sys.exit(1)


asyncio.run(main())
