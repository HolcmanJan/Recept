extends CanvasLayer
class_name Hud

const BodyPartScript := preload("res://scripts/body_part.gd")

var player: Fighter
var enemy: Fighter

var root: Control
var player_bar: ProgressBar
var enemy_bar: ProgressBar
var status_label: Label
var weapon_label: Label
var hint_label: Label
var endgame_label: Label

func setup(p: Fighter, e: Fighter) -> void:
	player = p
	enemy = e
	_build()

func _build() -> void:
	root = Control.new()
	root.anchor_right = 1.0
	root.anchor_bottom = 1.0
	add_child(root)

	player_bar = _mk_bar(Vector2(20, 20), Color(0.2, 0.9, 0.3))
	root.add_child(player_bar)
	var pl := Label.new(); pl.text = "JA"; pl.position = Vector2(20, 4)
	root.add_child(pl)

	enemy_bar = _mk_bar(Vector2(20, 60), Color(0.9, 0.3, 0.25))
	root.add_child(enemy_bar)
	var el := Label.new(); el.text = "NEPRITEL"; el.position = Vector2(20, 44)
	root.add_child(el)

	status_label = Label.new()
	status_label.position = Vector2(20, 90)
	status_label.add_theme_color_override("font_color", Color(1, 0.9, 0.7))
	root.add_child(status_label)

	weapon_label = Label.new()
	weapon_label.position = Vector2(20, 120)
	weapon_label.add_theme_color_override("font_color", Color(0.9, 0.95, 1.0))
	root.add_child(weapon_label)

	hint_label = Label.new()
	hint_label.position = Vector2(20, 160)
	hint_label.add_theme_color_override("font_color", Color(0.85, 0.85, 0.85))
	hint_label.text = "WASD pohyb  |  mys = kamera  |  E seber zbran  |  Q odhod\n" + \
		"LMB = sek / lleva pest  |  Alt+LMB = bodnuti  |  RMB = prava pest\n" + \
		"Ctrl = blok  |  Esc = uvolnit mys  |  R = restart"
	root.add_child(hint_label)

	endgame_label = Label.new()
	endgame_label.anchor_left = 0.5
	endgame_label.anchor_top = 0.5
	endgame_label.position = Vector2(-220, -40)
	endgame_label.size = Vector2(440, 80)
	endgame_label.add_theme_font_size_override("font_size", 36)
	endgame_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	endgame_label.visible = false
	root.add_child(endgame_label)

func _mk_bar(pos: Vector2, color: Color) -> ProgressBar:
	var bar := ProgressBar.new()
	bar.position = pos
	bar.size = Vector2(240, 20)
	bar.min_value = 0; bar.max_value = 100
	bar.value = 100
	var sb := StyleBoxFlat.new()
	sb.bg_color = color
	bar.add_theme_stylebox_override("fill", sb)
	return bar

func _process(_delta: float) -> void:
	if player == null or enemy == null: return
	var p_torso: BodyPart = player.parts[BodyPartScript.Kind.TORSO]
	var p_head: BodyPart = player.parts[BodyPartScript.Kind.HEAD]
	var e_torso: BodyPart = enemy.parts[BodyPartScript.Kind.TORSO]
	var e_head: BodyPart = enemy.parts[BodyPartScript.Kind.HEAD]

	var p_hp := int((p_torso.hp + p_head.hp) * 0.5)
	var e_hp := int((e_torso.hp + e_head.hp) * 0.5)
	player_bar.value = clamp(p_hp, 0, 100)
	enemy_bar.value = clamp(e_hp, 0, 100)

	var status: String = ""
	if player.bleed_rate > 0.0:
		status += "Krvacis (%0.0f/s)  " % player.bleed_rate
	for k in player.parts.keys():
		var part: BodyPart = player.parts[k]
		if part.severed:
			status += "USEKNUTO: %s  " % _kind_name(k)
	status_label.text = status

	if player.equipped:
		var s: Dictionary = Weapon.stats_for(player.equipped.type)
		weapon_label.text = "Zbran: %s  (sek %0.0f / bod %0.0f / uder %0.0f)" % [s["name"], s["slash"], s["pierce"], s["blunt"]]
	else:
		weapon_label.text = "Zbran: zadna (pesti)"

	# End game states
	if player.is_dead and not endgame_label.visible:
		endgame_label.text = "PROHRA — stisknete R"
		endgame_label.add_theme_color_override("font_color", Color(1, 0.4, 0.4))
		endgame_label.visible = true
	elif enemy.is_dead and not endgame_label.visible:
		endgame_label.text = "VITEZSTVI — stisknete R"
		endgame_label.add_theme_color_override("font_color", Color(0.4, 1, 0.6))
		endgame_label.visible = true

func _kind_name(k: int) -> String:
	match k:
		BodyPartScript.Kind.HEAD: return "hlava"
		BodyPartScript.Kind.TORSO: return "trup"
		BodyPartScript.Kind.LEFT_ARM: return "l.ruka"
		BodyPartScript.Kind.RIGHT_ARM: return "p.ruka"
		BodyPartScript.Kind.LEFT_LEG: return "l.noha"
		BodyPartScript.Kind.RIGHT_LEG: return "p.noha"
		_: return "?"
