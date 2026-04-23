extends Area3D
class_name BodyPart

# Single body part hitbox attached to a Fighter.
# Receives hits from weapons / fists and forwards to the owning fighter.

enum Kind { HEAD, TORSO, LEFT_ARM, RIGHT_ARM, LEFT_LEG, RIGHT_LEG, LEFT_HAND, RIGHT_HAND }

@export var kind: Kind = Kind.TORSO
@export var max_hp: float = 100.0

var hp: float = 100.0
var severed: bool = false
var fighter: Node = null   # set by Fighter on spawn

func _ready() -> void:
	hp = max_hp

func take_damage(amount: float) -> void:
	if severed:
		return
	hp = max(0.0, hp - amount)

func is_limb() -> bool:
	return kind in [Kind.LEFT_ARM, Kind.RIGHT_ARM, Kind.LEFT_LEG, Kind.RIGHT_LEG]

func is_vital() -> bool:
	return kind == Kind.HEAD or kind == Kind.TORSO
