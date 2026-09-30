from __future__ import annotations

from fastapi import APIRouter, Depends

from ...container import Container
from ...domain.entities.user import User
from ..deps import admin_only, current_user, get_container
from ..schemas.dto import LoginIn, TokenOut, UserCreate, UserOut, UserUpdate

router = APIRouter(tags=["Autenticación y usuarios"])


@router.post("/auth/login", response_model=TokenOut)
def login(body: LoginIn, container: Container = Depends(get_container)) -> TokenOut:
    result = container.auth.login(body.username, body.password)
    return TokenOut(access_token=result.access_token, user=UserOut.of(result.user))


@router.get("/auth/me", response_model=UserOut)
def me(user: User = Depends(current_user)) -> UserOut:
    return UserOut.of(user)


@router.get("/users", response_model=list[UserOut])
def list_users(
    _: User = Depends(admin_only), container: Container = Depends(get_container)
) -> list[UserOut]:
    return [UserOut.of(u) for u in container.auth.list_users()]


@router.post("/users", response_model=UserOut, status_code=201)
def create_user(
    body: UserCreate, _: User = Depends(admin_only), container: Container = Depends(get_container)
) -> UserOut:
    return UserOut.of(container.auth.create_user(body.username, body.full_name, body.role, body.password))


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    body: UserUpdate,
    _: User = Depends(admin_only),
    container: Container = Depends(get_container),
) -> UserOut:
    return UserOut.of(container.auth.update_user(user_id, **body.model_dump(exclude_unset=True)))
