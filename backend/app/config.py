from __future__ import annotations

import logging
import os
import secrets
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

logger = logging.getLogger(__name__)

BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_DIR.parent


def _bool(value: str | None, default: bool) -> bool:
    if value is None:
        return default
    return value.strip().lower() in ("1", "true", "yes", "si", "sí")


def _path(value: str) -> Path:
    path = Path(value)
    return path if path.is_absolute() else PROJECT_ROOT / path


@dataclass(frozen=True)
class Settings:
    database_url: str
    jwt_secret: str
    jwt_expires_minutes: int
    cors_origins: tuple[str, ...]
    local_utc_offset_hours: int  # para "hoy" en el dashboard (Ecuador: -5)
    camera_enabled: bool
    camera_id: str
    camera_name: str
    lpr_config_path: Path
    snapshots_dir: Path
    camera_loop: bool  # repetir el video de prueba sin fin
    camera_realtime: bool  # con archivos: respetar la velocidad original del video
    camera_jpeg_quality: int

    @classmethod
    def from_env(cls) -> "Settings":
        load_dotenv(BACKEND_DIR / ".env")
        env = os.environ
        secret = env.get("JWT_SECRET")
        if not secret:
            secret = secrets.token_urlsafe(48)
            logger.warning(
                "JWT_SECRET no está definido: se generó uno temporal (las sesiones se cierran "
                "al reiniciar). Definirlo en backend/.env para uso normal."
            )
        return cls(
            database_url=env.get("DATABASE_URL", f"sqlite:///{(PROJECT_ROOT / 'db' / 'conjunto.db').as_posix()}"),
            jwt_secret=secret,
            jwt_expires_minutes=int(env.get("JWT_EXPIRES_MINUTES", "720")),
            cors_origins=tuple(
                o.strip()
                for o in env.get("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
                if o.strip()
            ),
            local_utc_offset_hours=int(env.get("LOCAL_UTC_OFFSET_HOURS", "-5")),
            camera_enabled=_bool(env.get("CAMERA_ENABLED"), True),
            camera_id=env.get("CAMERA_ID", "entrada"),
            camera_name=env.get("CAMERA_NAME", "Entrada principal"),
            lpr_config_path=_path(env.get("LPR_CONFIG_PATH", "config/config.yaml")),
            snapshots_dir=_path(env.get("SNAPSHOTS_DIR", "data/snapshots")),
            camera_loop=_bool(env.get("CAMERA_LOOP"), False),
            camera_realtime=_bool(env.get("CAMERA_REALTIME"), True),
            camera_jpeg_quality=int(env.get("CAMERA_JPEG_QUALITY", "75")),
        )
