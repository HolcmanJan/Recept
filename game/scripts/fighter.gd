extends CharacterBody3D
class_name Fighter

# Base class for Player and Enemy. Builds a humanoid body from primitives,
# handles movement, attacks (swing / stab / punch / block), damage and death.

const BodyPartScript := preload("res://scripts/body_part.gd")
const WeaponScript := preload("res://scripts/weapon.gd")

signal died(fighter)
signal hit_received(fighter, part_kind, damage)

enum State { IDLE, SWING, STAB, PUNCH_L, PUNCH_R, BLOCK, STAGGER, DEAD }

@export var move_speed: float = 4.5
@export var body_color: Color = Color(0.85, 0.75, 0.65)

# Attack timing (windup / active / recover in seconds)
const TIMINGS := {
	State.SWING:   {"windup": 0.18, "active": 0.22, "recover": 0.30},
	State.STAB:    {"windup": 0.22, "active": 0.18, "recover": 0.35},
	State.PUNCH_L: {"windup": 0.08, "active": 0.10, "recover": 0.20},
	State.PUNCH_R: {"windup": 0.08, "active": 0.10, "recover": 0.20},
	State.STAGGER: {"windup": 0.0, "active": 0.0, "recover": 0.40},
}

# Runtime state machine
var state: int = State.IDLE
var state_t: float = 0.0
var state_windup: float = 0.0
var state_active: float = 0.0
var state_recover: float = 0.0

# Movement input (set by Player/Enemy each frame; in world XZ plane)
var move_dir: Vector3 = Vector3.ZERO
var facing_yaw: float = 0.0     # rotation around Y in radians
var want_block: bool = false

# Body / visuals
var body_root: Node3D           # rotates with facing_yaw
var right_hand: Node3D          # weapon attach point
var left_hand: Node3D
var right_arm_pivot: Node3D
var left_arm_pivot: Node3D
var torso_mesh: MeshInstance3D
var head_mesh: MeshInstance3D

var parts: Dictionary = {}       # BodyPart.Kind -> BodyPart
var part_visuals: Dictionary = {} # BodyPart.Kind -> Node3D (the visual group for limbs, to hide on sever)

# Combat
var equipped: Weapon = null
var fist_area_l: Area3D
var fist_area_r: Area3D
var hit_registry: Dictionary = {}  # to avoid multi-hits per attack

# HP / bleeding
var bleed_rate: float = 0.0      # hp/sec
var total_bleed: float = 0.0
const BLEED_OUT: float = 100.0
var is_dead: bool = false
var decapitated: bool = false
var stagger_factor: float = 1.0

# Layer constants (must match project)
const LAYER_WORLD := 1 << 0
const LAYER_PLAYER := 1 << 1
const LAYER_ENEMY := 1 << 2
const LAYER_WEAPON := 1 << 3
const LAYER_PICKUP := 1 << 4
const LAYER_BODY := 1 << 5

func _ready() -> void:
	_build_collision()
	_build_body()
	_build_fists()

func _build_collision() -> void:
	# A single capsule for body movement collision with world + other fighters.
	var cs := CollisionShape3D.new()
	var cap := CapsuleShape3D.new()
	cap.radius = 0.32
	cap.height = 1.75
	cs.shape = cap
	cs.position = Vector3(0, 0.875, 0)
	add_child(cs)

# --- Body construction ---------------------------------------------------

func _build_body() -> void:
	body_root = Node3D.new()
	body_root.name = "Body"
	add_child(body_root)

	var skin := StandardMaterial3D.new()
	skin.albedo_color = body_color
	skin.roughness = 0.85

	# Torso (box) with its BodyPart hitbox
	var torso_group := Node3D.new()
	torso_group.name = "TorsoGroup"
	body_root.add_child(torso_group)
	torso_group.position = Vector3(0, 1.05, 0)

	torso_mesh = MeshInstance3D.new()
	var tm := BoxMesh.new(); tm.size = Vector3(0.55, 0.7, 0.3)
	torso_mesh.mesh = tm
	torso_mesh.material_override = skin
	torso_group.add_child(torso_mesh)

	var torso_part := _make_part(BodyPartScript.Kind.TORSO, 120.0, Vector3(0.55, 0.7, 0.3), Vector3.ZERO)
	torso_group.add_child(torso_part)
	parts[BodyPartScript.Kind.TORSO] = torso_part
	part_visuals[BodyPartScript.Kind.TORSO] = torso_group

	# Head
	var head_group := Node3D.new()
	head_group.name = "HeadGroup"
	body_root.add_child(head_group)
	head_group.position = Vector3(0, 1.62, 0)

	head_mesh = MeshInstance3D.new()
	var hm := SphereMesh.new(); hm.radius = 0.14; hm.height = 0.28
	head_mesh.mesh = hm
	head_mesh.material_override = skin
	head_group.add_child(head_mesh)

	var head_part := _make_part(BodyPartScript.Kind.HEAD, 60.0, Vector3(0.3, 0.3, 0.3), Vector3.ZERO)
	head_group.add_child(head_part)
	parts[BodyPartScript.Kind.HEAD] = head_part
	part_visuals[BodyPartScript.Kind.HEAD] = head_group

	# Arms: pivot at shoulder, arm capsule hangs down, hand socket at end.
	right_arm_pivot = _build_arm(true, skin)
	left_arm_pivot = _build_arm(false, skin)

	# Legs
	_build_leg(true, skin)
	_build_leg(false, skin)

