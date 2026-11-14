# `easyui/1` format

One JSON file per UI doc: `screens/<id>.easyui.json` in the workspace. `easyui check <id>` validates it and
prints errors (with JSON paths) and layout warnings.

```json
{
  "format": "easyui/1",
  "name": "Lantern Village UI",
  "style": "teak",
  "viewport": { "width": 480, "height": 270 },
  "background": "backgrounds/thai_village_street.png",
  "screens": { "<screen id>": { … } }
}
```

| Field | |
| --- | --- |
| `format` | always `"easyui/1"` |
| `name` | display name |
| `style` | default style: `teak` ไม้สัก · `lantern` โคมแดง · `paper` กระดาษสา · `night` ตลาดกลางคืน · `raya` รายอ |
| `viewport` | logical resolution, 64×64 … 1920×1080 (default demo: 480×270, rendered ×3 = 1440×810) |
| `background` | default backdrop: workspace PNG path, `#rrggbb` or `"none"` |
| `screens` | object of screens; ids use `a-z 0-9 _ -` |

## Screen

| Field | |
| --- | --- |
| `title` | label shown in the editor |
| `style` | overrides the doc style for this screen |
| `background` | overrides the doc background (PNG is scaled to cover, bottom-aligned) |
| `dim` | 0..1 dark overlay over the background (pause / modal screens) |
| `widgets` | drawn in order (later = in front) |

## Widgets

Every widget has `type`, `x`, `y` (viewport pixels, top-left origin) and an optional `id` (used as the node
name in Godot scenes and in Pixi `screen.byId`).

| Type | Fields | Notes |
| --- | --- | --- |
| `panel` | `w`, `h`, `title?`, `small?` | nine-slice frame (margin 8, or 4 when `small`); `title` sits on a plate across the top edge |
| `label` | `text`, `size?`=10, `color?`, `align?` left/center/right, `w?`, `font?` body/title, `shadow?`=true | **`y` is the baseline**; `x` is the anchor for the alignment; `w` turns on Thai-aware wrapping (line height 1.35 × size) |
| `button` | `w`, `h?`=20, `text`, `state?`, `icon?` | states `normal hover pressed disabled focus`; font size = clamp(h − 9, 7, 10) |
| `menu` | `w`, `items[]`, `selected?`=0, `disabled?[]`, `itemH?`=20, `gap?`=4, `panel?`=true, `title?` | `x, y` = first item; the panel adds 18 px left/right and 10 px top/bottom (+10 with a title); the selected item gets the focus frame and the hand cursor |
| `bar` | `w`, `h?`=10, `kind` hp/mp/xp/stamina, `value`, `max`, `label?`, `showText?` | a `label` adds 22 px on the left; the fill is inset 2 px |
| `inventory` | `cols`, `rows`, `slot?`=22, `gap?`=2, `items[]`, `selected?` | `items` entries are `{icon, count?, name?}` or `null`; counts > 1 show bottom-right |
| `hotbar` | `slots`, `slot?`=22, `items[]`, `selected?`, `keys?`=true | 2 px gaps, number badges 1–9, 0 |
| `icon` | `icon`, `scale?`=1 | 16×16 × scale |
| `toggle` | `text`, `on`, `w?`, `focus?` | checkbox + label; `focus` draws the hand cursor |
| `slider` | `w`, `text`, `value` 0..1, `focus?` | label takes 42 % of `w`, the track the rest |
| `tabs` | `w`, `tabs[]`, `selected?`=0 | equal widths, 2 px gaps; the selected tab is 2 px taller |
| `tooltip` | `w`, `title`, `text`, `icon?` | small panel; height grows with the wrapped text |
| `cursor` | `kind?` hand/arrow | a pointer sprite (for mock-ups) |
| `image` | `src`, `w?`, `h?` | any workspace PNG |

## Icons

`package rice_bowl mango lantern key coin sticky_rice banana coconut fish chili lotus thai_tea letter map bell
umbrella candle garland herb medicine scroll egg broom` — `easyui icons` lists the Thai names, `--out` writes
the sheet. Unknown icons are a warning (the slot renders empty).

## Validation

* **errors** (doc unusable): wrong `format`, unknown style / widget type / bar kind / button state, missing
  or wrong-typed required fields, `slider.value` outside 0..1, bad screen ids.
* **warnings**: widget off-screen or sticking out of the viewport, unknown icon, more items than slots,
  missing background / image file.

## Layout parity

The same layout code (`src/shared/draw.ts`) drives CLI PNGs and the web editor. Godot scenes and the Pixi
helper reproduce it: Godot labels are offset by Kanit's ascent (1.1 em) so they share the baseline, menus
become `VBoxContainer`s, inventories `GridContainer`s of `PanelContainer` slots, bars `ProgressBar`s with
type variations, sliders `HSlider`s, tabs `TabBar`s (Godot sizes tabs to their text rather than equal widths).
