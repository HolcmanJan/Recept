extends Fighter
class_name Player

# Input-driven Fighter with a third-person orbit camera.

const WeaponScript := preload("res://scripts/weapon.gd")

@export var mouse_sensitivity: float = 0.0025
@export var camera_distance: float = 3.8
@export var camera_height: float = 1.8

var cam_yaw: float = 0.0
var cam_pitch: float = -0.2
var cam_pivot: Node3D
var camera: Camera3D

# Reference to all pickup weapons in the world (set by Game)
var world_weapons: Array = []

func _ready() -> void:
	super._ready()
	collision_layer = LAYER_PLAYER
	collision_mask = LAYER_WORLD | LAYER_ENEMY
	_setup_camera()
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED

func _setup_camera() -> void:
	cam_pivot = Node3D.new()
	cam_pivot.name = "CamPivot"
	# Parent to root so camera doesn't rotate with body_root's facing interpolation.
	add_child(cam_pivot)
	cam_pivot.position = Vector3(0, camera_height, 0)

	camera = Camera3D.new()
	camera.name = "Camera"
	camera.current = true
	camera.fov = 70.0
	cam_pivot.add_child(camera)
	camera.position = Vector3(0, 0, camera_distance)

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion:
		if Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
			cam_yaw -= event.relative.x * mouse_sensitivity
			cam_pitch = clamp(cam_pitch - event.relative.y * mouse_sensitivity, -1.2, 0.4)
	if event is InputEventKey and event.pressed and event.keycode == KEY_ESCAPE:
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE

func _physics_process(delta: float) -> void:
	if not is_dead:
		_read_input()
		_update_camera()
	super._physics_process(delta)
	# Keep camera pivot in sync AFTER the fighter moves, so the camera does not lag behind on ground.
	if cam_pivot:
		cam_pivot.rotation = Vector3(cam_pitch, cam_yaw, 0)

func _read_input() -> void:
	# Movement relative to camera yaw on the XZ plane.
	var ix := 0.0
	var iz := 0.0
	if Input.is_key_pressed(KEY_W): iz -= 1.0
	if Input.is_key_pressed(KEY_S): iz += 1.0
	if Input.is_key_pressed(KEY_A): ix -= 1.0
	if Input.is_key_pressed(KEY_D): ix += 1.0

	var forward := Vector3(-sin(cam_yaw), 0, -cos(cam_yaw))
	var right := Vector3(cos(cam_yaw), 0, -sin(cam_yaw))
	var dir := (forward * -iz + right * ix)
	if dir.length() > 0.01:
		dir = dir.normalized()
		facing_yaw = atan2(dir.x, dir.z)
	else:
		# Face the camera direction when standing still so attacks aim forward.
		facing_yaw = cam_yaw
	move_dir = dir

	want_block = Input.is_key_pressed(KEY_CTRL)

	# Pickup
	if Input.is_key_pressed(KEY_E):
		if equipped == null:
			try_pickup_nearby(world_weapons)

	# Drop weapon with Q
	if Input.is_action_just_pressed("ui_cancel"):
		pass
	if Input.is_key_pressed(KEY_Q) and equipped and state == State.IDLE:
		drop_equipped()

	# Attack inputs
	var lmb := Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT)
	var rmb := Input.is_mouse_button_pressed(MOUSE_BUTTON_RIGHT)
	var alt := Input.is_key_pressed(KEY_ALT)

	if state == State.IDLE or state == State.BLOCK:
		if lmb:
			if equipped:
				if alt:
					start_stab()
				else:
					start_swing()
			else:
				start_punch_left()
		elif rmb and not equipped:
			start_punch_right()

func _update_camera() -> void:
	# Nothing extra; pivot rotation applied in _physics_process after movement.
	pass
