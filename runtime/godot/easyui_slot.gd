extends PanelContainer
## Inventory / hotbar slot (MIT © Salahuddin Benno). Click or press ui_accept to select; the grid swaps the
## theme variation between "Slot" and "SlotSelected". Emits `chosen(index)` on its parent grid.

@export var index := 0
@export var item_id := ""
@export var count := 0


func _ready() -> void:
	focus_mode = Control.FOCUS_ALL
	mouse_filter = Control.MOUSE_FILTER_STOP
	gui_input.connect(_on_input)
	focus_entered.connect(select)


func select() -> void:
	var grid := get_parent()
	if grid == null:
		return
	for c in grid.get_children():
		if c is PanelContainer:
			(c as PanelContainer).theme_type_variation = &"SlotSelected" if c == self else &"Slot"
	if grid.has_signal("chosen"):
		grid.emit_signal("chosen", index)


func _on_input(event: InputEvent) -> void:
	if (event is InputEventMouseButton and event.pressed) or event.is_action_pressed("ui_accept"):
		select()
		grab_focus()
