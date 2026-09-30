from __future__ import annotations

import re
from dataclasses import dataclass

from ..errors import ValidationError

_NON_ALNUM = re.compile(r"[^A-Z0-9]")
MIN_LENGTH, MAX_LENGTH = 4, 10

# Confusiones típicas de OCR (letra <-> dígito) que se ignoran al comparar placas.
_OCR_CONFUSABLE = str.maketrans({"O": "0", "Q": "0", "I": "1", "S": "5", "B": "8", "Z": "2"})


def normalize(raw: str) -> str:
    return _NON_ALNUM.sub("", raw.upper())


def levenshtein(a: str, b: str) -> int:
    if a == b:
        return 0
    previous = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        current = [i]
        for j, cb in enumerate(b, 1):
            current.append(min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (ca != cb)))
        previous = current
    return previous[-1]


@dataclass(frozen=True)
class Plate:
    """Placa normalizada (mayúsculas, solo letras y dígitos): 'abc-1234' -> 'ABC1234'."""

    value: str

    def __post_init__(self) -> None:
        if not MIN_LENGTH <= len(self.value) <= MAX_LENGTH or self.value != normalize(self.value):
            raise ValidationError(
                f"Placa inválida: debe tener entre {MIN_LENGTH} y {MAX_LENGTH} letras/dígitos"
            )

    @classmethod
    def parse(cls, raw: str | None) -> Plate | None:
        """Entrada manual: None si viene vacía, error si es inválida."""
        if raw is None or not normalize(raw):
            return None
        return cls(normalize(raw))

    @classmethod
    def try_parse(cls, raw: str | None) -> Plate | None:
        """Lectura de cámara: una lectura basura del OCR se trata como 'sin placa'."""
        try:
            return cls.parse(raw)
        except ValidationError:
            return None

    def similar_to(self, other: Plate, tolerance: int = 1) -> bool:
        a = self.value.translate(_OCR_CONFUSABLE)
        b = other.value.translate(_OCR_CONFUSABLE)
        return levenshtein(a, b) <= tolerance

    def __str__(self) -> str:
        return self.value
