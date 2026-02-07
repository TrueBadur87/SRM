import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from dotenv import load_dotenv

load_dotenv()

# Database URL from environment variable
# PostgreSQL format: postgresql://user:password@host:port/dbname
# SQLite format: sqlite:///./recruiting.db
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./recruiting.db")

# Create engine with appropriate settings based on database type
if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},
    )
else:
    # PostgreSQL or other databases
    engine = create_engine(DATABASE_URL)

# SessionLocal is a factory for creating new database sessions.
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for all ORM models. In SQLAlchemy 2.0 the DeclarativeBase provides
# type checking and improved configurability.
class Base(DeclarativeBase):
    pass