## Easy UI — on-screen touch controls for Godot 4.3+ (virtual stick + action buttons), original pixel art.
## Add as a child of your main scene (or autoload). It presses your InputMap actions, so the game's own
## Input.is_action_pressed / _unhandled_input code works unchanged. Multitouch; safe-area aware; landscape + portrait.
##
##   var t := preload("res://easyui/easyui_touch.gd").new()
##   t.profiles = { "map": { "stick": "8way", "buttons": [{ "id": "ok", "label": "A", "action": "ui_accept" }] } }
##   t.profile = "map"; t.mode = "auto"   # "auto" shows on touch screens only | "on" | "off"
##   add_child(t); t.set_profile("side")
## Stick modes: "8way", "4way", "horizontal", "vertical", "none". Stick actions default to ui_left/right/up/down.
## MIT License; art drawn in code (CC0).
extends CanvasLayer

@export var mode := "auto"
@export var opacity := 0.6
@export var size := 1.0
@export var deadzone := 0.3
@export var profile := ""
var profiles: Dictionary = {}
var stick_actions := { "left": "ui_left", "right": "ui_right", "up": "ui_up", "down": "ui_down" }

const INK := Color("#1a1420")
var _root: Control
var _stick_base: TextureRect
var _knob: TextureRect
var _stick_touch := -1
var _stick_held := {}
var _buttons: Array = []
var _btn_touch := {}  # touch index -> button id

static func dirs_for(dx: float, dy: float, stick_mode: String, dz: float) -> Dictionary:
	var out := { "left": false, "right": false, "up": false, "down": false }
	if stick_mode == "none" or Vector2(dx, dy).length() < dz:
		return out
	if stick_mode == "horizontal":
		if absf(dx) >= dz: out["left" if dx < 0 else "right"] = true
		return out
	if stick_mode == "vertical":
		if absf(dy) >= dz: out["up" if dy < 0 else "down"] = true
		return out
	var sectors := 4 if stick_mode == "4way" else 8
	var s := posmod(roundi(atan2(dy, dx) / (TAU / sectors)), sectors)
	var d8 := [["right"], ["right", "down"], ["down"], ["left", "down"], ["left"], ["left", "up"], ["up"], ["right", "up"]]
	for d in (d8[s * 2] if sectors == 4 else d8[s]):
		out[d] = true
	return out

static func disc_texture(px: int, face: Color, rim: Color, ring := false) -> ImageTexture:
	var img := Image.create(px, px, false, Image.FORMAT_RGBA8)
	var r := px / 2.0
	for y in px:
		for x in px:
			var dx := x + 0.5 - r
			var dy := y + 0.5 - r
			var d := sqrt(dx * dx + dy * dy)
			if d > r - 0.5: continue
			var c := face
			if d > r - 1.6: c = INK
			elif d > r - 2.8: c = rim
			elif ring and (x + y) % 2 == 0 and d > r * 0.55: c = rim
			elif dx + dy < -r * 0.55: c = Color.WHITE
			elif dx + dy > r * 0.75: c = rim
			img.set_pixel(x, y, c)
	return ImageTexture.create_from_image(img)

func _ready() -> void:
	layer = 50
	_root = Control.new()
	_root.set_anchors_preset(Control.PRESET_FULL_RECT)
	_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_root.modulate.a = opacity
	add_child(_root)
	_stick_base = _tex(disc_texture(32, Color("#2a2230"), Color("#b48a52"), true))
	_knob = _tex(disc_texture(16, Color("#f2e6c8"), Color("#b48a52")))
	_root.add_child(_stick_base)
	_root.add_child(_knob)
	_build_buttons()
	get_viewport().size_changed.connect(_layout)
	set_mode(mode)

func _tex(t: Texture2D) -> TextureRect:
	var r := TextureRect.new()
	r.texture = t
	r.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	r.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return r

func _current() -> Dictionary:
	return profiles.get(profile, { "stick": "none", "buttons": [] })

func set_mode(m: String) -> void:
	mode = m
	visible = m == "on" or (m == "auto" and DisplayServer.is_touchscreen_available())
	if not visible: release_all()
	_layout()

func set_profile(name: String) -> void:
	if name == profile: return
	release_all()
	profile = name
	_build_buttons()

