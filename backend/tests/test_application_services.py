from datetime import timedelta

import pytest

from app.application.tickets.service import NewTicket
from app.application.visits.service import NewVisit
from app.domain.errors import (
    AuthenticationError,
    ConflictError,
    InvalidTransitionError,
    NotFoundError,
    ValidationError,
)
from app.domain.repositories.ports import TicketFilter, VehicleEventFilter, VisitFilter
from app.domain.value_objects.enums import (
    MatchStatus,
    Role,
    TicketCategory,
    TicketEntryKind,
    TicketPriority,
    TicketStatus,
    VehicleType,
    VisitType,
)

from conftest import T0, make_event


# --------------------------------------------------------------------- auth
def test_login_returns_token_and_authenticates(auth, admin):
    result = auth.login("Admin", "admin123")  # el usuario no distingue mayúsculas
    assert auth.authenticate(result.access_token).id == admin.id


@pytest.mark.parametrize("username,password", [("admin", "mala"), ("nadie", "admin123")])
def test_login_rejects_bad_credentials_with_same_error(auth, admin, username, password):
    with pytest.raises(AuthenticationError, match="incorrectos"):
        auth.login(username, password)


def test_inactive_user_cannot_login_or_use_old_token(auth, admin, guard):
    token = auth.login("guardia1", "guard123").access_token
    auth.update_user(guard.id, is_active=False)
    with pytest.raises(AuthenticationError):
        auth.login("guardia1", "guard123")
    with pytest.raises(AuthenticationError):
        auth.authenticate(token)


def test_duplicate_username_and_short_password_rejected(auth, admin):
    with pytest.raises(ConflictError):
        auth.create_user("ADMIN", "Otro", Role.GUARD, "123456")
    with pytest.raises(ValidationError):
        auth.create_user("nuevo", "Nuevo", Role.GUARD, "123")


def test_passwords_are_stored_hashed(auth, admin):
    assert admin.password_hash != "admin123"
    assert admin.password_hash.startswith("$2")


def test_garbage_token_is_rejected(auth):
    with pytest.raises(AuthenticationError):
        auth.authenticate("no-es-un-token")


# ------------------------------------------------------------------ tickets
def _new_ticket(**kw) -> NewTicket:
    base = dict(title="Luz dañada", description="Poste sin luz en la entrada",
                category=TicketCategory.MAINTENANCE, priority=TicketPriority.HIGH)
    return NewTicket(**{**base, **kw})


def test_ticket_gets_sequential_code_and_creation_entry(tickets, admin):
    first = tickets.create(admin, _new_ticket())
    second = tickets.create(admin, _new_ticket(title="Otro"))
    assert (first.code, second.code) == ("TCK-0001", "TCK-0002")
    assert first.status == TicketStatus.OPEN
    assert [e.kind for e in first.entries] == [TicketEntryKind.CREATED]


def test_ticket_lifecycle_records_history(tickets, admin, guard, clock):
    ticket = tickets.create(guard, _new_ticket())
    clock.advance(minutes=5)
    tickets.assign(ticket.id, admin.id, admin)
    tickets.change_status(ticket.id, TicketStatus.IN_PROGRESS, admin)
    tickets.add_comment(ticket.id, "Se pidió el repuesto", admin)
    clock.advance(hours=2)
    done = tickets.change_status(ticket.id, TicketStatus.RESOLVED, admin)

    assert done.status == TicketStatus.RESOLVED
    assert done.resolved_at == clock.now
    assert done.assigned_to == admin.id
    assert [e.kind for e in done.entries] == [
        TicketEntryKind.CREATED, TicketEntryKind.ASSIGNMENT, TicketEntryKind.STATUS_CHANGE,
        TicketEntryKind.COMMENT, TicketEntryKind.STATUS_CHANGE,
    ]
    assert done.entries[-1].from_status == TicketStatus.IN_PROGRESS
    # el historial persistido coincide con el que devuelve get()
    assert len(tickets.get(ticket.id).entries) == 5


@pytest.mark.parametrize(
    "path,invalid",
    [([], TicketStatus.RESOLVED), ([], TicketStatus.OPEN)],
)
def test_invalid_status_transitions_rejected(tickets, admin, path, invalid):
    ticket = tickets.create(admin, _new_ticket())
    with pytest.raises(InvalidTransitionError):
        tickets.change_status(ticket.id, invalid, admin)


