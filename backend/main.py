from datetime import date
from pathlib import Path
import base64
import hashlib
import hmac
import json
import os
import secrets
import time

from fastapi import FastAPI, Depends, HTTPException, Query, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import select, func, or_, text

from database import Base, SessionLocal, engine
from models import Client, Recruiter, Vacancy, Candidate, Application, Payment, User
from schemas import (
    ClientCreate, ClientOut,
    ClientUpdate,
    RecruiterCreate, RecruiterOut,
    RecruiterUpdate,
    VacancyCreate, VacancyUpdate, VacancyOut,
    CandidateCreate, CandidateOut,
    ApplicationCreate, ApplicationUpdate, ApplicationOut, ApplicationRow,
    PaymentCreate, PaymentOut,
    EarningsReport, EarningsItem,
    UserCreate, UserUpdate, UserOut, LoginRequest, LoginResponse
)
# Create database tables on startup
Base.metadata.create_all(bind=engine)

# Lightweight migration for the optional vacancy city column (SQLite).
def ensure_vacancy_city_column():
    try:
        with engine.connect() as conn:
            cols = conn.execute(text("PRAGMA table_info(vacancies)")).fetchall()
            has_city = any(row[1] == "city" for row in cols)
            if not has_city:
                conn.execute(text("ALTER TABLE vacancies ADD COLUMN city VARCHAR(120)"))
                conn.commit()
    except Exception:
        # If migration fails, we keep the app running; the column is optional.
        pass

ensure_vacancy_city_column()


app = FastAPI(title="Recruiting CRM", version="1.1")

# Configure CORS so that the React frontend can communicate with this API

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


@app.on_event("startup")
def seed_initial_users():
    db = SessionLocal()
    try:
        # Ensure default recruiters exist
        kim = db.scalar(select(Recruiter).where(Recruiter.name == "Kim"))
        if not kim:
            kim = Recruiter(name="Kim")
            db.add(kim)
            db.commit()
            db.refresh(kim)

        julia = db.scalar(select(Recruiter).where(Recruiter.name == "Julia"))
        if not julia:
            julia = Recruiter(name="Julia")
            db.add(julia)
            db.commit()
            db.refresh(julia)

        # Seed users if missing
        if not db.scalar(select(User).where(User.username == "Kim")):
            salt, hashed = hash_password("12345")
            db.add(User(username="Kim", password_hash=hashed, password_salt=salt, role="admin", recruiter_id=kim.id))
        if not db.scalar(select(User).where(User.username == "Julia")):
            salt, hashed = hash_password("qwerty")
            db.add(User(username="Julia", password_hash=hashed, password_salt=salt, role="user", recruiter_id=julia.id))
        db.commit()
    finally:
        db.close()


@app.get("/health")
def health_check():
    """Simple endpoint to check if the API is running."""
    return {"ok": True}


# ------------------ Helpers ------------------
VALID_STATUSES = {"new", "in_process", "rejected", "hired"}

# ------------------ Auth Helpers ------------------
TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7
TOKEN_SECRET = os.getenv("CRM_TOKEN_SECRET", "change-me-in-production")


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def _sign(message: str) -> str:
    sig = hmac.new(TOKEN_SECRET.encode("utf-8"), message.encode("utf-8"), hashlib.sha256).digest()
    return _b64url_encode(sig)


def create_token(user: User) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "sub": user.id,
        "role": user.role,
        "exp": int(time.time()) + TOKEN_TTL_SECONDS,
    }
    header_b64 = _b64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    payload_b64 = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    message = f"{header_b64}.{payload_b64}"
    sig = _sign(message)
    return f"{message}.{sig}"


