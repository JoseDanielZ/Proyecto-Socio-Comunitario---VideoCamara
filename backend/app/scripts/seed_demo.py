"""Crea usuarios (y opcionalmente datos de ejemplo) para arrancar el sistema.

    cd backend
    python -m app.scripts.seed_demo            # solo usuarios
    python -m app.scripts.seed_demo --demo     # + tickets y visitas de ejemplo

Contraseñas de ejemplo: admin / admin123 y guardia1 / guardia123. CAMBIARLAS antes de usar en serio.
"""

from __future__ import annotations

import argparse
from dataclasses import replace

from ..application.tickets.service import NewTicket
from ..application.visits.service import NewVisit
from ..config import Settings
from ..container import build_container
from ..domain.errors import ConflictError
from ..domain.value_objects.enums import (
    Role,
    TicketCategory,
    TicketPriority,
    TicketStatus,
    VehicleType,
    VisitType,
)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--demo", action="store_true", help="agrega tickets y visitas de ejemplo")
    parser.add_argument("--admin-password", default="admin123")
    parser.add_argument("--guard-password", default="guardia123")
    args = parser.parse_args()

    # Sin motor de visión: el seed solo necesita la base de datos.
    container = build_container(replace(Settings.from_env(), camera_enabled=False))

    users = {}
    for username, full_name, role, password in [
        ("admin", "Administración", Role.ADMIN, args.admin_password),
        ("guardia1", "Guardia turno día", Role.GUARD, args.guard_password),
        ("guardia2", "Guardia turno noche", Role.GUARD, args.guard_password),
    ]:
        try:
            users[username] = container.auth.create_user(username, full_name, role, password)
            print(f"Usuario creado: {username} ({role.value})")
        except ConflictError:
            users[username] = next(u for u in container.auth.list_users() if u.username == username)
            print(f"Usuario ya existía: {username}")

    if not args.demo:
        return

    admin, guard = users["admin"], users["guardia1"]
    t1 = container.tickets.create(
        guard,
        NewTicket("Foco quemado en pasillo", "El pasillo de la torre 2 está sin luz desde ayer.",
                  TicketCategory.MAINTENANCE, TicketPriority.HIGH, "Torre 2", "Sra. López"),
    )
    container.tickets.assign(t1.id, admin.id, admin)
    container.tickets.change_status(t1.id, TicketStatus.IN_PROGRESS, admin)
    container.tickets.add_comment(t1.id, "Ya se pidió el repuesto.", admin)
    container.tickets.create(
        admin,
        NewTicket("Fuga de agua en área común", "Sale agua junto a la piscina.",
                  TicketCategory.DAMAGE, TicketPriority.URGENT, "Piscina", "Sr. Vallejo"),
    )
    container.tickets.create(
        guard,
        NewTicket("Ruido después de las 22:00", "Música fuerte en la casa 14.",
                  TicketCategory.NOISE, TicketPriority.LOW, "Casa 14"),
    )
    container.visits.register_entry(
        guard, NewVisit(VisitType.VISITOR, "Ana Torres", destination="Casa 2", host_name="Fam. Ruiz")
    )
    container.visits.register_entry(
        guard,
        NewVisit(VisitType.DELIVERY, "Carlos Pérez", company="Uber", plate="PBA-1234",
                 vehicle_type=VehicleType.MOTORCYCLE, destination="Casa 5"),
    )
    print("Datos de ejemplo creados (3 tickets, 2 visitas).")


if __name__ == "__main__":
    main()
