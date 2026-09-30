import json
from types import SimpleNamespace

import httpx
import numpy as np
import pytest
import supervision as sv

from lpr import bridge
from lpr.config import LineZoneConfig
from lpr.db import Event
from lpr.line_zone import LineZoneManager


@pytest.fixture(autouse=True)
def fast(monkeypatch):
    monkeypatch.setattr(bridge, "HEARTBEAT_SECONDS", 0.02)
    monkeypatch.setattr(bridge.time, "sleep", lambda s: None)  # sin esperas en reintentos


class Backend:
    """Backend simulado: guarda lo que el puente le envía."""

    def __init__(self, fail_events: int = 0):
        self.events, self.frames, self.statuses = [], [], []
        self.fail_events = fail_events

    def handler(self, request: httpx.Request) -> httpx.Response:
        assert request.headers["x-ingest-key"] == "clave"
        path = request.url.path
        if path == "/api/internal/vehicle-events":
            if self.fail_events > 0:
                self.fail_events -= 1
                return httpx.Response(503, json={"detail": "caído"})
            self.events.append(json.loads(request.content))
            return httpx.Response(201, json={"id": len(self.events)})
        if path.endswith("/frame"):
            assert request.headers["content-type"] == "image/jpeg"
            self.frames.append(request.content)
            return httpx.Response(204)
        if path.endswith("/status"):
            self.statuses.append(json.loads(request.content))
            return httpx.Response(204)
        return httpx.Response(404)

    def client(self, camera_id="entrada") -> bridge.BackendClient:
        http = httpx.Client(
            base_url="http://api", headers={"X-Ingest-Key": "clave"}, transport=httpx.MockTransport(self.handler)
        )
        return bridge.BackendClient("http://api", "clave", camera_id, client=http)


class FakeSource:
    def __init__(self, frames=6, fail_after=None):
        self.info = SimpleNamespace(fps=100.0, width=64, height=48)
        self._frames, self._fail_after = frames, fail_after

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def frames(self):
        for i in range(self._frames):
            if self._fail_after is not None and i == self._fail_after:
                raise RuntimeError("se cayó el stream")
            yield np.zeros((48, 64, 3), dtype=np.uint8)


class FakePipeline:
    def __init__(self, sink):
        self._sink, self._n, self._crossings = sink, 0, []
        self.line_zones = LineZoneManager([LineZoneConfig("l", (32, 0), (32, 48))])
        self.closed = False

    def process(self, frame):
        self._n += 1
        if self._n == 2:
            self._sink.insert(
                Event(
                    vehicle_type="motorcycle", direction="entrada", source_id="entrada",
                    timestamp="2026-09-29T14:00:00+00:00", vehicle_color="negro", plate_text="AB123C",
                    plate_confidence=0.9, tracker_id=4, snapshot_path="C:/datos/snapshots/20260929_4.jpg",
                )
            )
            self._crossings.append({"vehicle_type": "motorcycle"})
        return sv.Detections(
            xyxy=np.empty((0, 4)), class_id=np.array([], dtype=int), tracker_id=np.array([], dtype=int)
        )

    def crossing_summary(self):
        return list(self._crossings)

    def close(self):
        self.closed = True


class FakeAnnotator:
    def annotate(self, frame, detections, crossings=None):
        return frame


CONFIG = SimpleNamespace(source=SimpleNamespace(type="file"))


def run(backend: Backend, source: FakeSource, **kwargs):
    pipelines = []

    def pipeline_factory(cfg, fps, sink):
        pipelines.append(FakePipeline(sink))
        return pipelines[-1]

    result = bridge.run_bridge(
        CONFIG, backend.client(), "entrada",
        source_factory=lambda _: source, pipeline_factory=pipeline_factory,
        annotator_factory=lambda zones: FakeAnnotator(), realtime=False, **kwargs,
    )
    return result, pipelines


def test_sends_events_frames_and_final_status():
    backend = Backend()
    result, pipelines = run(backend, FakeSource(frames=6), max_fps=1000)

    assert result == "finished"
    assert pipelines[0].closed
    assert len(backend.events) == 1
    event = backend.events[0]
    assert event == {
        "camera_id": "entrada", "occurred_at": "2026-09-29T14:00:00+00:00", "vehicle_type": "motorcycle",
        "color": "negro", "plate_text": "AB123C", "plate_confidence": 0.9, "direction": "entrada",
        "tracker_id": 4, "snapshot_file": "20260929_4.jpg",  # solo el nombre, nunca la ruta
    }
    assert backend.frames and all(f[:2] == b"\xff\xd8" for f in backend.frames)  # JPEG reales
    assert backend.statuses[0]["status"] == "starting"
    assert backend.statuses[-1] == {"status": "finished", "detail": "El video de prueba terminó", "crossings": 1}


def test_limits_how_many_frames_are_sent():
    backend = Backend()
    run(backend, FakeSource(frames=30), max_fps=1)  # 1 por segundo: en un instante solo cabe el primero
    assert len(backend.frames) == 1


def test_a_failure_is_reported_to_the_backend_not_raised():
    backend = Backend()
    result, pipelines = run(backend, FakeSource(frames=6, fail_after=2))
    assert result == "error"
    assert backend.statuses[-1]["status"] == "error"
    assert "se cayó el stream" in backend.statuses[-1]["detail"]
    assert pipelines[0].closed


def test_can_be_stopped():
    backend = Backend()
    calls = {"n": 0}

    def should_stop():
        calls["n"] += 1
        return calls["n"] > 2

    result, _ = run(backend, FakeSource(frames=100), should_stop=should_stop)
    assert result == "stopped"
    assert backend.statuses[-1]["status"] == "stopped"


def test_event_is_retried_and_then_delivered():
    backend = Backend(fail_events=2)
    assert backend.client().send_event({"camera_id": "entrada"}) is True
    assert len(backend.events) == 1


def test_event_gives_up_after_three_attempts_without_raising():
    backend = Backend(fail_events=10)
    assert backend.client().send_event({"camera_id": "entrada"}) is False


def test_network_errors_never_raise():
    def boom(request):
        raise httpx.ConnectError("sin red")

    http = httpx.Client(base_url="http://api", transport=httpx.MockTransport(boom))
    client = bridge.BackendClient("http://api", "k", "entrada", client=http)
    assert client.send_frame(b"\xff\xd8x") is False
    assert client.send_status("running", None, 0) is False
    assert client.send_event({}) is False


def test_missing_key_is_a_clear_error(monkeypatch):
    monkeypatch.delenv("INGEST_API_KEY", raising=False)
    monkeypatch.setattr(bridge, "read_env_value", lambda *a, **k: None)
    with pytest.raises(SystemExit) as exit_info:
        bridge.main(["--api", "http://x"])
    assert exit_info.value.code == 2


def test_reads_the_ingest_key_from_the_backend_env_file(tmp_path):
    env = tmp_path / ".env"
    env.write_text('# comentario\nJWT_SECRET=otra\nINGEST_API_KEY="mi-clave-secreta-123"\n', encoding="utf-8")
    assert bridge.read_env_value(env, "INGEST_API_KEY") == "mi-clave-secreta-123"
    assert bridge.read_env_value(env, "NO_EXISTE") is None
    assert bridge.read_env_value(tmp_path / "no-hay.env", "INGEST_API_KEY") is None