def verify_token(token: str) -> dict:
    try:
        header_b64, payload_b64, sig = token.split(".")
    except ValueError:
        raise HTTPException(401, "Invalid token")
    message = f"{header_b64}.{payload_b64}"
    if not hmac.compare_digest(_sign(message), sig):
        raise HTTPException(401, "Invalid token")
    payload = json.loads(_b64url_decode(payload_b64).decode("utf-8"))
    if payload.get("exp", 0) < int(time.time()):
        raise HTTPException(401, "Token expired")
    return payload


def hash_password(password: str, salt: str | None = None) -> tuple[str, str]:
    salt = salt or secrets.token_hex(16)
    hashed = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 120000)
    return salt, hashed.hex()


def verify_password(password: str, salt: str, hashed: str) -> bool:
    _, check = hash_password(password, salt=salt)
    return hmac.compare_digest(check, hashed)


def get_current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing token")
    token = authorization.split(" ", 1)[1].strip()
    payload = verify_token(token)
    user = db.get(User, payload.get("sub"))
    if not user:
        raise HTTPException(401, "User not found")
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(403, "Admin required")
    return user


def ensure_user_recruiter(user: User, recruiter_id: int | None):
    if user.role == "admin":
        return
    if recruiter_id is None or user.recruiter_id != recruiter_id:
        raise HTTPException(403, "Forbidden")


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



# ------------------ Auth Endpoints ------------------
@app.post("/auth/login", response_model=LoginResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.username == payload.username))
    if not user or not verify_password(payload.password, user.password_salt, user.password_hash):
        raise HTTPException(401, "Invalid credentials")
    token = create_token(user)
    return LoginResponse(token=token, user=UserOut.from_orm(user))