def test_closed_ticket_is_final(tickets, admin):
    ticket = tickets.create(admin, _new_ticket())
    tickets.change_status(ticket.id, TicketStatus.CLOSED, admin)
    with pytest.raises(InvalidTransitionError):
        tickets.change_status(ticket.id, TicketStatus.OPEN, admin)
    with pytest.raises(ConflictError):
        tickets.add_comment(ticket.id, "tarde", admin)


def test_reopening_a_resolved_ticket_clears_resolution(tickets, admin):
    ticket = tickets.create(admin, _new_ticket())
    tickets.change_status(ticket.id, TicketStatus.IN_PROGRESS, admin)
    tickets.change_status(ticket.id, TicketStatus.RESOLVED, admin)
    reopened = tickets.change_status(ticket.id, TicketStatus.IN_PROGRESS, admin)
    assert reopened.resolved_at is None


def test_ticket_validation_and_not_found(tickets, admin):
    with pytest.raises(ValidationError):
        tickets.create(admin, _new_ticket(title="   "))
    ticket = tickets.create(admin, _new_ticket())
    with pytest.raises(ValidationError):
        tickets.add_comment(ticket.id, "  ", admin)
    with pytest.raises(ValidationError):
        tickets.assign(ticket.id, 999, admin)
    with pytest.raises(NotFoundError):
        tickets.get(999)


def test_ticket_filters_and_counts(tickets, admin):
    a = tickets.create(admin, _new_ticket(title="Fuga de agua", category=TicketCategory.DAMAGE,
                                          priority=TicketPriority.URGENT, location="Casa 12"))
    tickets.create(admin, _new_ticket(title="Ruido fuerte", category=TicketCategory.NOISE,
                                      priority=TicketPriority.LOW))
    tickets.change_status(a.id, TicketStatus.IN_PROGRESS, admin)

    assert tickets.list(TicketFilter(status=TicketStatus.IN_PROGRESS)).total == 1
    assert tickets.list(TicketFilter(category=TicketCategory.NOISE)).items[0].title == "Ruido fuerte"
    assert tickets.list(TicketFilter(search="casa 12")).total == 1
    assert tickets.list(TicketFilter(priority=TicketPriority.URGENT)).total == 1
    counts = tickets.counts_by_status()
    assert counts[TicketStatus.OPEN] == 1 and counts[TicketStatus.IN_PROGRESS] == 1
    assert counts[TicketStatus.CLOSED] == 0


# ------------------------------------------------------------------- visitas
def _moto_uber(plate="AB123C", **kw) -> NewVisit:
    return NewVisit(VisitType.DELIVERY, "Carlos Pérez", company="Uber", plate=plate,
                    vehicle_type=VehicleType.MOTORCYCLE, destination="Casa 5", **kw)


def test_uber_moto_is_verified_by_camera(visits, events, guard, clock):
    seen = events.record(make_event(clock.now - timedelta(minutes=2), plate="AB123C"))
    result = visits.register_entry(guard, _moto_uber())
    assert result.match.status == MatchStatus.VERIFIED
    assert result.visit.camera_event_id == seen.id
    assert result.visit.match_status == MatchStatus.VERIFIED
    assert result.visit.plate.value == "AB123C"


def test_uber_moto_with_plate_read_wrong_by_camera_is_still_verified(visits, events, guard, clock):
    events.record(make_event(clock.now, plate="AB128C"))
    assert visits.register_entry(guard, _moto_uber()).match.status == MatchStatus.VERIFIED


def test_uber_moto_seen_without_plate_is_possible_then_guard_confirms(visits, events, guard, clock):
    seen = events.record(make_event(clock.now - timedelta(minutes=1), plate=None))
    result = visits.register_entry(guard, _moto_uber())
    assert result.match.status == MatchStatus.POSSIBLE
    confirmed = visits.confirm_camera_event(result.visit.id, seen.id)
    assert confirmed.visit.match_status == MatchStatus.VERIFIED
    assert visits.get(result.visit.id).camera_event_id == seen.id


def test_uber_moto_without_camera_evidence(visits, guard):
    result = visits.register_entry(guard, _moto_uber())
    assert result.match.status == MatchStatus.NO_CAMERA_EVIDENCE
    assert result.visit.camera_event_id is None


def test_recheck_finds_event_recorded_after_registration(visits, events, guard, clock):
    visit = visits.register_entry(guard, _moto_uber()).visit
    assert visit.match_status == MatchStatus.NO_CAMERA_EVIDENCE
    events.record(make_event(clock.now + timedelta(minutes=1), plate="AB123C"))
    rechecked = visits.camera_match(visit.id)
    assert rechecked.match.status == MatchStatus.VERIFIED
    assert visits.get(visit.id).match_status == MatchStatus.VERIFIED


