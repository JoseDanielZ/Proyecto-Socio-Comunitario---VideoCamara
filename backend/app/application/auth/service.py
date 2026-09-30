from __future__ import annotations

from dataclasses import dataclass

from ...domain.entities.user import User
from ...domain.errors import AuthenticationError, ConflictError, NotFoundError, ValidationError
from ...domain.repositories.ports import UserRepository
from ...domain.value_objects.enums import Role
from ..ports import PasswordHasher, TokenService

MIN_PASSWORD_LENGTH = 6


@dataclass(frozen=True)
class LoginResult:
    access_token: str
    user: User


class AuthService:
    def __init__(self, users: UserRepository, hasher: PasswordHasher, tokens: TokenService):
        self._users = users
        self._hasher = hasher
        self._tokens = tokens

    def login(self, username: str, password: str) -> LoginResult:
        user = self._users.get_by_username(username.strip().lower())
        # Mismo error para usuario inexistente o clave mala: no revelar cuál falló.
        if user is None or not user.is_active or not self._hasher.verify(password, user.password_hash):
            raise AuthenticationError("Usuario o contraseña incorrectos")
        return LoginResult(self._tokens.issue(user.id, user.role), user)

    def authenticate(self, token: str) -> User:
        payload = self._tokens.decode(token)
        user = self._users.get(payload.user_id)
        if user is None or not user.is_active:
            raise AuthenticationError("Sesión inválida")
        return user

    def create_user(self, username: str, full_name: str, role: Role, password: str) -> User:
        username = username.strip().lower()
        if not username or not full_name.strip():
            raise ValidationError("Usuario y nombre son obligatorios")
        self._check_password(password)
        if self._users.get_by_username(username) is not None:
            raise ConflictError(f"El usuario '{username}' ya existe")
        return self._users.add(
            User(username, full_name.strip(), role, self._hasher.hash(password))
        )

    def list_users(self) -> list[User]:
        return self._users.list()

    def update_user(
        self,
        user_id: int,
        *,
        full_name: str | None = None,
        role: Role | None = None,
        is_active: bool | None = None,
        password: str | None = None,
    ) -> User:
        user = self._users.get(user_id)
        if user is None:
            raise NotFoundError("Usuario no encontrado")
        if full_name is not None:
            user.full_name = full_name.strip()
        if role is not None:
            user.role = role
        if is_active is not None:
            user.is_active = is_active
        if password is not None:
            self._check_password(password)
            user.password_hash = self._hasher.hash(password)
        return self._users.update(user)

    @staticmethod
    def _check_password(password: str) -> None:
        if len(password) < MIN_PASSWORD_LENGTH:
            raise ValidationError(f"La contraseña debe tener al menos {MIN_PASSWORD_LENGTH} caracteres")
