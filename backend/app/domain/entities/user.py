from __future__ import annotations

from dataclasses import dataclass

from ..value_objects.enums import Role


@dataclass
class User:
    username: str
    full_name: str
    role: Role
    password_hash: str
    is_active: bool = True
    id: int | None = None