func _build_arm(is_right: bool, skin: Material) -> Node3D:
	var pivot := Node3D.new()
	pivot.name = "RightArmPivot" if is_right else "LeftArmPivot"
	var shoulder_x: float = 0.32 if is_right else -0.32
	pivot.position = Vector3(shoulder_x, 1.4, 0)
	body_root.add_child(pivot)

	var arm_len := 0.7
	var arm_mesh := MeshInstance3D.new()
	var cm := CapsuleMesh.new(); cm.radius = 0.08; cm.height = arm_len
	arm_mesh.mesh = cm
	arm_mesh.material_override = skin
	arm_mesh.position = Vector3(0, -arm_len * 0.5, 0)
	pivot.add_child(arm_mesh)

	var kind: int = BodyPartScript.Kind.RIGHT_ARM if is_right else BodyPartScript.Kind.LEFT_ARM
	var arm_part := _make_part(kind, 40.0, Vector3(0.2, arm_len, 0.2), Vector3(0, -arm_len * 0.5, 0))
	pivot.add_child(arm_part)
	parts[kind] = arm_part
	part_visuals[kind] = pivot

	# Hand socket at the bottom
	var hand := Node3D.new()
	hand.name = "RightHand" if is_right else "LeftHand"
	hand.position = Vector3(0, -arm_len, 0)
	pivot.add_child(hand)
	if is_right:
		right_hand = hand
	else:
		left_hand = hand

	var hand_kind: int = BodyPartScript.Kind.RIGHT_HAND if is_right else BodyPartScript.Kind.LEFT_HAND
	var hand_part := _make_part(hand_kind, 25.0, Vector3(0.15, 0.15, 0.15), Vector3.ZERO)
	hand.add_child(hand_part)
	parts[hand_kind] = hand_part

	return pivot

func _build_leg(is_right: bool, skin: Material) -> void:
	var leg_pivot := Node3D.new()
	leg_pivot.name = "RightLeg" if is_right else "LeftLeg"
	var x: float = 0.15 if is_right else -0.15
	leg_pivot.position = Vector3(x, 0.9, 0)
	body_root.add_child(leg_pivot)

	var leg_len := 0.85
	var leg_mesh := MeshInstance3D.new()
	var cm := CapsuleMesh.new(); cm.radius = 0.1; cm.height = leg_len
	leg_mesh.mesh = cm
	leg_mesh.material_override = skin
	leg_mesh.position = Vector3(0, -leg_len * 0.5, 0)
	leg_pivot.add_child(leg_mesh)

	var kind: int = BodyPartScript.Kind.RIGHT_LEG if is_right else BodyPartScript.Kind.LEFT_LEG
	var leg_part := _make_part(kind, 50.0, Vector3(0.22, leg_len, 0.22), Vector3(0, -leg_len * 0.5, 0))
	leg_pivot.add_child(leg_part)
	parts[kind] = leg_part
	part_visuals[kind] = leg_pivot

func _make_part(kind: int, max_hp: float, box_size: Vector3, local_pos: Vector3) -> Area3D:
	var area := Area3D.new()
	area.set_script(BodyPartScript)
	area.kind = kind
	area.max_hp = max_hp
	area.fighter = self
	area.collision_layer = LAYER_BODY
	area.collision_mask = 0
	area.monitorable = true
	area.monitoring = false
	var cs := CollisionShape3D.new()
	var shp := BoxShape3D.new()
	shp.size = box_size
	cs.shape = shp
	cs.position = local_pos
	area.add_child(cs)
	return area

func _build_fists() -> void:
	fist_area_l = _make_fist_area()
	left_hand.add_child(fist_area_l)
	fist_area_r = _make_fist_area()
	right_hand.add_child(fist_area_r)

