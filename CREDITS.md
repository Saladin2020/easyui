# Credits

## UI parts and icons (CC0 1.0)

* Every frame, button state, bar, slot, slider, tab, cursor and item icon is **drawn from code** at render time
  (`src/shared/frames.ts`, `src/shared/icons.ts`) — no source images, no AI generation, no network calls.
  The parts, the 24 icons, the demo doc (`samples/screens/village.easyui.json`) and everything you render or
  export from them are dedicated to the public domain (CC0 1.0): use them anywhere, no attribution required.
* Frame palettes match Easy Dialogue's dialogue-box styles so the two kits sit together on one screen.

## Backgrounds

* `samples/backgrounds/thai_village_street.png` and `thai_village_shops.png` come from
  [Easy Dialogue](https://github.com/Saladin2020/easydialogue) (procedural, CC0 1.0).
* `samples/backgrounds/kampung_mosque.png` is a render of [Easy Scene](https://github.com/Saladin2020/easyscene)'s
  `harmony_town` (Malay house and wooden mosque), procedural, CC0 1.0.

## Fonts

* **Kanit** (Regular, Medium) — Copyright 2020 The Kanit Project Authors (https://github.com/cadsondemak/kanit).
  SIL Open Font License 1.1, see `assets/fonts/OFL.txt`. Bundled for Thai text in renders and exports.

## Runtimes

* PixiJS v8 is **not** bundled: the exported `index.html` loads `./pixi.min.js` if you drop it next to the file,
  otherwise the jsDelivr CDN (MIT).
* Godot exports target Godot 4.3+ (MIT); nothing from the engine is included.
