from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.domain.entities.vehicle_event import VehicleEvent
from app.domain.value_objects.enums import Role, VehicleType

from conftest import JPEG

def login(client: TestClient, container, username: str, role: Role) -> dict[str, str]:
    container.auth.create_user(username, username.title(), role, "secret123")
    token = client.post("/api/auth/login", json={"username": username, "password": "secret123"})
    assert token.status_code == 200, token.text
    return {"Authorization": f"Bearer {token.json()['access_token']}"}


@pytest.fixture
def admin_h(client, container):
    return login(client, container, "admin", Role.ADMIN)


@pytest.fixture
def guard_h(client, container):
    return login(client, container, "guardia", Role.GUARD)


def record_event(container, minutes_ago: float = 1, plate: str | None = "AB123C",
                 vehicle_type: VehicleType = VehicleType.MOTORCYCLE, snapshot: str | None = None):
    return container.events.record(
        VehicleEvent(
            camera_id="entrada",
            occurred_at=datetime.now(timezone.utc) - timedelta(minutes=minutes_ago),
            vehicle_type=vehicle_type,
            color="negro",
            plate_text=plate,
            snapshot_path=snapshot,
        )
    )


# --------------------------------------------------------------------- acceso
def test_health_is_public(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_endpoints_require_login(client):
    for path in ["/api/tickets", "/api/visits", "/api/vehicle-events", "/api/cameras", "/api/dashboard", "/api/users"]:
        response = client.get(path)
        assert response.status_code == 401, path
        assert response.headers["www-authenticate"] == "Bearer"


def test_bad_credentials_and_token(client, container, admin_h):
    bad = client.post("/api/auth/login", json={"username": "admin", "password": "otra"})
    assert bad.status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": "Bearer basura"}).status_code == 401


def test_me_returns_profile_without_password(client, admin_h):
    body = client.get("/api/auth/me", headers=admin_h).json()
    assert body["username"] == "admin" and body["role"] == "admin"
    assert "password" not in str(body).lower()


def test_only_admin_manages_users(client, admin_h, guard_h):
    assert client.get("/api/users", headers=guard_h).status_code == 403
    created = client.post(
        "/api/users",
        headers=admin_h,
        json={"username": "nuevo", "full_name": "Nuevo Guardia", "role": "guard", "password": "clave123"},
    )
    assert created.status_code == 201 and created.json()["role"] == "guard"
    dup = client.post(
        "/api/users", headers=admin_h,
        json={"username": "nuevo", "full_name": "X", "role": "guard", "password": "clave123"},
    )
    assert dup.status_code == 409
    off = client.patch(f"/api/users/{created.json()['id']}", headers=admin_h, json={"is_active": False})
    assert off.json()["is_active"] is False
    assert client.post("/api/auth/login", json={"username": "nuevo", "password": "clave123"}).status_code == 401


# -------------------------------------------------------------------- tickets
def _ticket_body(**kw):
    return {"title": "Foco quemado", "description": "Pasillo de la torre 2", "category": "maintenance",
            "priority": "high", "location": "Torre 2", "reporter_name": "Sra. López", **kw}


def test_ticket_flow_end_to_end(client, admin_h, guard_h):
    created = client.post("/api/tickets", headers=guard_h, json=_ticket_body())
    assert created.status_code == 201
    ticket = created.json()
    assert ticket["code"] == "TCK-0001" and ticket["status"] == "open"
    assert ticket["created_by_name"] == "Guardia"
    assert ticket["entries"][0]["kind"] == "created"

    # el guardia puede comentar pero no cambiar estado ni asignar
    assert client.post(f"/api/tickets/{ticket['id']}/comments", headers=guard_h, json={"body": "Ya avisé"}).status_code == 201
    assert client.patch(f"/api/tickets/{ticket['id']}/status", headers=guard_h, json={"status": "in_progress"}).status_code == 403
    assert client.patch(f"/api/tickets/{ticket['id']}/assign", headers=guard_h, json={"assignee_id": 1}).status_code == 403

    admin_id = client.get("/api/auth/me", headers=admin_h).json()["id"]
    assigned = client.patch(f"/api/tickets/{ticket['id']}/assign", headers=admin_h, json={"assignee_id": admin_id})
    assert assigned.json()["assigned_to_name"] == "Admin"
    progress = client.patch(f"/api/tickets/{ticket['id']}/status", headers=admin_h, json={"status": "in_progress"})
    assert progress.json()["status"] == "in_progress"
    done = client.patch(f"/api/tickets/{ticket['id']}/status", headers=admin_h, json={"status": "resolved"}).json()
    assert done["resolved_at"] is not None
    kinds = [e["kind"] for e in done["entries"]]
    assert kinds == ["created", "comment", "assignment", "status_change", "status_change"]

    invalid = client.patch(f"/api/tickets/{ticket['id']}/status", headers=admin_h, json={"status": "open"})
    assert invalid.status_code == 409


def test_ticket_validation_errors(client, guard_h):
    assert client.post("/api/tickets", headers=guard_h, json=_ticket_body(title="")).status_code == 422
    assert client.post("/api/tickets", headers=guard_h, json=_ticket_body(category="nope")).status_code == 422
    assert client.post("/api/tickets", headers=guard_h, json=_ticket_body(title="   ")).status_code == 422
    assert client.get("/api/tickets/999", headers=guard_h).status_code == 404


def test_ticket_list_filters_and_stats(client, admin_h):
    client.post("/api/tickets", headers=admin_h, json=_ticket_body(title="Fuga", category="damage"))
    client.post("/api/tickets", headers=admin_h, json=_ticket_body(title="Ruido", category="noise"))
    assert client.get("/api/tickets?category=noise", headers=admin_h).json()["total"] == 1
    assert client.get("/api/tickets?q=fuga", headers=admin_h).json()["items"][0]["title"] == "Fuga"
    stats = client.get("/api/tickets/stats", headers=admin_h).json()
    assert stats["by_status"]["open"] == 2 and stats["by_status"]["closed"] == 0


# -------------------------------------------------------------------- visitas
def _uber(**kw):
    return {"visit_type": "delivery", "full_name": "Carlos Pérez", "company": "Uber",
            "plate": "ab-123c", "vehicle_type": "motorcycle", "destination": "Casa 5", **kw}


def test_uber_moto_backed_by_camera(client, container, guard_h):
    seen = record_event(container, minutes_ago=2, plate="AB123C")
    response = client.post("/api/visits", headers=guard_h, json=_uber())
    assert response.status_code == 201
    body = response.json()
    assert body["visit"]["plate"] == "AB123C"
    assert body["camera_match"]["status"] == "verified"
    assert body["camera_match"]["event"]["id"] == seen.id
    assert body["visit"]["camera_event_id"] == seen.id


def test_uber_moto_without_evidence_then_recheck(client, container, guard_h):
    body = client.post("/api/visits", headers=guard_h, json=_uber()).json()
    assert body["camera_match"]["status"] == "no_camera_evidence"
    record_event(container, minutes_ago=0, plate="AB123C")
    again = client.get(f"/api/visits/{body['visit']['id']}/camera-match", headers=guard_h).json()
    assert again["camera_match"]["status"] == "verified"


def test_possible_match_is_confirmed_by_guard(client, container, guard_h):
    seen = record_event(container, minutes_ago=1, plate=None)
    body = client.post("/api/visits", headers=guard_h, json=_uber()).json()
    assert body["camera_match"]["status"] == "possible"
    confirmed = client.post(
        f"/api/visits/{body['visit']['id']}/confirm-camera-event", headers=guard_h, json={"event_id": seen.id}
    )
    assert confirmed.json()["visit"]["match_status"] == "verified"
    assert client.post(
        f"/api/visits/{body['visit']['id']}/confirm-camera-event", headers=guard_h, json={"event_id": 999}
    ).status_code == 404


def test_visit_list_exit_and_validation(client, guard_h):
    visit = client.post(
        "/api/visits", headers=guard_h, json={"visit_type": "visitor", "full_name": "Ana Torres", "destination": "Casa 2"}
    ).json()["visit"]
    assert visit["is_active"] and visit["match_status"] == "not_applicable"
    assert client.get("/api/visits?active=true", headers=guard_h).json()["total"] == 1
    assert client.patch(f"/api/visits/{visit['id']}/exit", headers=guard_h).json()["is_active"] is False
    assert client.patch(f"/api/visits/{visit['id']}/exit", headers=guard_h).status_code == 409
    assert client.get("/api/visits?active=true", headers=guard_h).json()["total"] == 0
    assert client.get("/api/visits?q=torres", headers=guard_h).json()["total"] == 1
    assert client.post("/api/visits", headers=guard_h, json={"visit_type": "visitor", "full_name": "  "}).status_code == 422
    assert client.post("/api/visits", headers=guard_h, json={"visit_type": "visitor", "full_name": "X", "plate": "A"}).status_code == 422
    assert client.get("/api/visits/999", headers=guard_h).status_code == 404


def test_unmatched_motorcycles_endpoint(client, container, guard_h):
    ghost = record_event(container, minutes_ago=5, plate="ZZ999Z")
    record_event(container, minutes_ago=1, plate="AB123C")
    record_event(container, minutes_ago=1, plate="CAR1234", vehicle_type=VehicleType.CAR)
    client.post("/api/visits", headers=guard_h, json=_uber())

    motos = client.get("/api/visits/unmatched-vehicles", headers=guard_h).json()
    assert [e["id"] for e in motos] == [ghost.id]
    everything = client.get("/api/visits/unmatched-vehicles?type=car", headers=guard_h).json()
    assert [e["plate_text"] for e in everything] == ["CAR1234"]


# --------------------------------------------------------------------- cámaras
def test_camera_list_snapshot_and_stream(client, guard_h):
    cams = client.get("/api/cameras", headers=guard_h).json()
    assert cams[0]["id"] == "entrada" and cams[0]["crossings"] == 3
    snap = client.get("/api/cameras/entrada/snapshot.jpg", headers=guard_h)
    assert snap.content == JPEG and snap.headers["content-type"] == "image/jpeg"
    stream = client.get("/api/cameras/entrada/stream", headers=guard_h)
    assert stream.headers["content-type"].startswith("multipart/x-mixed-replace; boundary=frame")
    assert stream.content.count(b"--frame") == 2 and JPEG in stream.content
    assert client.get("/api/cameras/otra/snapshot.jpg", headers=guard_h).status_code == 404


def test_media_endpoints_accept_token_in_query_for_img_tags(client, container, guard_h):
    token = guard_h["Authorization"].split()[1]
    assert client.get(f"/api/cameras/entrada/stream?access_token={token}").status_code == 200
    assert client.get("/api/cameras/entrada/stream?access_token=mala").status_code == 401


def test_vehicle_events_filters_summary_and_snapshot(client, container, guard_h, tmp_path):
    photos = container.settings.snapshots_dir
    photos.mkdir()
    (photos / "a.jpg").write_bytes(JPEG)
    outside = tmp_path / "secreto.jpg"
    outside.write_bytes(b"no-debe-salir")

    with_photo = record_event(container, plate="AB123C", snapshot=str(photos / "a.jpg"))
    sneaky = record_event(container, plate="ZZ999Z", snapshot=str(outside))
    record_event(container, plate=None, vehicle_type=VehicleType.CAR)

    page = client.get("/api/vehicle-events?type=motorcycle", headers=guard_h).json()
    assert page["total"] == 2
    assert client.get("/api/vehicle-events?plate=ab-123", headers=guard_h).json()["total"] == 1
    summary = client.get("/api/vehicle-events/summary", headers=guard_h).json()
    assert summary["total"] == 3 and summary["by_type"] == {"motorcycle": 2, "car": 1}

    photo = client.get(f"/api/vehicle-events/{with_photo.id}/snapshot", headers=guard_h)
    assert photo.status_code == 200 and photo.content == JPEG
    assert client.get(f"/api/vehicle-events/{sneaky.id}/snapshot", headers=guard_h).status_code == 404  # fuera de la carpeta
    assert client.get("/api/vehicle-events/999/snapshot", headers=guard_h).status_code == 404
    item = next(e for e in page["items"] if e["id"] == with_photo.id)
    assert item["snapshot_url"] == f"/api/vehicle-events/{with_photo.id}/snapshot"


def test_dashboard(client, container, admin_h, guard_h):
    record_event(container, minutes_ago=1, plate="ZZ999Z")  # moto sin registrar
    client.post("/api/visits", headers=guard_h, json={"visit_type": "visitor", "full_name": "Ana"})
    client.post("/api/tickets", headers=guard_h, json=_ticket_body())
    body = client.get("/api/dashboard", headers=guard_h).json()
    assert body["vehicles_today"] == 1
    assert body["active_visits"] == 1
    assert body["tickets_by_status"]["open"] == 1
    assert [e["plate_text"] for e in body["unregistered_motorcycles"]] == ["ZZ999Z"]
    assert body["camera"]["status"] == "running"


def test_cors_allows_the_frontend_origin(client):
    response = client.options(
        "/api/tickets",
        headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "GET"},
    )
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