@app.get("/auth/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return UserOut.from_orm(user)


# ------------------ User Management (Admin) ------------------
@app.get("/users", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return db.scalars(select(User).order_by(User.username)).all()


@app.post("/users", response_model=UserOut)
def create_user(payload: UserCreate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    if db.scalar(select(User).where(User.username == payload.username)):
        raise HTTPException(400, "Username already exists")
    if payload.role != "admin" and payload.recruiter_id is None:
        raise HTTPException(400, "Recruiter is required for non-admin users")
    if payload.recruiter_id and not db.get(Recruiter, payload.recruiter_id):
        raise HTTPException(400, "Recruiter not found")
    salt, hashed = hash_password(payload.password)
    user = User(
        username=payload.username,
        password_hash=hashed,
        password_salt=salt,
        role=payload.role,
        recruiter_id=payload.recruiter_id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@app.patch("/users/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    data = payload.model_dump(exclude_unset=True)
    if "username" in data and data["username"]:
        exists = db.scalar(select(User).where(User.username == data["username"], User.id != user_id))
        if exists:
            raise HTTPException(400, "Username already exists")
    if "recruiter_id" in data and data["recruiter_id"] is not None:
        if not db.get(Recruiter, data["recruiter_id"]):
            raise HTTPException(400, "Recruiter not found")
    if "role" in data and data["role"] != "admin" and data.get("recruiter_id", user.recruiter_id) is None:
        raise HTTPException(400, "Recruiter is required for non-admin users")
    if "password" in data and data["password"]:
        salt, hashed = hash_password(data["password"])
        user.password_salt = salt
        user.password_hash = hashed
    for key, value in data.items():
        if key == "password":
            continue
        setattr(user, key, value)
    db.commit()
    db.refresh(user)
    return user


@app.delete("/users/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    db.delete(user)
    db.commit()
    return {"deleted": True}


# ------------------ Client Endpoints ------------------
@app.get("/clients", response_model=list[ClientOut])
def list_clients(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return db.scalars(select(Client).order_by(Client.name)).all()


@app.post("/clients", response_model=ClientOut)
def create_client(payload: ClientCreate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    if db.scalar(select(Client).where(Client.name == payload.name)):
        raise HTTPException(400, "Client name already exists")
    client = Client(name=payload.name)
    db.add(client)
    db.commit()
    db.refresh(client)
    return client


@app.delete("/clients/{client_id}")
def delete_client(client_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    client = db.get(Client, client_id)
    if not client:
        raise HTTPException(404, "Client not found")
    db.delete(client)
    db.commit()
    return {"deleted": True}


@app.patch("/clients/{client_id}", response_model=ClientOut)
def update_client(client_id: int, payload: ClientUpdate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    client = db.get(Client, client_id)
    if not client:
        raise HTTPException(404, "Client not found")
    exists = db.scalar(select(Client).where(Client.name == payload.name, Client.id != client_id))
    if exists:
        raise HTTPException(400, "Client name already exists")
    client.name = payload.name
    db.commit()
    db.refresh(client)
    return client


# ------------------ Recruiter Endpoints ------------------
@app.get("/recruiters", response_model=list[RecruiterOut])
def list_recruiters(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role != "admin":
        if not user.recruiter_id:
            return []
        recruiter = db.get(Recruiter, user.recruiter_id)
        return [recruiter] if recruiter else []
    return db.scalars(select(Recruiter).order_by(Recruiter.name)).all()


@app.post("/recruiters", response_model=RecruiterOut)
def create_recruiter(payload: RecruiterCreate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    if db.scalar(select(Recruiter).where(Recruiter.name == payload.name)):
        raise HTTPException(400, "Recruiter name already exists")
    recruiter = Recruiter(name=payload.name)
    db.add(recruiter)
    db.commit()
    db.refresh(recruiter)
    return recruiter


@app.delete("/recruiters/{recruiter_id}")
def delete_recruiter(recruiter_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    recruiter = db.get(Recruiter, recruiter_id)
    if not recruiter:
        raise HTTPException(404, "Recruiter not found")
    db.delete(recruiter)
    db.commit()
    return {"deleted": True}


@app.patch("/recruiters/{recruiter_id}", response_model=RecruiterOut)
def update_recruiter(recruiter_id: int, payload: RecruiterUpdate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    recruiter = db.get(Recruiter, recruiter_id)
    if not recruiter:
        raise HTTPException(404, "Recruiter not found")
    exists = db.scalar(select(Recruiter).where(Recruiter.name == payload.name, Recruiter.id != recruiter_id))
    if exists:
        raise HTTPException(400, "Recruiter name already exists")
    recruiter.name = payload.name
    db.commit()
    db.refresh(recruiter)
    return recruiter


# ------------------ Vacancy Endpoints ------------------
@app.get("/vacancies", response_model=list[VacancyOut])
def list_vacancies(
    client_id: int | None = None, db: Session = Depends(get_db), _: User = Depends(get_current_user)
) -> list[VacancyOut]:
    stmt = select(Vacancy).order_by(Vacancy.title)
    if client_id is not None:
        stmt = stmt.where(Vacancy.client_id == client_id)
    return db.scalars(stmt).all()


@app.post("/vacancies", response_model=VacancyOut)
def create_vacancy(payload: VacancyCreate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    if not db.get(Client, payload.client_id):
        raise HTTPException(400, "Client not found")
    vacancy = Vacancy(
        client_id=payload.client_id,
        title=payload.title,
        fee_amount=payload.fee_amount or 0.0,
        city=payload.city,
    )
    db.add(vacancy)
    db.commit()
    db.refresh(vacancy)
    return vacancy


@app.delete("/vacancies/{vacancy_id}")
def delete_vacancy(vacancy_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    vacancy = db.get(Vacancy, vacancy_id)
    if not vacancy:
        raise HTTPException(404, "Vacancy not found")
    db.delete(vacancy)
    db.commit()
    return {"deleted": True}


@app.patch("/vacancies/{vacancy_id}", response_model=VacancyOut)
def update_vacancy(vacancy_id: int, payload: VacancyUpdate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    vacancy = db.get(Vacancy, vacancy_id)
    if not vacancy:
        raise HTTPException(404, "Vacancy not found")
    data = payload.model_dump(exclude_unset=True)
    if "client_id" in data and data["client_id"] is not None:
        if not db.get(Client, data["client_id"]):
            raise HTTPException(400, "Client not found")
    for key, value in data.items():
        setattr(vacancy, key, value)
    db.commit()
    db.refresh(vacancy)
    return vacancy


# ------------------ Candidate Endpoints ------------------
@app.get("/candidates", response_model=list[CandidateOut])
def list_candidates(q: str | None = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    stmt = select(Candidate)
    if user.role != "admin":
        if not user.recruiter_id:
            return []
        stmt = stmt.join(Application, Candidate.id == Application.candidate_id).where(
            Application.recruiter_id == user.recruiter_id
        )
    stmt = stmt.order_by(Candidate.full_name).distinct()
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
def create_candidate(payload: CandidateCreate, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    candidate = Candidate(**payload.model_dump())
    db.add(candidate)
    db.commit()
    db.refresh(candidate)
    return candidate


# ------------------ Application Endpoints ------------------
@app.post("/applications", response_model=ApplicationOut)
def create_application(payload: ApplicationCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    # Validate foreign keys
    if not db.get(Candidate, payload.candidate_id):
        raise HTTPException(400, "Candidate not found")
    vacancy = db.get(Vacancy, payload.vacancy_id)
    if not vacancy:
        raise HTTPException(400, "Vacancy not found")
    if not db.get(Recruiter, payload.recruiter_id):
        raise HTTPException(400, "Recruiter not found")
    ensure_user_recruiter(user, payload.recruiter_id)

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
    app_id: int, payload: ApplicationUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    application = db.get(Application, app_id)
    if not application:
        raise HTTPException(404, "Application not found")
    ensure_user_recruiter(user, application.recruiter_id)
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(application, key, value)

    enforce_dates_for_status(application.status, application.rejection_date, application.start_date)

    db.commit()
    db.refresh(application)
    return application


@app.delete("/applications/{app_id}")
def delete_application(app_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    application = db.get(Application, app_id)
    if not application:
        raise HTTPException(404, "Application not found")
    ensure_user_recruiter(user, application.recruiter_id)
    db.delete(application)
    db.commit()
    return {"deleted": True}


# ------------------ Payment Endpoints ------------------
@app.get("/applications/{app_id}/payments", response_model=list[PaymentOut])
def list_payments(app_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    app = db.get(Application, app_id)
    if not app:
        raise HTTPException(404, "Application not found")
    ensure_user_recruiter(user, app.recruiter_id)
    return db.scalars(
        select(Payment)
        .where(Payment.application_id == app_id)
        .order_by(Payment.paid_date.desc(), Payment.created_at.desc())
    ).all()


@app.post("/applications/{app_id}/payments", response_model=PaymentOut)
def add_payment(app_id: int, payload: PaymentCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    app = db.get(Application, app_id)
    if not app:
        raise HTTPException(404, "Application not found")
    ensure_user_recruiter(user, app.recruiter_id)
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
def delete_payment(payment_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    payment = db.get(Payment, payment_id)
    if not payment:
        raise HTTPException(404, "Payment not found")
    app_id = payment.application_id
    app = db.get(Application, app_id)
    if not app:
        raise HTTPException(404, "Application not found")
    ensure_user_recruiter(user, app.recruiter_id)
    db.delete(payment)
    db.commit()
    recompute_payment_cache(db, app_id)
    return {"deleted": True}


# ------------------ Pipeline Endpoint ------------------
@app.get("/pipeline", response_model=list[ApplicationRow])
def get_pipeline(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
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
    if user.role != "admin":
        recruiter_id = user.recruiter_id
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
def earnings_report(year: int, month: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
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
    if user.role != "admin":
        if not user.recruiter_id:
            return EarningsReport(year=year, month=month, total=0.0, items=[])
        stmt = stmt.where(Recruiter.id == user.recruiter_id)

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