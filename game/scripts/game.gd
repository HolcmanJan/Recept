extends Node3D

# Main orchestrator: builds the 20x20 m arena, spawns the player, enemy, weapons,
# hooks up damage events from weapon blades / fists into the combatants.

const PlayerScript := preload("res://scripts/player.gd")
const EnemyScript := preload("res://scripts/enemy.gd")
const WeaponScript := preload("res://scripts/weapon.gd")
const HudScript := preload("res://scripts/hud.gd")
const BodyPartScript := preload("res://scripts/body_part.gd")
const FighterScript := preload("res://scripts/fighter.gd")

const ARENA_SIZE: float = 20.0

var player: Fighter
var enemy: Fighter
var hud: Hud
var weapons: Array = []
var fighters: Array = []

func _ready() -> void:
	randomize()
	_build_environment()
	_build_arena()
	_spawn_weapons()
	_spawn_fighters()
	_build_hud()

func _build_environment() -> void:
	var env := WorldEnvironment.new()
	var e := Environment.new()
	e.background_mode = Environment.BG_SKY
	var sky := Sky.new()
	var proc := ProceduralSkyMaterial.new()
	proc.sky_top_color = Color(0.4, 0.55, 0.75)
	proc.sky_horizon_color = Color(0.65, 0.7, 0.75)
	proc.ground_bottom_color = Color(0.2, 0.22, 0.25)
	proc.ground_horizon_color = Color(0.55, 0.55, 0.55)
	sky.sky_material = proc
	e.sky = sky
	e.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	e.ambient_light_energy = 0.6
	env.environment = e
	add_child(env)

	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-55, 35, 0)
	sun.light_energy = 1.2
	sun.shadow_enabled = true
	add_child(sun)

func _build_arena() -> void:
	var floor_body := StaticBody3D.new()
	floor_body.collision_layer = 1  # world
	floor_body.collision_mask = 0
	add_child(floor_body)

	var floor_mesh := MeshInstance3D.new()
	var pm := PlaneMesh.new()
	pm.size = Vector2(ARENA_SIZE, ARENA_SIZE)
	floor_mesh.mesh = pm
	var fm := StandardMaterial3D.new()
	fm.albedo_color = Color(0.55, 0.5, 0.4)
	fm.roughness = 0.95
	floor_mesh.material_override = fm
	floor_body.add_child(floor_mesh)

	var floor_coll := CollisionShape3D.new()
	var fsh := BoxShape3D.new()
	fsh.size = Vector3(ARENA_SIZE, 0.2, ARENA_SIZE)
	floor_coll.shape = fsh
	floor_coll.position = Vector3(0, -0.1, 0)
	floor_body.add_child(floor_coll)

	# Railing around the arena
	var half: float = ARENA_SIZE * 0.5
	_build_rail(Vector3(0, 0, -half), Vector3(ARENA_SIZE, 1.0, 0.1))
	_build_rail(Vector3(0, 0,  half), Vector3(ARENA_SIZE, 1.0, 0.1))
	_build_rail(Vector3(-half, 0, 0), Vector3(0.1, 1.0, ARENA_SIZE))
	_build_rail(Vector3( half, 0, 0), Vector3(0.1, 1.0, ARENA_SIZE))

func _build_rail(center: Vector3, size: Vector3) -> void:
	var body := StaticBody3D.new()
	body.collision_layer = 1
	body.collision_mask = 0
	body.position = center + Vector3(0, size.y * 0.5, 0)
	add_child(body)

	var cs := CollisionShape3D.new()
	var sh := BoxShape3D.new(); sh.size = size
	cs.shape = sh
	body.add_child(cs)

	# Visual: a top rail bar
	var top := MeshInstance3D.new()
	var tm := BoxMesh.new(); tm.size = Vector3(size.x, 0.08, size.z) if size.x > size.z else Vector3(size.x, 0.08, size.z)
	top.mesh = tm
	top.position = Vector3(0, size.y * 0.45, 0)
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.3, 0.25, 0.2)
	mat.metallic = 0.2; mat.roughness = 0.7
	top.material_override = mat
	body.add_child(top)

	# Posts
	var posts := 6
	var along: Vector3 = Vector3(size.x, 0, size.z)
	var long_axis: bool = size.x >= size.z
	for i in range(posts + 1):
		var t: float = float(i) / float(posts)
		var post := MeshInstance3D.new()
		var pmesh := BoxMesh.new(); pmesh.size = Vector3(0.08, size.y, 0.08)
		post.mesh = pmesh
		var local_x: float = lerp(-size.x * 0.5, size.x * 0.5, t) if long_axis else 0.0
		var local_z: float = 0.0 if long_axis else lerp(-size.z * 0.5, size.z * 0.5, t)
		post.position = Vector3(local_x, 0.0, local_z)
		post.material_override = mat
		body.add_child(post)

func _spawn_weapons() -> void:
	var types := [
		WeaponScript.Type.SWORD,
		WeaponScript.Type.SPEAR,
		WeaponScript.Type.MACE,
		WeaponScript.Type.AXE,
		WeaponScript.Type.PITCHFORK,
		WeaponScript.Type.SCYTHE,
		WeaponScript.Type.TWO_HAND_SWORD,
		WeaponScript.Type.DAGGER,
		WeaponScript.Type.HALBERD,
	]
	var half: float = ARENA_SIZE * 0.5 - 1.5
	for t in types:
		var w: Weapon = WeaponScript.build(t)
		add_child(w)
		var pos := Vector3(randf_range(-half, half), 0.05, randf_range(-half, half))
		w.place_on_ground(pos, randf() * TAU)
		# Hit detection: blade overlapping a body part triggers damage.
		w.blade.area_entered.connect(_on_blade_hit.bind(w))
		weapons.append(w)

func _spawn_fighters() -> void:
	player = PlayerScript.new()
	player.name = "Player"
	player.position = Vector3(-4, 1.0, -4)
	add_child(player)
	player.world_weapons = weapons
	_register_fighter(player)

	enemy = EnemyScript.new()
	enemy.name = "Enemy"
	enemy.position = Vector3(4, 1.0, 4)
	add_child(enemy)
	enemy.world_weapons = weapons
	_register_fighter(enemy)

	enemy.target = player

func _register_fighter(f: Fighter) -> void:
	fighters.append(f)
	# Fist hitboxes → damage events
	f.fist_area_l.area_entered.connect(_on_fist_hit.bind(f))
	f.fist_area_r.area_entered.connect(_on_fist_hit.bind(f))

func _build_hud() -> void:
	hud = HudScript.new()
	add_child(hud)
	hud.setup(player, enemy)

func _on_blade_hit(area: Area3D, w: Weapon) -> void:
	if w.holder == null: return
	if not (area is BodyPart): return
	var part: BodyPart = area
	if part.fighter == w.holder: return  # don't hit self
	var attacker: Fighter = w.holder
	var victim: Fighter = part.fighter
	victim.receive_hit(attacker, part, w, attacker.state)

func _on_fist_hit(area: Area3D, attacker: Fighter) -> void:
	if not (area is BodyPart): return
	var part: BodyPart = area
	if part.fighter == attacker: return
	var victim: Fighter = part.fighter
	victim.receive_hit(attacker, part, null, attacker.state)

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and event.keycode == KEY_R:
		get_tree().reload_current_scene()
