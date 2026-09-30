from enum import StrEnum


class Role(StrEnum):
    ADMIN = "admin"
    GUARD = "guard"


class VehicleType(StrEnum):
    CAR = "car"
    MOTORCYCLE = "motorcycle"
    BUS = "bus"
    TRUCK = "truck"


class VisitType(StrEnum):
    VISITOR = "visitor"
    DELIVERY = "delivery"
    PROVIDER = "provider"


class MatchStatus(StrEnum):
    """Resultado de comparar una visita con lo que vieron las cámaras."""

    VERIFIED = "verified"  # la cámara vio esa placa
    POSSIBLE = "possible"  # la cámara vio un vehículo del mismo tipo sin placa legible
    NO_CAMERA_EVIDENCE = "no_camera_evidence"  # la cámara no respalda el ingreso
    NOT_APPLICABLE = "not_applicable"  # visita a pie, sin vehículo que comparar


class TicketStatus(StrEnum):
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    RESOLVED = "resolved"
    CLOSED = "closed"


class TicketPriority(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"


class TicketCategory(StrEnum):
    DAMAGE = "damage"
    MAINTENANCE = "maintenance"
    SECURITY = "security"
    NOISE = "noise"
    CLEANING = "cleaning"
    OTHER = "other"


class TicketEntryKind(StrEnum):
    CREATED = "created"
    COMMENT = "comment"
    STATUS_CHANGE = "status_change"
    ASSIGNMENT = "assignment"
