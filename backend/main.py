

from datetime import date
from pathlib import Path
from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import select, func, or_

from database import SessionLocal, engine
from database import Base
from models import Client, Recruiter, Vacancy, Candidate, Application, Payment
from schemas import (
    ClientCreate, ClientOut,
    RecruiterCreate, RecruiterOut,
    VacancyCreate, VacancyOut,
    CandidateCreate, CandidateOut,
    ApplicationCreate, ApplicationUpdate, ApplicationOut, ApplicationRow,
    PaymentCreate, PaymentOut,
    EarningsReport, EarningsItem
)



# Create database tables on startup
Base.metadata.create_all(bind=engine)


app = FastAPI(title="Recruiting CRM", version="1.1")

# Configure CORS so that the React frontend can communicate with this API
import os

# Detect if running on Render.com or other production environment
is_production = os.getenv("RENDER") is not None or os.getenv("PORT") is not None

if is_production:
    # In production, frontend is served from the same domain, so we allow all
    # Note: allow_credentials must be False when using allow_origins=["*"]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    # In development, allow specific local origins with credentials
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:5173", "http://127.0.0.1:5173",
            "http://localhost:15000", "http://127.0.0.1:15000"
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# Mount static files from frontend/dist
FRONTEND_DIST = Path(__file__).parent.parent / "frontend" / "dist"
if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="assets")


# Dependency that provides a database session per request
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Seed initial clients on startup if none exist
@app.on_event("startup")
def seed_initial_clients():
    db = SessionLocal()
    try:
        count = db.scalar(select(func.count()).select_from(Client))
        if count == 0:
            db.add_all(
                [Client(name="Client A"), Client(name="Client B"), Client(name="Client C")]
            )
            db.commit()
    finally:
        db.close()


@app.get("/health")
def health_check():
    """Simple endpoint to check if the API is running."""
    return {"ok": True}


# ------------------ Helpers ------------------
VALID_STATUSES = {"new", "in_process", "rejected", "hired"}


def enforce_dates_for_status(status: str, rejection_date: date | None, start_date: date | None):
    """
    Validate that the appropriate dates are supplied for the given status.
    If the status is 'rejected', a rejection_date is required.
    If the status is 'hired', a start_date is required.
    """
    if status not in VALID_STATUSES:
        raise HTTPException(400, f"Invalid status: {status}")
    if status == "rejected" and rejection_date is None:
        raise HTTPException(400, "For status 'rejected' rejection_date is required")
    if status == "hired" and start_date is None:
        raise HTTPException(400, "For status 'hired' start_date is required")


def recompute_payment_cache(db: Session, app_id: int):
    """
    Recalculate the cached payment fields for an application.
    Total payment amount and last payment date are derived from the associated
    Payment records. The Application.paid flag is set to True if the sum > 0.
    """
    total = db.scalar(
        select(func.coalesce(func.sum(Payment.amount), 0.0)).where(
            Payment.application_id == app_id
        )
    )
    last_date = db.scalar(
        select(func.max(Payment.paid_date)).where(Payment.application_id == app_id)
    )
    app = db.get(Application, app_id)
    if app is None:
        return
    app.payment_amount = float(total or 0.0)
    app.paid_date = last_date
    app.paid = app.payment_amount > 0
    db.commit()


# ------------------ Client Endpoints ------------------
@app.get("/clients", response_model=list[ClientOut])
def list_clients(db: Session = Depends(get_db)):
    return db.scalars(select(Client).order_by(Client.name)).all()


@app.post("/clients", response_model=ClientOut)
def create_client(payload: ClientCreate, db: Session = Depends(get_db)):
    if db.scalar(select(Client).where(Client.name == payload.name)):
        raise HTTPException(400, "Client name already exists")
    client = Client(name=payload.name)
    db.add(client)
    db.commit()
    db.refresh(client)
    return client


@app.delete("/clients/{client_id}")
def delete_client(client_id: int, db: Session = Depends(get_db)):
    client = db.get(Client, client_id)
    if not client:
        raise HTTPException(404, "Client not found")
    db.delete(client)
    db.commit()
    return {"deleted": True}


# ------------------ Recruiter Endpoints ------------------
@app.get("/recruiters", response_model=list[RecruiterOut])
def list_recruiters(db: Session = Depends(get_db)):
    return db.scalars(select(Recruiter).order_by(Recruiter.name)).all()


@app.post("/recruiters", response_model=RecruiterOut)
def create_recruiter(payload: RecruiterCreate, db: Session = Depends(get_db)):
    if db.scalar(select(Recruiter).where(Recruiter.name == payload.name)):
        raise HTTPException(400, "Recruiter name already exists")
    recruiter = Recruiter(name=payload.name)
    db.add(recruiter)
    db.commit()
    db.refresh(recruiter)
    return recruiter


