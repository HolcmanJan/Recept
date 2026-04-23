extends Fighter
class_name Enemy

# Simple AI opponent with the same moveset as the player.

const WeaponScript := preload("res://scripts/weapon.gd")

var target: Fighter = null
var world_weapons: Array = []

var decision_cd: float = 0.0
var action_cd: float = 0.0

func _ready() -> void:
	super._ready()
	collision_layer = LAYER_ENEMY
	collision_mask = LAYER_WORLD | LAYER_PLAYER
	body_color = Color(0.75, 0.55, 0.5)

func _physics_process(delta: float) -> void:
	if not is_dead and target and not target.is_dead:
		_think(delta)
	else:
		move_dir = Vector3.ZERO
		want_block = false
	super._physics_process(delta)

func _think(delta: float) -> void:
	decision_cd -= delta
	action_cd -= delta

	var to_target: Vector3 = target.global_position - global_position
	to_target.y = 0.0
	var dist: float = to_target.length()
	var dir: Vector3 = to_target.normalized() if dist > 0.01 else Vector3.FORWARD

	# Face target
	facing_yaw = atan2(dir.x, dir.z)

	# Need a weapon? Go get one.
	if equipped == null and not world_weapons.is_empty():
		var nearest: Weapon = null
		var nd := INF
		for w_any in world_weapons:
			var w: Weapon = w_any
			if w.state != WeaponScript.State.GROUND: continue
			var d := global_position.distance_to(w.global_position)
			if d < nd:
				nd = d
				nearest = w
		if nearest != null and nd < dist + 3.0:
			var wdir := (nearest.global_position - global_position)
			wdir.y = 0
			move_dir = wdir.normalized()
			facing_yaw = atan2(move_dir.x, move_dir.z)
			if nd < 1.2:
				try_pickup_nearby(world_weapons)
			return

	var my_reach: float = 0.6
	if equipped:
		my_reach = equipped.reach

	var attack_range: float = my_reach + 0.7

	# Keep distance if clearly outmatched (low torso HP).
	var torso: BodyPart = parts[BodyPartScript.Kind.TORSO]
	var panic: bool = torso.hp < 40.0 and target.equipped != null and equipped == null

	if panic:
		move_dir = -dir
		want_block = true
		return

	if dist > attack_range:
		move_dir = dir
		want_block = false
	else:
		move_dir = Vector3.ZERO
		if action_cd <= 0.0 and state == State.IDLE:
			want_block = false
			var roll: float = randf()
			if equipped:
				if roll < 0.55:
					start_swing()
				elif roll < 0.8:
					start_stab()
				else:
					_begin_block_window()
			else:
				if roll < 0.45:
					start_punch_right()
				elif roll < 0.8:
					start_punch_left()
				else:
					_begin_block_window()
			action_cd = randf_range(0.6, 1.2)
		# While waiting, occasionally block
		if state == State.IDLE and randf() < 0.01:
			want_block = true
		elif randf() < 0.02:
			want_block = false

func _begin_block_window() -> void:
	want_block = true
	# Drop block after ~0.8s via action_cd resetting next think
	action_cd = 0.8