func _build_buttons() -> void:
	for b in _buttons: b.queue_free()
	_buttons.clear()
	var i := 0
	for spec in _current().get("buttons", []):
		var tb := TouchScreenButton.new()
		tb.texture_normal = disc_texture(20, Color("#e8a33a") if i == 0 else Color("#f2e6c8"), Color("#b48a52"))
		tb.action = spec.get("action", "")
		tb.passby_press = false
		tb.visibility_mode = TouchScreenButton.VISIBILITY_ALWAYS
		var lbl := Label.new()
		lbl.text = str(spec.get("label", spec.get("id", "")))
		lbl.add_theme_color_override("font_color", INK)
		tb.add_child(lbl)
		tb.set_meta("id", spec.get("id", ""))
		_root.add_child(tb)
		_buttons.append(tb)
		i += 1
	_stick_base.visible = _current().get("stick", "none") != "none"
	_knob.visible = _stick_base.visible
	_layout()

func _layout() -> void:
	if not is_inside_tree() or _root == null: return
	var vs := get_viewport().get_visible_rect().size
	var safe := Rect2(DisplayServer.get_display_safe_area())
	var win := Vector2(DisplayServer.window_get_size())
	var k := vs / win if win.x > 0 and win.y > 0 else Vector2.ONE
	var inset_l := safe.position.x * k.x
	var inset_b := (win.y - safe.end.y) * k.y if safe.size.y > 0 else 0.0
	var inset_r := (win.x - safe.end.x) * k.x if safe.size.x > 0 else 0.0
	var unit: float = clampf(minf(vs.x, vs.y) * 0.12, 24.0, 72.0) * size
	var r := unit * 1.15
	var pad := unit * 0.35
	var cy := vs.y - inset_b - pad - r
	_stick_base.position = Vector2(inset_l + pad, cy - r)
	_stick_base.size = Vector2(r * 2, r * 2)
	_knob.size = Vector2(r * 0.9, r * 0.9)
	_knob.position = _stick_base.position + Vector2(r, r) - _knob.size / 2
	var slots := [Vector2(0, 0), Vector2(-1.25, 0.55), Vector2(-0.35, -1.2), Vector2(-1.6, -0.75), Vector2(-2.5, 0.2), Vector2(-0.9, -2.3)]
	var cx := vs.x - inset_r - pad - unit / 2
	for i in _buttons.size():
		var s: Vector2 = slots[i] if i < slots.size() else Vector2(-2.5 - (i - 3) * 1.25, 0.2)
		var tb: TouchScreenButton = _buttons[i]
		tb.scale = Vector2.ONE * (unit / 20.0)
		tb.position = Vector2(cx + s.x * unit, cy + unit * 0.3 + s.y * unit) - Vector2(unit, unit) / 2

func _input(event: InputEvent) -> void:
	if not visible or not _stick_base.visible: return
	if event is InputEventScreenTouch:
		var rect := Rect2(_stick_base.position, _stick_base.size).grow(_stick_base.size.x * 0.3)
		if event.pressed and _stick_touch == -1 and rect.has_point(event.position):
			_stick_touch = event.index
			_move_stick(event.position)
		elif not event.pressed and event.index == _stick_touch:
			_stick_touch = -1
			_set_dirs(dirs_for(0, 0, "none", deadzone))
			_knob.position = _stick_base.position + _stick_base.size / 2 - _knob.size / 2
	elif event is InputEventScreenDrag and event.index == _stick_touch:
		_move_stick(event.position)

func _move_stick(p: Vector2) -> void:
	var r := _stick_base.size.x / 2
	var c := _stick_base.position + Vector2(r, r)
	var v := (p - c) / r
	if v.length() > 1: v = v.normalized()
	_knob.position = c + v * r * 0.55 - _knob.size / 2
	_set_dirs(dirs_for(v.x, v.y, _current().get("stick", "8way"), deadzone))

func _set_dirs(d: Dictionary) -> void:
	for dir in d:
		var act: String = stick_actions[dir]
		if not InputMap.has_action(act): continue
		if d[dir] and not _stick_held.get(dir, false): Input.action_press(act)
		elif not d[dir] and _stick_held.get(dir, false): Input.action_release(act)
		_stick_held[dir] = d[dir]

func release_all() -> void:
	_stick_touch = -1
	for dir in stick_actions: _stick_held[dir] = true
	_set_dirs({ "left": false, "right": false, "up": false, "down": false })
	for b in _buttons:
		if b.action != "" and InputMap.has_action(b.action): Input.action_release(b.action)
