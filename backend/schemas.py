"""
Pydantic schemas used for request and response validation in the API.

This module defines schemas for clients, recruiters, vacancies, candidates,
applications, payments and reports. Pydantic's BaseModel is used to
validate data both in incoming requests and outgoing responses. Some
schemas represent only the common input fields while others include the
database generated fields (e.g. id, created_at).
"""

from datetime import date, datetime
from pydantic import BaseModel, Field

__all__ = [
    "ClientCreate",
    "ClientUpdate",
    "ClientOut",
    "RecruiterCreate",
    "RecruiterUpdate",
    "RecruiterOut",
    "VacancyCreate",
    "VacancyUpdate",
    "VacancyOut",
    "CandidateCreate",
    "CandidateOut",
    "ApplicationCreate",
    "ApplicationUpdate",
    "ApplicationOut",
    "PaymentCreate",
    "PaymentOut",
    "ApplicationRow",
    "EarningsItem",
    "EarningsReport",
    "UserCreate",
    "UserUpdate",
    "UserOut",
    "LoginRequest",
    "LoginResponse",
]


# ------------------ Clients ------------------
class ClientBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class ClientCreate(ClientBase):
    pass


class ClientUpdate(ClientBase):
    pass


class ClientOut(ClientBase):
    id: int

    class Config:
        from_attributes = True


# ------------------ Recruiters ------------------
class RecruiterBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class RecruiterCreate(RecruiterBase):
    pass


class RecruiterUpdate(RecruiterBase):
    pass


class RecruiterOut(RecruiterBase):
    id: int

    class Config:
        from_attributes = True


# ------------------ Vacancies ------------------
class VacancyBase(BaseModel):
    client_id: int
    title: str = Field(min_length=1, max_length=180)
    fee_amount: float = 0.0
    city: str | None = Field(default=None, max_length=120)


class VacancyCreate(VacancyBase):
    pass


class VacancyUpdate(BaseModel):
    client_id: int | None = None
    title: str | None = Field(default=None, max_length=180)
    fee_amount: float | None = None
    city: str | None = Field(default=None, max_length=120)


class VacancyOut(VacancyBase):
    id: int

    class Config:
        from_attributes = True


# ------------------ Candidates ------------------
class CandidateBase(BaseModel):
    full_name: str = Field(min_length=1, max_length=180)
    phone: str | None = None
    email: str | None = None
    notes: str | None = None


class CandidateCreate(CandidateBase):
    pass


class CandidateOut(CandidateBase):
    id: int

    class Config:
        from_attributes = True


# ------------------ Applications ------------------
class ApplicationBase(BaseModel):
    candidate_id: int
    vacancy_id: int
    recruiter_id: int
    date_contacted: date
    status: str = Field(default="new")  # new, in_process, rejected, hired

    rejection_date: date | None = None
    start_date: date | None = None

    # Optional quick payment creation on application creation
    paid: bool = False
    paid_date: date | None = None
    payment_amount: float = 0.0

    # Replacement fields
    is_replacement: bool = False
    replacement_of_id: int | None = None
    replacement_note: str | None = None


class ApplicationCreate(ApplicationBase):
    pass


class ApplicationUpdate(BaseModel):
    date_contacted: date | None = None
    status: str | None = None
    rejection_date: date | None = None
    start_date: date | None = None

    is_replacement: bool | None = None
    replacement_of_id: int | None = None
    replacement_note: str | None = None


class ApplicationOut(BaseModel):
    id: int
    candidate_id: int
    vacancy_id: int
    recruiter_id: int

    date_contacted: date
    status: str
    rejection_date: date | None
    start_date: date | None

    paid: bool
    paid_date: date | None
    payment_amount: float

    is_replacement: bool
    replacement_of_id: int | None
    replacement_note: str | None

    created_at: datetime

    class Config:
        from_attributes = True


# ------------------ Payments ------------------
class PaymentCreate(BaseModel):
    paid_date: date
    amount: float = Field(ge=0)
    note: str | None = None


class PaymentOut(BaseModel):
    id: int
    application_id: int
    paid_date: date
    amount: float
    note: str | None
    created_at: datetime

    class Config:
        from_attributes = True


# ------------------ Aggregated Application Row ------------------
class ApplicationRow(BaseModel):
    id: int
    date_contacted: date
    status: str
    rejection_date: date | None
    start_date: date | None
    paid: bool
    paid_date: date | None
    payment_amount: float

    is_replacement: bool
    replacement_of_id: int | None
    replacement_note: str | None

    candidate_id: int
    candidate_name: str

    recruiter_id: int
    recruiter_name: str

    vacancy_id: int
    vacancy_title: str
    vacancy_fee: float

    client_id: int
    client_name: str


# ------------------ Earnings Report ------------------
class EarningsItem(BaseModel):
    payment_id: int
    paid_date: date
    amount: float
    candidate_name: str
    client_name: str
    vacancy_title: str
    recruiter_name: str
    application_id: int


class EarningsReport(BaseModel):
    year: int
    month: int
    total: float
    items: list[EarningsItem]


# ------------------ Users / Auth ------------------
class UserBase(BaseModel):
    username: str = Field(min_length=1, max_length=120)
    role: str = Field(default="user", max_length=20)
    recruiter_id: int | None = None


class UserCreate(UserBase):
    password: str = Field(min_length=4, max_length=120)


class UserUpdate(BaseModel):
    username: str | None = Field(default=None, max_length=120)
    role: str | None = Field(default=None, max_length=20)
    recruiter_id: int | None = None
    password: str | None = Field(default=None, max_length=120)


class UserOut(UserBase):
    id: int

    class Config:
        from_attributes = True


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    token: str
    user: UserOut
