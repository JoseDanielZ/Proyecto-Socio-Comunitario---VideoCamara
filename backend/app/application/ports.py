"""Puertos de servicios externos que los casos de uso necesitan (implementados en infrastructure)."""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timezone

from ..domain.value_objects.enums import Role

Clock = Callable[[], datetime]


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class PasswordHasher(ABC):
    @abstractmethod
    def hash(self, password: str) -> str: ...

    @abstractmethod
    def verify(self, password: str, password_hash: str) -> bool: ...


@dataclass(frozen=True)
class TokenPayload:
    user_id: int
    role: Role


class TokenService(ABC):
    @abstractmethod
    def issue(self, user_id: int, role: Role) -> str: ...

    @abstractmethod
    def decode(self, token: str) -> TokenPayload:
        """Lanza AuthenticationError si el token es inválido o expiró."""
