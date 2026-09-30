from __future__ import annotations

from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from ...application.ports import PasswordHasher, TokenPayload, TokenService
from ...domain.errors import AuthenticationError
from ...domain.value_objects.enums import Role


class BcryptPasswordHasher(PasswordHasher):
    def hash(self, password: str) -> str:
        return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("ascii")

    def verify(self, password: str, password_hash: str) -> bool:
        try:
            return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("ascii"))
        except ValueError:  # hash mal formado
            return False


class JwtTokenService(TokenService):
    ALGORITHM = "HS256"

    def __init__(self, secret: str, expires_minutes: int = 720):
        self._secret = secret
        self._expires = timedelta(minutes=expires_minutes)

    def issue(self, user_id: int, role: Role) -> str:
        now = datetime.now(timezone.utc)
        payload = {"sub": str(user_id), "role": role.value, "iat": now, "exp": now + self._expires}
        return jwt.encode(payload, self._secret, algorithm=self.ALGORITHM)

    def decode(self, token: str) -> TokenPayload:
        try:
            data = jwt.decode(token, self._secret, algorithms=[self.ALGORITHM])
            return TokenPayload(int(data["sub"]), Role(data["role"]))
        except (jwt.PyJWTError, KeyError, ValueError) as exc:
            raise AuthenticationError("Sesión inválida o expirada") from exc