func _make_fist_area() -> Area3D:
	var a := Area3D.new()
	a.collision_layer = 0
	a.collision_mask = LAYER_BODY
	a.monitoring = false
	a.monitorable = false
	var cs := CollisionShape3D.new()
	var sh := SphereShape3D.new(); sh.radius = 0.18
	cs.shape = sh
	a.add_child(cs)
	return a

# --- Main loop -----------------------------------------------------------

func _physics_process(delta: float) -> void:
	if is_dead:
		# Let the ragdoll-lite fall over: just keep gravity applied.
		velocity.y -= 20.0 * delta
		move_and_slide()
		return

	_apply_bleeding(delta)
	_apply_movement(delta)
	_tick_state(delta)

func _apply_bleeding(delta: float) -> void:
	if bleed_rate > 0.0:
		var amt := bleed_rate * delta
		total_bleed += amt
		# bleeding damages torso HP
		var torso: BodyPart = parts[BodyPartScript.Kind.TORSO]
		torso.take_damage(amt * 0.5)
		if total_bleed >= BLEED_OUT or torso.hp <= 0.0:
			_die("vykrvaceni")

func _apply_movement(delta: float) -> void:
	# Slow down when heavily wounded.
	var speed := move_speed * stagger_factor
	if state in [State.SWING, State.STAB]:
		speed *= 0.4
	elif state == State.BLOCK or want_block:
		speed *= 0.6

	var horiz := Vector3(move_dir.x, 0, move_dir.z)
	if horiz.length() > 0.01:
		horiz = horiz.normalized() * speed
	velocity.x = horiz.x
	velocity.z = horiz.z

	if not is_on_floor():
		velocity.y -= 20.0 * delta
	else:
		velocity.y = -0.5  # pushed down to stay grounded

	# Turn body toward facing_yaw smoothly
	var cur: float = body_root.rotation.y
	var target: float = facing_yaw
	body_root.rotation.y = lerp_angle(cur, target, clamp(delta * 12.0, 0.0, 1.0))

	move_and_slide()

func _tick_state(delta: float) -> void:
	if state == State.IDLE or state == State.BLOCK:
		# Block state is just a flag; re-evaluated from want_block
		state = State.BLOCK if want_block else State.IDLE
		_pose_idle()
		return

	state_t += delta
	match state:
		State.SWING: _update_swing()
		State.STAB:  _update_stab()
		State.PUNCH_L: _update_punch(false)
		State.PUNCH_R: _update_punch(true)
		State.STAGGER: pass

	var total := state_windup + state_active + state_recover
	if state_t >= total:
		_end_attack()

# --- Attacks -------------------------------------------------------------

func can_start_attack() -> bool:
	return not is_dead and state == State.IDLE

func start_swing() -> void:
	if not can_start_attack(): return
	_begin_state(State.SWING)
	hit_registry.clear()

func start_stab() -> void:
	if not can_start_attack(): return
	_begin_state(State.STAB)
	hit_registry.clear()

func start_punch_left() -> void:
	if not can_start_attack(): return
	if parts[BodyPartScript.Kind.LEFT_ARM].severed: return
	_begin_state(State.PUNCH_L)
	hit_registry.clear()

func start_punch_right() -> void:
	if not can_start_attack(): return
	if parts[BodyPartScript.Kind.RIGHT_ARM].severed: return
	_begin_state(State.PUNCH_R)
	hit_registry.clear()

func _begin_state(s: int) -> void:
	state = s
	state_t = 0.0
	var t: Dictionary = TIMINGS[s]
	state_windup = t["windup"]
	state_active = t["active"]
	state_recover = t["recover"]

func _end_attack() -> void:
	state = State.IDLE
	state_t = 0.0
	if equipped:
		equipped.end_swing()
	fist_area_l.monitoring = false
	fist_area_r.monitoring = false
	# Reset arm poses (handled by _pose_idle in the next tick)