def test_visitor_on_foot_needs_no_camera(visits, guard):
    result = visits.register_entry(guard, NewVisit(VisitType.VISITOR, "Ana Torres", destination="Casa 2"))
    assert result.match.status == MatchStatus.NOT_APPLICABLE
    assert result.visit.has_vehicle is False


def test_plate_without_vehicle_type_defaults_to_car(visits, guard):
    visit = visits.register_entry(guard, NewVisit(VisitType.PROVIDER, "Proveedor", plate="abc-1234")).visit
    assert visit.vehicle_type == VehicleType.CAR
    assert visit.plate.value == "ABC1234"


def test_entry_validation(visits, guard):
    with pytest.raises(ValidationError):
        visits.register_entry(guard, NewVisit(VisitType.VISITOR, "  "))
    with pytest.raises(ValidationError):
        visits.register_entry(guard, NewVisit(VisitType.VISITOR, "Ana", plate="A"))


def test_exit_is_recorded_once(visits, guard, clock):
    visit = visits.register_entry(guard, NewVisit(VisitType.VISITOR, "Ana")).visit
    assert visit.is_active
    clock.advance(minutes=45)
    done = visits.register_exit(visit.id)
    assert done.exited_at == clock.now and not done.is_active
    with pytest.raises(ConflictError):
        visits.register_exit(visit.id)


def test_visit_filters(visits, guard):
    visits.register_entry(guard, _moto_uber())
    on_foot = visits.register_entry(guard, NewVisit(VisitType.VISITOR, "Ana Torres", destination="Casa 2")).visit
    visits.register_exit(on_foot.id)

    assert visits.list(VisitFilter(active_only=True)).total == 1
    assert visits.list(VisitFilter(active_only=False)).items[0].full_name == "Ana Torres"
    assert visits.list(VisitFilter(visit_type=VisitType.DELIVERY)).total == 1
    assert visits.list(VisitFilter(search="uber")).total == 1
    assert visits.list(VisitFilter(search="ab123")).total == 1


def test_unmatched_vehicles_are_motos_nobody_registered(visits, events, guard, clock):
    registered = events.record(make_event(clock.now, plate="AB123C"))
    ghost = events.record(make_event(clock.now + timedelta(minutes=3), plate="ZZ999Z"))
    car = events.record(make_event(clock.now, vehicle_type=VehicleType.CAR, plate="CAR1234"))
    visits.register_entry(guard, _moto_uber())

    start, end = clock.now - timedelta(hours=1), clock.now + timedelta(hours=1)
    motos = visits.unmatched_vehicles(start, end, VehicleType.MOTORCYCLE)
    assert [e.id for e in motos] == [ghost.id]
    all_types = visits.unmatched_vehicles(start, end)
    assert {e.id for e in all_types} == {ghost.id, car.id}
    assert registered.id not in {e.id for e in all_types}


# ------------------------------------------------------------ eventos de cámara
def test_events_search_and_summary(events, clock):
    events.record(make_event(T0, plate="AB123C", color="negro"))
    events.record(make_event(T0 + timedelta(hours=1), vehicle_type=VehicleType.CAR, color="blanco"))
    events.record(make_event(T0 + timedelta(hours=1, minutes=5), vehicle_type=VehicleType.CAR, color="blanco"))

    assert events.list(VehicleEventFilter(plate="ab-123")).total == 0  # el filtro exige texto ya normalizado
    assert events.list(VehicleEventFilter(plate="AB123")).total == 1
    assert events.list(VehicleEventFilter(vehicle_type=VehicleType.CAR)).total == 2
    assert events.list(VehicleEventFilter(color="negro")).items[0].plate_text == "AB123C"
    assert events.list(VehicleEventFilter(start=T0 + timedelta(minutes=30))).total == 2
    newest_first = events.list(VehicleEventFilter()).items
    assert newest_first[0].occurred_at > newest_first[-1].occurred_at

    summary = events.summary(T0 - timedelta(hours=1), T0 + timedelta(hours=3))
    assert summary.total == 3
    assert summary.by_type == {"motorcycle": 1, "car": 2}
    assert summary.by_color == {"negro": 1, "blanco": 2}
    assert summary.by_hour == {14: 1, 15: 2}


def test_event_datetimes_round_trip_with_utc(events):
    saved = events.record(make_event(T0))
    loaded = events.get(saved.id)
    assert loaded.occurred_at == T0 and loaded.occurred_at.tzinfo is not None
    with pytest.raises(NotFoundError):
        events.get(999)
