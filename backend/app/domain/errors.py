"""Errores del dominio. La capa de presentación los traduce a códigos HTTP."""


class DomainError(Exception):
    pass


class NotFoundError(DomainError):
    pass


class ValidationError(DomainError):
    pass


class ConflictError(DomainError):
    pass


class InvalidTransitionError(ConflictError):
    pass


class AuthenticationError(DomainError):
    pass


class PermissionDeniedError(DomainError):
    pass