func _update_swing() -> void:
	# Horizontal arc on the right arm.
	# windup: arm pulled back; active: swing across; recover: arm returns.
	var windup_t: float = clamp(state_t / max(state_windup, 0.001), 0.0, 1.0)
	var active_end: float = state_windup + state_active
	var recover_end: float = active_end + state_recover

	if state_t < state_windup:
		# pull back: rotate arm outward (positive Y on pivot yaws around spine)
		right_arm_pivot.rotation = Vector3(-0.3, 1.2 * windup_t, -0.8 * windup_t)
	elif state_t < active_end:
		if equipped:
			if not equipped.blade.monitoring:
				equipped.begin_swing()
		else:
			# swinging right arm as heavy punch? We route swing-without-weapon to right punch instead.
			pass
		var a: float = (state_t - state_windup) / max(state_active, 0.001)
		right_arm_pivot.rotation = Vector3(-0.3, lerp(1.2, -1.2, a), lerp(-0.8, -0.2, a))
	else:
		var a: float = (state_t - active_end) / max(state_recover, 0.001)
		if equipped and equipped.blade.monitoring:
			equipped.end_swing()
		right_arm_pivot.rotation = Vector3(lerp(-0.3, 0.0, a), lerp(-1.2, 0.0, a), lerp(-0.2, 0.0, a))

func _update_stab() -> void:
	var active_end: float = state_windup + state_active
	if state_t < state_windup:
		var a: float = state_t / max(state_windup, 0.001)
		right_arm_pivot.rotation = Vector3(lerp(0.0, -1.0, a), lerp(0.0, 0.6, a), 0)
	elif state_t < active_end:
		if equipped and not equipped.blade.monitoring:
			equipped.begin_swing()
		var a: float = (state_t - state_windup) / max(state_active, 0.001)
		right_arm_pivot.rotation = Vector3(lerp(-1.0, -0.1, a), lerp(0.6, 0.0, a), 0)
	else:
		if equipped and equipped.blade.monitoring:
			equipped.end_swing()
		var a: float = (state_t - active_end) / max(state_recover, 0.001)
		right_arm_pivot.rotation = Vector3(lerp(-0.1, 0.0, a), 0, 0)

func _update_punch(is_right: bool) -> void:
	var pivot: Node3D = right_arm_pivot if is_right else left_arm_pivot
	var area: Area3D = fist_area_r if is_right else fist_area_l
	var active_end: float = state_windup + state_active
	if state_t < state_windup:
		var a: float = state_t / max(state_windup, 0.001)
		pivot.rotation = Vector3(lerp(0.0, -1.2, a), 0, 0)
	elif state_t < active_end:
		area.monitoring = true
		var a: float = (state_t - state_windup) / max(state_active, 0.001)
		pivot.rotation = Vector3(lerp(-1.2, -0.2, a), 0, 0)
	else:
		area.monitoring = false
		var a: float = (state_t - active_end) / max(state_recover, 0.001)
		pivot.rotation = Vector3(lerp(-0.2, 0.0, a), 0, 0)

func _pose_idle() -> void:
	var target_r := Vector3(0, 0, -0.05)
	var target_l := Vector3(0, 0,  0.05)
	if want_block:
		target_r = Vector3(-1.2, 0.4, -0.3)
		target_l = Vector3(-1.2, -0.4, 0.3)
	right_arm_pivot.rotation = right_arm_pivot.rotation.lerp(target_r, 0.25)
	left_arm_pivot.rotation = left_arm_pivot.rotation.lerp(target_l, 0.25)

# --- Weapon management ---------------------------------------------------

func equip(w: Weapon) -> void:
	if equipped != null:
		drop_equipped()
	equipped = w
	w.holder = self
	w.attach_to_hand(right_hand)

func drop_equipped() -> void:
	if equipped == null: return
	var w := equipped
	var world := get_tree().current_scene
	var global_pos: Vector3 = right_hand.global_position
	var yaw: float = body_root.rotation.y
	if w.get_parent():
		w.get_parent().remove_child(w)
	world.add_child(w)
	w.place_on_ground(global_pos, yaw)
	equipped = null

func try_pickup_nearby(weapons: Array) -> bool:
	if equipped != null: return false
	if parts[BodyPartScript.Kind.RIGHT_HAND].severed: return false
	var my_pos := global_position
	var best: Weapon = null
	var best_d := 1.4  # reach for pickup
	for w_any in weapons:
		var w: Weapon = w_any
		if w.state != WeaponScript.State.GROUND: continue
		var d := my_pos.distance_to(w.global_position)
		if d < best_d:
			best_d = d
			best = w
	if best == null: return false
	equip(best)
	return true

# --- Damage --------------------------------------------------------------

