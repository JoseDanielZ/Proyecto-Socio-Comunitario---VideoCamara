from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .application.cameras.service import CameraGateway
from .config import Settings
from .container import Container, build_container
from .domain import errors
from .presentation.routers import auth_users, cameras, dashboard, tickets, visits

logger = logging.getLogger(__name__)

_STATUS_BY_ERROR: list[tuple[type[errors.DomainError], int]] = [
    # de lo más específico a lo más general
    (errors.AuthenticationError, 401),
    (errors.PermissionDeniedError, 403),
    (errors.NotFoundError, 404),
    (errors.ConflictError, 409),  # incluye InvalidTransitionError
    (errors.ValidationError, 422),
    (errors.DomainError, 400),
]


def create_app(
    settings: Settings | None = None, camera_gateway: CameraGateway | None = None
) -> FastAPI:
    settings = settings or Settings.from_env()
    container: Container = build_container(settings, camera_gateway)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        if container.camera_runtime is not None:
            container.camera_runtime.start()
        yield
        if container.camera_runtime is not None:
            container.camera_runtime.stop()

    app = FastAPI(
        title="Sistema del conjunto",
        description="Cámaras y placas, visitas/deliveries y tickets de mantenimiento.",
        version="0.1.0",
        lifespan=lifespan,
    )
    app.state.container = container
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(errors.DomainError)
    async def domain_error_handler(_: Request, exc: errors.DomainError) -> JSONResponse:
        status = next(code for cls, code in _STATUS_BY_ERROR if isinstance(exc, cls))
        headers = {"WWW-Authenticate": "Bearer"} if status == 401 else None
        return JSONResponse({"detail": str(exc)}, status_code=status, headers=headers)

    for router in (auth_users.router, cameras.router, visits.router, tickets.router, dashboard.router):
        app.include_router(router, prefix="/api")

    @app.get("/api/health", tags=["Sistema"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app