@app.delete("/recruiters/{recruiter_id}")
def delete_recruiter(recruiter_id: int, db: Session = Depends(get_db)):
    recruiter = db.get(Recruiter, recruiter_id)
    if not recruiter:
        raise HTTPException(404, "Recruiter not found")
    db.delete(recruiter)
    db.commit()
    return {"deleted": True}


# ------------------ Vacancy Endpoints ------------------
@app.get("/vacancies", response_model=list[VacancyOut])
def list_vacancies(
    client_id: int | None = None, db: Session = Depends(get_db)
) -> list[VacancyOut]:
    stmt = select(Vacancy).order_by(Vacancy.title)
    if client_id is not None:
        stmt = stmt.where(Vacancy.client_id == client_id)
    return db.scalars(stmt).all()


@app.post("/vacancies", response_model=VacancyOut)
def create_vacancy(payload: VacancyCreate, db: Session = Depends(get_db)):
    if not db.get(Client, payload.client_id):
        raise HTTPException(400, "Client not found")
    vacancy = Vacancy(
        client_id=payload.client_id,
        title=payload.title,
        fee_amount=payload.fee_amount or 0.0,
    )
    db.add(vacancy)
    db.commit()
    db.refresh(vacancy)
    return vacancy


@app.delete("/vacancies/{vacancy_id}")
def delete_vacancy(vacancy_id: int, db: Session = Depends(get_db)):
    vacancy = db.get(Vacancy, vacancy_id)
    if not vacancy:
        raise HTTPException(404, "Vacancy not found")
    db.delete(vacancy)
    db.commit()
    return {"deleted": True}


# ------------------ Candidate Endpoints ------------------
@app.get("/candidates", response_model=list[CandidateOut])
def list_candidates(q: str | None = None, db: Session = Depends(get_db)):
    stmt = select(Candidate).order_by(Candidate.full_name)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                Candidate.full_name.ilike(like),
                Candidate.phone.ilike(like),
                Candidate.email.ilike(like),
            )
        )
    return db.scalars(stmt).all()


@app.post("/candidates", response_model=CandidateOut)
def create_candidate(payload: CandidateCreate, db: Session = Depends(get_db)):
    candidate = Candidate(**payload.model_dump())
    db.add(candidate)
    db.commit()
    db.refresh(candidate)
    return candidate


# ------------------ Application Endpoints ------------------
@app.post("/applications", response_model=ApplicationOut)
def create_application(payload: ApplicationCreate, db: Session = Depends(get_db)):
    # Validate foreign keys
    if not db.get(Candidate, payload.candidate_id):
        raise HTTPException(400, "Candidate not found")
    vacancy = db.get(Vacancy, payload.vacancy_id)
    if not vacancy:
        raise HTTPException(400, "Vacancy not found")
    if not db.get(Recruiter, payload.recruiter_id):
        raise HTTPException(400, "Recruiter not found")

    # Validate dates for status
    enforce_dates_for_status(payload.status, payload.rejection_date, payload.start_date)

    # Create the application
    application = Application(
        candidate_id=payload.candidate_id,
        vacancy_id=payload.vacancy_id,
        recruiter_id=payload.recruiter_id,
        date_contacted=payload.date_contacted,
        status=payload.status,
        rejection_date=payload.rejection_date,
        start_date=payload.start_date,
        is_replacement=payload.is_replacement,
        replacement_of_id=payload.replacement_of_id,
        replacement_note=payload.replacement_note,
    )
    db.add(application)
    db.commit()
    db.refresh(application)

    # Optionally create an initial payment when the application is created
    if payload.paid and payload.paid_date:
        amount = (
            payload.payment_amount
            if payload.payment_amount and payload.payment_amount > 0
            else float(vacancy.fee_amount or 0.0)
        )
        payment = Payment(
            application_id=application.id,
            paid_date=payload.paid_date,
            amount=float(amount),
            note="initial payment",
        )
        db.add(payment)
        db.commit()
        recompute_payment_cache(db, application.id)
        db.refresh(application)

    return application


@app.patch("/applications/{app_id}", response_model=ApplicationOut)
def update_application(
    app_id: int, payload: ApplicationUpdate, db: Session = Depends(get_db)
):
    application = db.get(Application, app_id)
    if not application:
        raise HTTPException(404, "Application not found")
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(application, key, value)

    enforce_dates_for_status(application.status, application.rejection_date, application.start_date)

    db.commit()
    db.refresh(application)
    return application


@app.delete("/applications/{app_id}")
def delete_application(app_id: int, db: Session = Depends(get_db)):
    application = db.get(Application, app_id)
    if not application:
        raise HTTPException(404, "Application not found")
    db.delete(application)
    db.commit()
    return {"deleted": True}


# ------------------ Payment Endpoints ------------------
@app.get("/applications/{app_id}/payments", response_model=list[PaymentOut])
def list_payments(app_id: int, db: Session = Depends(get_db)):
    if not db.get(Application, app_id):
        raise HTTPException(404, "Application not found")
    return db.scalars(
        select(Payment)
        .where(Payment.application_id == app_id)
        .order_by(Payment.paid_date.desc(), Payment.created_at.desc())
    ).all()


