from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from pathlib import Path

import yaml

_ENV_VAR_PATTERN = re.compile(r"\$\{(\w+)\}")


class ConfigError(Exception):
    pass


def _expand_env(value):
    if isinstance(value, str):
        def replace(match):
            name = match.group(1)
            if name not in os.environ:
                raise ConfigError(
                    f"Variable de entorno '{name}' referenciada en config no está definida"
                )
            return os.environ[name]

        return _ENV_VAR_PATTERN.sub(replace, value)
    if isinstance(value, dict):
        return {k: _expand_env(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_expand_env(v) for v in value]
    return value


@dataclass
class SourceConfig:
    type: str
    path_or_url: str
    source_id: str = "camera_principal"
    loop: bool = False
    reconnect_delay_seconds: float = 5.0
    max_reconnect_attempts: int = -1

    def __post_init__(self) -> None:
        if self.type not in ("file", "rtsp"):
            raise ConfigError(
                f"source.type debe ser 'file' o 'rtsp', se recibió '{self.type}'"
            )


@dataclass
class ModelsConfig:
    vehicle_detector_weights: str = "models/yolov8n.pt"
    vehicle_confidence_threshold: float = 0.4
    nms_threshold: float = 0.5
    imgsz: int = 640
    vehicle_classes: list[str] = field(
        default_factory=lambda: ["car", "motorcycle", "bus", "truck"]
    )
    plate_ocr_enabled: bool = True
    plate_detector_model: str | None = None
    ocr_model: str | None = None


@dataclass
class LineZoneConfig:
    name: str
    start: tuple[int, int]
    end: tuple[int, int]
    in_label: str = "entrada"
    out_label: str = "salida"


@dataclass
class DatabaseConfig:
    path: str = "db/lpr.db"


@dataclass
class SnapshotsConfig:
    enabled: bool = True
    directory: str = "data/snapshots"


@dataclass
class RuntimeConfig:
    preview: bool = False
    log_level: str = "INFO"


@dataclass
class Config:
    source: SourceConfig
    models: ModelsConfig
    line_zones: list[LineZoneConfig]
    database: DatabaseConfig
    snapshots: SnapshotsConfig
    runtime: RuntimeConfig


def load_config(path: str | Path) -> Config:
    path = Path(path)
    if not path.exists():
        raise ConfigError(f"Archivo de configuración no encontrado: {path}")

    with path.open("r", encoding="utf-8") as f:
        raw = yaml.safe_load(f)

    if not raw:
        raise ConfigError(f"Archivo de configuración vacío: {path}")

    raw = _expand_env(raw)

    try:
        if "source" not in raw:
            raise ConfigError("Falta la sección 'source' en config")
        source = SourceConfig(**raw["source"])
        models = ModelsConfig(**raw.get("models", {}))

        line_zones_raw = raw.get("line_zones") or []
        if not line_zones_raw:
            raise ConfigError(
                "config.line_zones no puede estar vacío: se necesita al menos "
                "una línea de entrada/salida"
            )
        line_zones = [
            LineZoneConfig(
                name=lz["name"],
                start=tuple(lz["start"]),
                end=tuple(lz["end"]),
                in_label=lz.get("in_label", "entrada"),
                out_label=lz.get("out_label", "salida"),
            )
            for lz in line_zones_raw
        ]

        database = DatabaseConfig(**raw.get("database", {}))
        snapshots = SnapshotsConfig(**raw.get("snapshots", {}))
        runtime = RuntimeConfig(**raw.get("runtime", {}))
    except KeyError as exc:
        raise ConfigError(f"Falta la clave requerida en config: {exc}") from exc
    except TypeError as exc:
        raise ConfigError(f"Clave desconocida o inválida en config: {exc}") from exc

    return Config(
        source=source,
        models=models,
        line_zones=line_zones,
        database=database,
        snapshots=snapshots,
        runtime=runtime,
    )
