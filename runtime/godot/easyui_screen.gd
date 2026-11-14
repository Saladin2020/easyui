extends Control
## Easy UI screen root (MIT © Salahuddin Benno).
## Generated scenes use it to focus the first control, cycle demo screens with Tab / Shift+Tab, and close
## the pause / settings / inventory screens with Esc. Every widget is a plain Godot Control that reads its
## look from the exported Theme, so you can delete this script and keep the scene.

signal screen_requested(path: String)

## Control focused when the screen opens (menu item, button, slider…).
@export var initial_focus: NodePath
## Hand cursor that follows the focused control (like the PNG renders). Optional.
@export var focus_hand: NodePath
## Demo navigation (Tab / Shift+Tab). Leave empty in your game.
@export_file("*.tscn") var next_scene := ""
@export_file("*.tscn") var prev_scene := ""
## Scene opened by Esc / ui_cancel (empty = none).
@export_file("*.tscn") var back_scene := ""


func _ready() -> void:
	if not initial_focus.is_empty():
		var n := get_node_or_null(initial_focus)
		if n is Control and (n as Control).focus_mode != Control.FOCUS_NONE:
			(n as Control).grab_focus.call_deferred()


func _process(_delta: float) -> void:
	var hand := get_node_or_null(focus_hand) as Control
	if hand == null:
		return
	var f := get_viewport().gui_get_focus_owner()
	var show := f != null and is_ancestor_of(f) and (f is BaseButton or f is Range) and not (f is TabBar)
	hand.visible = show
	if show:
		var at: Vector2 = f.global_position - global_position
		hand.position = Vector2(at.x - 13.0, at.y + roundf((f.size.y - hand.size.y) / 2.0))


func go(path: String) -> void:
	if path.is_empty():
		return
	screen_requested.emit(path)
	get_tree().change_scene_to_file(path)


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		var k := event as InputEventKey
		if k.keycode == KEY_TAB:
			go(prev_scene if k.shift_pressed else next_scene)
			get_viewport().set_input_as_handled()
		elif k.keycode == KEY_ESCAPE and not back_scene.is_empty():
			go(back_scene)
			get_viewport().set_input_as_handled()
