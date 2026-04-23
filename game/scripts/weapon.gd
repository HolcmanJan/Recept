extends Node3D
class_name Weapon

# A weapon that can be picked up from the ground, held by a fighter, and used to attack.
# Damage is applied to BodyPart hitboxes that overlap the blade Area3D during an active swing.

enum Type {
	SWORD, SPEAR, MACE, AXE, PITCHFORK,
	SCYTHE, TWO_HAND_SWORD, DAGGER, HALBERD, FIST
}

enum State { GROUND, HELD }

@export var type: Type = Type.SWORD
var state: int = State.GROUND

# Set by build() per weapon type:
var length: float = 1.0          # blade / striking portion length (m)
var slash_dmg: float = 0.0
var pierce_dmg: float = 0.0
var blunt_dmg: float = 0.0
var sever_power: float = 0.0     # >= 40 can sever unarmored limbs
var reach: float = 1.0           # total distance from grip

# Visual + hit detection
var blade: Area3D                # combat hitbox (enabled only during active attack frames)
var pickup_area: Area3D          # for fighter to grab it via E
var holder: Node = null          # current fighter holding this
var hit_already: Dictionary = {} # Fighter -> true, reset at the start of each swing

static func stats_for(t: int) -> Dictionary:
	# Damage values tuned so that solid hits matter but chip damage is survivable.
	match t:
		Type.SWORD:
			return {"name": "Mec", "len": 1.0, "slash": 42.0, "pierce": 28.0, "blunt": 6.0, "sever": 40.0, "reach": 1.4, "color": Color(0.85, 0.9, 1.0)}
		Type.SPEAR:
			return {"name": "Kopi", "len": 2.0, "slash": 12.0, "pierce": 55.0, "blunt": 8.0, "sever": 10.0, "reach": 2.2, "color": Color(0.8, 0.6, 0.3)}
		Type.MACE:
			return {"name": "Palcat", "len": 0.8, "slash": 0.0, "pierce": 0.0, "blunt": 55.0, "sever": 0.0, "reach": 1.0, "color": Color(0.5, 0.5, 0.55)}
		Type.AXE:
			return {"name": "Sekera", "len": 0.9, "slash": 55.0, "pierce": 8.0, "blunt": 20.0, "sever": 55.0, "reach": 1.2, "color": Color(0.7, 0.7, 0.75)}
		Type.PITCHFORK:
			return {"name": "Vidle", "len": 1.8, "slash": 4.0, "pierce": 38.0, "blunt": 6.0, "sever": 0.0, "reach": 2.0, "color": Color(0.75, 0.55, 0.3)}
		Type.SCYTHE:
			return {"name": "Kosa", "len": 1.5, "slash": 48.0, "pierce": 18.0, "blunt": 6.0, "sever": 45.0, "reach": 1.8, "color": Color(0.8, 0.85, 0.9)}
		Type.TWO_HAND_SWORD:
			return {"name": "Obourucni mec", "len": 1.4, "slash": 58.0, "pierce": 35.0, "blunt": 12.0, "sever": 55.0, "reach": 1.8, "color": Color(0.9, 0.9, 1.0)}
		Type.DAGGER:
			return {"name": "Dyka", "len": 0.3, "slash": 18.0, "pierce": 28.0, "blunt": 2.0, "sever": 15.0, "reach": 0.5, "color": Color(0.85, 0.85, 0.9)}
		Type.HALBERD:
			return {"name": "Halapartna", "len": 2.2, "slash": 50.0, "pierce": 45.0, "blunt": 18.0, "sever": 50.0, "reach": 2.4, "color": Color(0.75, 0.75, 0.85)}
		_:
			return {"name": "Pest", "len": 0.25, "slash": 0.0, "pierce": 0.0, "blunt": 8.0, "sever": 0.0, "reach": 0.4, "color": Color(0.9, 0.75, 0.65)}

