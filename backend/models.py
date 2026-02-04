"""
SQLAlchemy models defining the database schema for the recruiting CRM.

This module contains ORM classes for Clients, Recruiters, Vacancies, Candidates,
Applications and Payments. Applications reference a candidate, vacancy and recruiter.
Payments are associated with an application and allow tracking multiple partial
payments. Applications cache the total payment amount and last payment date
for quick access.
"""

from datetime import datetime, date
from sqlalchemy import (
    String,
    Integer,
    Date,
    DateTime,
    Boolean,
    ForeignKey,
    Float,
    Text,
)
from sqlalchemy.orm import relationship, Mapped, mapped_column
from database import Base


class Client(Base):
    """Represents a client company. Each client can have multiple vacancies."""

    __tablename__ = "clients"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, index=True)

    # Backref: list of Vacancies for this client. Cascade deletes orphaned vacancies.
    vacancies = relationship(
        "Vacancy", back_populates="client", cascade="all, delete-orphan"
    )


class Recruiter(Base):
    """Represents a recruiter user in the system."""

    __tablename__ = "recruiters"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, index=True)

    # Backref: list of Applications handled by this recruiter
    applications = relationship("Application", back_populates="recruiter")


class User(Base):
    """Represents an authenticated user account."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(128))
    password_salt: Mapped[str] = mapped_column(String(64))
    role: Mapped[str] = mapped_column(String(20), index=True)  # admin, user
    recruiter_id: Mapped[int | None] = mapped_column(ForeignKey("recruiters.id"), nullable=True, index=True)

    recruiter = relationship("Recruiter")


class Vacancy(Base):
    """Represents an open vacancy at a client company."""

    __tablename__ = "vacancies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id"), index=True)
    title: Mapped[str] = mapped_column(String(180), index=True)
    fee_amount: Mapped[float] = mapped_column(Float, default=0.0)
    city: Mapped[str | None] = mapped_column(String(120), nullable=True)

    # Relationship to parent client
    client = relationship("Client", back_populates="vacancies")
    # Backref: list of Applications associated with this vacancy
    applications = relationship(
        "Application", back_populates="vacancy", cascade="all, delete-orphan"
    )


class Candidate(Base):
    """Represents a candidate applying for vacancies."""

    __tablename__ = "candidates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    full_name: Mapped[str] = mapped_column(String(180), index=True)
    phone: Mapped[str | None] = mapped_column(String(60), nullable=True)
    email: Mapped[str | None] = mapped_column(String(180), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Backref: list of Applications for this candidate
    applications = relationship(
        "Application", back_populates="candidate", cascade="all, delete-orphan"
    )


class Application(Base):
    """
    Represents a candidate's progression on a specific vacancy.

    The application caches payment information via the `paid`, `paid_date` and
    `payment_amount` fields. All individual Payment records are stored in
    the payments table.
    """

    __tablename__ = "applications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    # Foreign keys linking to candidate, vacancy and recruiter
    candidate_id: Mapped[int] = mapped_column(
        ForeignKey("candidates.id"), index=True
    )
    vacancy_id: Mapped[int] = mapped_column(ForeignKey("vacancies.id"), index=True)
    recruiter_id: Mapped[int] = mapped_column(
        ForeignKey("recruiters.id"), index=True
    )

    date_contacted: Mapped[date] = mapped_column(Date, index=True)
    status: Mapped[str] = mapped_column(String(40), index=True)  # new, in_process, rejected, hired

    rejection_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Cached payment fields
    paid: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    paid_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    payment_amount: Mapped[float] = mapped_column(Float, default=0.0)

    # Replacement info
    is_replacement: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    replacement_of_id: Mapped[int | None] = mapped_column(
        ForeignKey("applications.id"), nullable=True
    )
    replacement_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    candidate = relationship("Candidate", back_populates="applications")
    vacancy = relationship("Vacancy", back_populates="applications")
    recruiter = relationship("Recruiter", back_populates="applications")

    # Self-referential relationship for replacement
    replacement_of = relationship(
        "Application", remote_side=[id], uselist=False
    )
    payments = relationship(
        "Payment", back_populates="application", cascade="all, delete-orphan"
    )


class Payment(Base):
    """
    Represents an individual payment made for a hired candidate.
    Multiple payments can be associated with one Application for partial payments.
    """

    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    # Each payment belongs to one application
    application_id: Mapped[int] = mapped_column(
        ForeignKey("applications.id"), index=True
    )
    paid_date: Mapped[date] = mapped_column(Date, index=True)
    amount: Mapped[float] = mapped_column(Float, default=0.0)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    application = relationship("Application", back_populates="payments")
