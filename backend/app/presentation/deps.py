from __future__ import annotations

from collections.abc import Callable

from fastapi import Depends, Query, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from ..container import Container
from ..domain.entities.user import User
from ..domain.errors import AuthenticationError, PermissionDeniedError
from ..domain.value_objects.enums import Role

_bearer = HTTPBearer(auto_error=False)


def get_container(request: Request) -> Container:
    return request.app.state.container


def current_user(
    container: Container = Depends(get_container),
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    access_token: str | None = Query(default=None, include_in_schema=False),
) -> User:
    """Token en la cabecera Authorization, o en ?access_token= para <img>/<video> que no
    pueden enviar cabeceras (video en vivo y fotos)."""
    token = credentials.credentials if credentials else access_token
    if not token:
        raise AuthenticationError("Falta iniciar sesión")
    return container.auth.authenticate(token)


def require_roles(*roles: Role) -> Callable[[User], User]:
    def dependency(user: User = Depends(current_user)) -> User:
        if user.role not in roles:
            raise PermissionDeniedError("No tienes permiso para esta acción")
        return user

    return dependency


any_staff = require_roles(Role.ADMIN, Role.GUARD)
admin_only = require_roles(Role.ADMIN)