# Called externally (by Game) when a weapon blade overlaps one of our body parts.
# attacker_weapon may be null for fist strikes; attack_kind is the attacker's current state.
func receive_hit(attacker: Fighter, part: BodyPart, attacker_weapon: Weapon, attacker_state: int) -> void:
	if is_dead: return
	if part.severed: return
	# Prevent multi-hits of the same part during one attack
	var reg_key: String = "%d_%d" % [attacker.get_instance_id(), part.kind]
	if attacker.hit_registry.has(reg_key): return
	attacker.hit_registry[reg_key] = true

	var dmg_type := "blunt"
	var base := 8.0
	var sever_pow := 0.0
	match attacker_state:
		State.SWING:
			if attacker_weapon:
				if attacker_weapon.slash_dmg > attacker_weapon.blunt_dmg:
					dmg_type = "slash"; base = attacker_weapon.slash_dmg
				else:
					dmg_type = "blunt"; base = attacker_weapon.blunt_dmg
				sever_pow = attacker_weapon.sever_power
			else:
				base = 10.0
		State.STAB:
			if attacker_weapon:
				dmg_type = "pierce"; base = attacker_weapon.pierce_dmg
			else:
				dmg_type = "blunt"; base = 8.0
		State.PUNCH_L, State.PUNCH_R:
			dmg_type = "blunt"; base = 9.0

	# Block reduces damage
	var mult := 1.0
	if state == State.BLOCK:
		# Blocked if attacker is in front arc
		var to_attacker: Vector3 = (attacker.global_position - global_position).normalized()
		var my_forward := Vector3(sin(body_root.rotation.y), 0, cos(body_root.rotation.y))
		if my_forward.dot(to_attacker) > 0.3:
			mult = 0.2

	var dmg: float = base * mult
	part.take_damage(dmg)
	emit_signal("hit_received", self, part.kind, dmg)

	# Effects by part + dmg_type
	var kind_head: bool = part.kind == BodyPartScript.Kind.HEAD
	var kind_torso: bool = part.kind == BodyPartScript.Kind.TORSO
	var is_limb: bool = part.kind in [BodyPartScript.Kind.LEFT_ARM, BodyPartScript.Kind.RIGHT_ARM, BodyPartScript.Kind.LEFT_LEG, BodyPartScript.Kind.RIGHT_LEG]

	# Bleeding on sharp wounds to meaty parts
	if dmg_type in ["slash", "pierce"] and (kind_torso or is_limb):
		bleed_rate += dmg * 0.12

	# Fatal head hits
	if kind_head:
		if dmg_type == "slash" and dmg >= 30.0 and mult > 0.5:
			decapitated = true
			_die("dekapitace")
			return
		if dmg_type == "pierce" and dmg >= 22.0 and mult > 0.5:
			_die("prubodnuti lebky")
			return
		if dmg_type == "blunt" and dmg >= 40.0 and mult > 0.5:
			_die("rozdrceni lebky")
			return
		if part.hp <= 0.0:
			_die("zraneni hlavy")
			return

	# Torso critical
	if kind_torso:
		if dmg_type == "pierce" and dmg >= 32.0 and mult > 0.5:
			_die("prubodnuti srdce")
			return
		if part.hp <= 0.0:
			_die("zraneni trupu")
			return

	# Limb severing
	if is_limb and dmg_type == "slash" and sever_pow >= 40.0 and mult > 0.5:
		_sever_limb(part)
	elif is_limb and part.hp <= 0.0:
		_sever_limb(part)

	# Stagger on big blunt hits
	if dmg_type == "blunt" and dmg > 25.0:
		_stagger()

func _sever_limb(part: BodyPart) -> void:
	if part.severed: return
	part.severed = true
	var vis: Node3D = part_visuals.get(part.kind)
	if vis:
		vis.visible = false
	# Hand bound to this arm? Drop weapon.
	if part.kind == BodyPartScript.Kind.RIGHT_ARM and equipped:
		drop_equipped()
	# Leg severed → heavy stagger
	if part.kind in [BodyPartScript.Kind.LEFT_LEG, BodyPartScript.Kind.RIGHT_LEG]:
		stagger_factor *= 0.4
	# Big bleed
	bleed_rate += 20.0

func _stagger() -> void:
	if state in [State.DEAD, State.STAGGER]: return
	_begin_state(State.STAGGER)

func _die(cause: String) -> void:
	if is_dead: return
	is_dead = true
	state = State.DEAD
	if equipped:
		drop_equipped()
	if decapitated:
		var head_vis: Node3D = part_visuals.get(BodyPartScript.Kind.HEAD)
		if head_vis: head_vis.visible = false
	# Flop the body: rotate forward
	body_root.rotation.x = -PI * 0.5
	body_root.position.y = 0.2
	emit_signal("died", self)
	print("[fighter] ", name, " zemrel: ", cause)

# Helper so Game can ask all body parts
func get_body_parts() -> Array:
	return parts.values()
