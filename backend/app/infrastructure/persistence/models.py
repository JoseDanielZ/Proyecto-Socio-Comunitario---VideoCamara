"""Tablas SQLAlchemy. Son detalle de infraestructura: el dominio no las conoce."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base, UTCDateTime


class UserRow(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(120))
    role: Mapped[str] = mapped_column(String(20))
    password_hash: Mapped[str] = mapped_column(String(200))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class VehicleEventRow(Base):
    __tablename__ = "vehicle_events"
    __table_args__ = (Index("ix_vehicle_events_occurred_at", "occurred_at"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    camera_id: Mapped[str] = mapped_column(String(50))
    occurred_at: Mapped[datetime] = mapped_column(UTCDateTime)
    vehicle_type: Mapped[str] = mapped_column(String(20))
    color: Mapped[str | None] = mapped_column(String(30), nullable=True)
    plate_text: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    plate_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    direction: Mapped[str | None] = mapped_column(String(20), nullable=True)
    tracker_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    snapshot_path: Mapped[str | None] = mapped_column(String(300), nullable=True)


class VisitRow(Base):
    __tablename__ = "visits"
    __table_args__ = (Index("ix_visits_entered_at", "entered_at"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    visit_type: Mapped[str] = mapped_column(String(20))
    full_name: Mapped[str] = mapped_column(String(120))
    document_id: Mapped[str | None] = mapped_column(String(30), nullable=True)
    company: Mapped[str | None] = mapped_column(String(80), nullable=True)
    plate: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    vehicle_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    destination: Mapped[str | None] = mapped_column(String(120), nullable=True)
    host_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    entered_at: Mapped[datetime] = mapped_column(UTCDateTime)
    exited_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    registered_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    camera_event_id: Mapped[int | None] = mapped_column(
        ForeignKey("vehicle_events.id"), nullable=True
    )
    match_status: Mapped[str] = mapped_column(String(30), default="not_applicable")


class TicketRow(Base):
    __tablename__ = "tickets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(20))
    priority: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(20), index=True)
    location: Mapped[str | None] = mapped_column(String(120), nullable=True)
    reporter_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    reporter_contact: Mapped[str | None] = mapped_column(String(80), nullable=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    assigned_to: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime)
    resolved_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)

    entries: Mapped[list[TicketEntryRow]] = relationship(
        back_populates="ticket", cascade="all, delete-orphan", order_by="TicketEntryRow.id"
    )


class TicketEntryRow(Base):
    __tablename__ = "ticket_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ticket_id: Mapped[int] = mapped_column(ForeignKey("tickets.id"), index=True)
    kind: Mapped[str] = mapped_column(String(20))
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    from_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    to_status: Mapped[str | None] = mapped_column(String(20), nullable=True)

    ticket: Mapped[TicketRow] = relationship(back_populates="entries")