@app.post("/applications/{app_id}/payments", response_model=PaymentOut)
def add_payment(app_id: int, payload: PaymentCreate, db: Session = Depends(get_db)):
    if not db.get(Application, app_id):
        raise HTTPException(404, "Application not found")
    payment = Payment(
        application_id=app_id,
        paid_date=payload.paid_date,
        amount=float(payload.amount),
        note=payload.note,
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)
    recompute_payment_cache(db, app_id)
    return payment


@app.delete("/payments/{payment_id}")
def delete_payment(payment_id: int, db: Session = Depends(get_db)):
    payment = db.get(Payment, payment_id)
    if not payment:
        raise HTTPException(404, "Payment not found")
    app_id = payment.application_id
    db.delete(payment)
    db.commit()
    recompute_payment_cache(db, app_id)
    return {"deleted": True}


# ------------------ Pipeline Endpoint ------------------
@app.get("/pipeline", response_model=list[ApplicationRow])
def get_pipeline(
    db: Session = Depends(get_db),
    client_id: int | None = None,
    recruiter_id: int | None = None,
    status: str | None = None,
    search: str | None = None,
    limit: int = Query(default=500, ge=1, le=2000),
):
    """
    Returns flattened application rows for the pipeline view with optional filters.
    This endpoint joins the application with candidate, recruiter, vacancy and client
    to return a single row with all necessary information for the UI.
    """
    stmt = (
        select(
            Application.id,
            Application.date_contacted,
            Application.status,
            Application.rejection_date,
            Application.start_date,
            Application.paid,
            Application.paid_date,
            Application.payment_amount,
            Application.is_replacement,
            Application.replacement_of_id,
            Application.replacement_note,

            Candidate.id.label("candidate_id"),
            Candidate.full_name.label("candidate_name"),

            Recruiter.id.label("recruiter_id"),
            Recruiter.name.label("recruiter_name"),

            Vacancy.id.label("vacancy_id"),
            Vacancy.title.label("vacancy_title"),
            Vacancy.fee_amount.label("vacancy_fee"),

            Client.id.label("client_id"),
            Client.name.label("client_name"),
        )
        .join(Candidate, Candidate.id == Application.candidate_id)
        .join(Recruiter, Recruiter.id == Application.recruiter_id)
        .join(Vacancy, Vacancy.id == Application.vacancy_id)
        .join(Client, Client.id == Vacancy.client_id)
        .order_by(Application.created_at.desc())
        .limit(limit)
    )

    if client_id is not None:
        stmt = stmt.where(Client.id == client_id)
    if recruiter_id is not None:
        stmt = stmt.where(Recruiter.id == recruiter_id)
    if status is not None:
        stmt = stmt.where(Application.status == status)
    if search:
        like = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                Candidate.full_name.ilike(like),
                Vacancy.title.ilike(like),
                Client.name.ilike(like),
                Recruiter.name.ilike(like),
            )
        )

    rows = db.execute(stmt).all()
    return [ApplicationRow(**row._asdict()) for row in rows]


# ------------------ Earnings Report Endpoint ------------------
@app.get("/reports/earnings", response_model=EarningsReport)
def earnings_report(year: int, month: int, db: Session = Depends(get_db)):
    """
    Returns a monthly earnings report, summing payments by paid_date.
    The start and end boundaries are inclusive/exclusive on month boundaries.
    """
    if month < 1 or month > 12:
        raise HTTPException(400, "month must be 1..12")
    start = date(year, month, 1)
    end = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)

    stmt = (
        select(
            Payment.id.label("payment_id"),
            Payment.paid_date,
            Payment.amount.label("amount"),
            Candidate.full_name.label("candidate_name"),
            Client.name.label("client_name"),
            Vacancy.title.label("vacancy_title"),
            Recruiter.name.label("recruiter_name"),
            Application.id.label("application_id"),
        )
        .join(Application, Application.id == Payment.application_id)
        .join(Candidate, Candidate.id == Application.candidate_id)
        .join(Recruiter, Recruiter.id == Application.recruiter_id)
        .join(Vacancy, Vacancy.id == Application.vacancy_id)
        .join(Client, Client.id == Vacancy.client_id)
        .where(Payment.paid_date >= start)
        .where(Payment.paid_date < end)
        .order_by(Payment.paid_date.desc(), Payment.created_at.desc())
    )

    rows = db.execute(stmt).all()
    items: list[EarningsItem] = []
    total = 0.0
    for row in rows:
        data = row._asdict()
        total += float(data["amount"] or 0.0)
        items.append(EarningsItem(**data))

    return EarningsReport(year=year, month=month, total=round(total, 2), items=items)


# ------------------ Frontend Routes ------------------
@app.get("/")
def serve_frontend():
    """Serve the main frontend application."""
    index_file = FRONTEND_DIST / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return {"error": "Frontend not built"}