# Build the full node tree for a weapon of the given type.
static func build(t: int) -> Weapon:
	var w := Weapon.new()
	w.type = t
	var s: Dictionary = Weapon.stats_for(t)
	w.length = s["len"]
	w.slash_dmg = s["slash"]
	w.pierce_dmg = s["pierce"]
	w.blunt_dmg = s["blunt"]
	w.sever_power = s["sever"]
	w.reach = s["reach"]

	var mat := StandardMaterial3D.new()
	mat.albedo_color = s["color"]
	mat.metallic = 0.6
	mat.roughness = 0.35

	# Visual and blade hitbox are built per type.
	var blade_shape := BoxShape3D.new()
	var blade_mesh := MeshInstance3D.new()
	var mesh_root := Node3D.new()
	mesh_root.name = "Mesh"
	w.add_child(mesh_root)

	match t:
		Type.SWORD, Type.TWO_HAND_SWORD:
			var blade_box := BoxMesh.new()
			blade_box.size = Vector3(0.06, 0.12, w.length)
			blade_mesh.mesh = blade_box
			blade_mesh.material_override = mat
			blade_mesh.position = Vector3(0, 0, w.length * 0.5 + 0.15)
			mesh_root.add_child(blade_mesh)
			# guard
			var guard := MeshInstance3D.new()
			var gb := BoxMesh.new(); gb.size = Vector3(0.28, 0.05, 0.08)
			guard.mesh = gb; guard.material_override = _grip_mat()
			guard.position = Vector3(0, 0, 0.1)
			mesh_root.add_child(guard)
			# grip
			var grip := MeshInstance3D.new()
			var gm := CylinderMesh.new(); gm.top_radius = 0.025; gm.bottom_radius = 0.025; gm.height = 0.25
			grip.mesh = gm; grip.material_override = _grip_mat()
			grip.rotation_degrees = Vector3(90, 0, 0)
			grip.position = Vector3(0, 0, -0.05)
			mesh_root.add_child(grip)
			blade_shape.size = Vector3(0.08, 0.14, w.length)
		Type.DAGGER:
			var bb := BoxMesh.new(); bb.size = Vector3(0.04, 0.08, w.length)
			blade_mesh.mesh = bb; blade_mesh.material_override = mat
			blade_mesh.position = Vector3(0, 0, w.length * 0.5 + 0.08)
			mesh_root.add_child(blade_mesh)
			blade_shape.size = Vector3(0.06, 0.1, w.length)
		Type.SPEAR, Type.PITCHFORK, Type.HALBERD:
			# Shaft
			var shaft := MeshInstance3D.new()
			var sm := CylinderMesh.new(); sm.top_radius = 0.03; sm.bottom_radius = 0.03; sm.height = w.length
			shaft.mesh = sm; shaft.material_override = _grip_mat()
			shaft.rotation_degrees = Vector3(90, 0, 0)
			shaft.position = Vector3(0, 0, w.length * 0.5)
			mesh_root.add_child(shaft)
			# Head
			var head := MeshInstance3D.new()
			var hm: Mesh
			if t == Type.PITCHFORK:
				hm = BoxMesh.new(); (hm as BoxMesh).size = Vector3(0.2, 0.04, 0.35)
			elif t == Type.HALBERD:
				hm = BoxMesh.new(); (hm as BoxMesh).size = Vector3(0.3, 0.25, 0.05)
			else:
				hm = BoxMesh.new(); (hm as BoxMesh).size = Vector3(0.05, 0.1, 0.3)
			head.mesh = hm; head.material_override = mat
			head.position = Vector3(0, 0, w.length + 0.1)
			mesh_root.add_child(head)
			blade_shape.size = Vector3(0.3, 0.3, 0.5)
			blade_mesh.position = Vector3(0, 0, w.length + 0.1)
		Type.MACE:
			var shaft := MeshInstance3D.new()
			var sm := CylinderMesh.new(); sm.top_radius = 0.03; sm.bottom_radius = 0.03; sm.height = w.length
			shaft.mesh = sm; shaft.material_override = _grip_mat()
			shaft.rotation_degrees = Vector3(90, 0, 0)
			shaft.position = Vector3(0, 0, w.length * 0.5)
			mesh_root.add_child(shaft)
			var head := MeshInstance3D.new()
			var sph := SphereMesh.new(); sph.radius = 0.12; sph.height = 0.24
			head.mesh = sph; head.material_override = mat
			head.position = Vector3(0, 0, w.length + 0.05)
			mesh_root.add_child(head)
			blade_shape.size = Vector3(0.3, 0.3, 0.3)
			blade_mesh.position = Vector3(0, 0, w.length + 0.05)
		Type.AXE:
			var shaft := MeshInstance3D.new()
			var sm := CylinderMesh.new(); sm.top_radius = 0.03; sm.bottom_radius = 0.03; sm.height = w.length
			shaft.mesh = sm; shaft.material_override = _grip_mat()
			shaft.rotation_degrees = Vector3(90, 0, 0)
			shaft.position = Vector3(0, 0, w.length * 0.5)
			mesh_root.add_child(shaft)
			var head := MeshInstance3D.new()
			var hm := BoxMesh.new(); hm.size = Vector3(0.28, 0.22, 0.05)
			head.mesh = hm; head.material_override = mat
			head.position = Vector3(0.12, 0, w.length + 0.05)
			mesh_root.add_child(head)
			blade_shape.size = Vector3(0.35, 0.25, 0.3)
			blade_mesh.position = Vector3(0.1, 0, w.length)
		Type.SCYTHE:
			var shaft := MeshInstance3D.new()
			var sm := CylinderMesh.new(); sm.top_radius = 0.03; sm.bottom_radius = 0.03; sm.height = w.length
			shaft.mesh = sm; shaft.material_override = _grip_mat()
			shaft.rotation_degrees = Vector3(90, 0, 0)
			shaft.position = Vector3(0, 0, w.length * 0.5)
			mesh_root.add_child(shaft)
			var head := MeshInstance3D.new()
			var hm := BoxMesh.new(); hm.size = Vector3(0.7, 0.05, 0.1)
			head.mesh = hm; head.material_override = mat
			head.position = Vector3(-0.3, 0, w.length)
			mesh_root.add_child(head)
			blade_shape.size = Vector3(0.8, 0.1, 0.2)
			blade_mesh.position = Vector3(-0.3, 0, w.length)
		_:
			pass

	# Combat hitbox (Area3D) around the striking zone.
	var blade_area := Area3D.new()
	blade_area.name = "Blade"
	blade_area.monitoring = true
	blade_area.monitorable = false
	blade_area.collision_layer = 0
	blade_area.collision_mask = 1 << 5  # body parts on layer 6
	var cs := CollisionShape3D.new()
	cs.shape = blade_shape
	cs.position = blade_mesh.position
	blade_area.add_child(cs)
	w.add_child(blade_area)
	w.blade = blade_area
	blade_area.set_deferred("monitoring", false)

	# Pickup trigger for when weapon is on the ground.
	var pickup := Area3D.new()
	pickup.name = "Pickup"
	pickup.monitoring = false
	pickup.monitorable = true
	pickup.collision_layer = 1 << 4  # pickup layer 5
	pickup.collision_mask = 0
	var pshape := CollisionShape3D.new()
	var box := BoxShape3D.new(); box.size = Vector3(w.reach * 0.8 + 0.4, 0.6, w.reach * 0.8 + 0.4)
	pshape.shape = box
	pshape.position = Vector3(0, 0.3, w.length * 0.5)
	pickup.add_child(pshape)
	w.add_child(pickup)
	w.pickup_area = pickup

	return w

static func _grip_mat() -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = Color(0.35, 0.22, 0.15)
	m.roughness = 0.9
	return m

func begin_swing() -> void:
	hit_already.clear()
	blade.monitoring = true

func end_swing() -> void:
	blade.monitoring = false
	hit_already.clear()

func place_on_ground(pos: Vector3, yaw_rad: float) -> void:
	state = State.GROUND
	holder = null
	# Lay flat on the floor.
	rotation = Vector3(0, yaw_rad, 0)
	global_position = Vector3(pos.x, 0.05, pos.z)
	pickup_area.monitorable = true

func attach_to_hand(hand: Node3D) -> void:
	state = State.HELD
	if get_parent():
		get_parent().remove_child(self)
	hand.add_child(self)
	position = Vector3(0, 0, 0)
	rotation = Vector3(0, 0, 0)
	pickup_area.monitorable = false
