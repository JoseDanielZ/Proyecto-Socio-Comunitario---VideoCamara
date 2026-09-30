from __future__ import annotations

import time
from types import SimpleNamespace

import numpy as np
import supervision as sv

from app.domain.repositories.ports import VehicleEventFilter
from app.domain.value_objects.enums import VehicleType
from app.infrastructure.camera.frame_hub import FrameHub
from app.infrastructure.camera.runtime import EventSink, LprCameraRuntime
from lpr.config import LineZoneConfig
from lpr.db import Event
from lpr.line_zone import LineZoneManager

from conftest import make_settings


class FakeSource:
    def __init__(self, frames: int = 6, fail_after: int | None = None):
        self.info = SimpleNamespace(fps=100.0, width=320, height=240)
        self._frames, self._fail_after = frames, fail_after

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def frames(self):
        for i in range(self._frames):
            if self._fail_after is not None and i == self._fail_after:
                raise RuntimeError("se cayó el stream")
            yield np.zeros((240, 320, 3), dtype=np.uint8)


class FakePipeline:
    """Cruza un vehículo en el 3.er fotograma, como haría el pipeline real."""

    def __init__(self, sink):
        self._sink, self._n, self._crossings = sink, 0, []
        self.line_zones = LineZoneManager([LineZoneConfig("l", (160, 0), (160, 240))])
        self.closed = False

    def process(self, frame):
        self._n += 1
        if self._n == 3:
            self._sink.insert(
                Event(
                    vehicle_type="motorcycle", direction="entrada", source_id="entrada",
                    timestamp="2026-09-29T14:00:00+00:00", vehicle_color="negro",
                    plate_text="ab-123c", plate_confidence=0.9, tracker_id=4, snapshot_path="/x/y.jpg",
                )
            )
            self._crossings.append({"vehicle_type": "motorcycle", "color": "negro"})
        return sv.Detections(
            xyxy=np.empty((0, 4)), class_id=np.array([], dtype=int), tracker_id=np.array([], dtype=int)
        )

    def crossing_summary(self):
        return list(self._crossings)

    def close(self):
        self.closed = True


def make_runtime(tmp_path, container, source: FakeSource, hub: FrameHub | None = None):
    pipelines: list[FakePipeline] = []

    def pipeline_factory(config, fps, sink):
        pipelines.append(FakePipeline(sink))
        return pipelines[-1]

    config = SimpleNamespace(source=SimpleNamespace(type="file"))
    runtime = LprCameraRuntime(
        make_settings(tmp_path), container.events, hub,
        config_loader=lambda settings: config,
        source_factory=lambda source_config: source,
        pipeline_factory=pipeline_factory,
    )
    return runtime, pipelines


def wait_for(condition, timeout=10.0):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if condition():
            return True
        time.sleep(0.02)
    return False


def test_worker_publishes_frames_and_stores_events(tmp_path, container):
    runtime, pipelines = make_runtime(tmp_path, container, FakeSource(frames=6))
    runtime.start()
    assert wait_for(lambda: runtime.list_cameras()[0].status == "finished")
    runtime.stop()

    camera = runtime.list_cameras()[0]
    assert camera.crossings == 1 and camera.detail == "El video de prueba terminó"
    assert pipelines[0].closed

    jpeg = runtime.latest_jpeg("entrada")
    assert jpeg is not None and jpeg[:2] == b"\xff\xd8"  # es un JPEG real

    stored = container.events.list(VehicleEventFilter()).items
    assert len(stored) == 1
    event = stored[0]
    assert event.vehicle_type == VehicleType.MOTORCYCLE and event.color == "negro"
    assert event.plate_text == "AB123C"  # normalizada
    assert event.camera_id == "entrada" and event.tracker_id == 4
    assert event.occurred_at.isoformat() == "2026-09-29T14:00:00+00:00"


def test_stream_yields_frames_then_ends_when_video_finishes(tmp_path, container):
    runtime, _ = make_runtime(tmp_path, container, FakeSource(frames=5))
    runtime.start()
    frames = list(runtime.stream_jpegs("entrada"))  # termina solo al acabar el video
    runtime.stop()
    assert len(frames) >= 1 and all(f[:2] == b"\xff\xd8" for f in frames)


def test_failure_is_reported_not_raised(tmp_path, container):
    runtime, pipelines = make_runtime(tmp_path, container, FakeSource(frames=6, fail_after=2))
    runtime.start()
    assert wait_for(lambda: runtime.list_cameras()[0].status == "error")
    runtime.stop()
    assert "se cayó el stream" in runtime.list_cameras()[0].detail
    assert pipelines[0].closed  # el pipeline se cierra aunque falle


def test_stop_interrupts_a_long_video(tmp_path, container):
    runtime, _ = make_runtime(tmp_path, container, FakeSource(frames=100_000))
    runtime.start()
    assert wait_for(lambda: runtime.latest_jpeg("entrada") is not None)
    runtime.stop()
    assert runtime.list_cameras()[0].status == "stopped"


def test_event_sink_discards_unknown_vehicle_types(container):
    sink = EventSink("entrada", container.events)
    sink.insert(Event(vehicle_type="tractor", direction="entrada", source_id="e",
                      timestamp="2026-09-29T14:00:00+00:00"))
    assert container.events.list(VehicleEventFilter()).total == 0


def test_event_sink_keeps_no_plate_as_none(container):
    sink = EventSink("entrada", container.events)
    sink.insert(Event(vehicle_type="car", direction="entrada", source_id="e",
                      timestamp="2026-09-29T14:00:00", plate_text=None))
    saved = container.events.list(VehicleEventFilter()).items[0]
    assert saved.plate_text is None
    assert saved.occurred_at.tzinfo is not None  # una hora sin zona se toma como UTC


def test_frame_hub_wakes_waiters_and_times_out():
    hub = FrameHub()
    assert hub.wait_next("c", 0, timeout=0.05) is None
    hub.publish("c", b"1")
    assert hub.wait_next("c", 0, timeout=0.05) == (1, b"1")
    assert hub.wait_next("c", 1, timeout=0.05) is None
    hub.publish("c", b"2")
    assert hub.latest("c") == b"2"
