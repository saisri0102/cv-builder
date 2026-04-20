# backend/database.py
from sqlalchemy import create_engine
from sqlalchemy.engine.url import make_url
from sqlalchemy.orm import sessionmaker, declarative_base

from backend.config import DATABASE_URL, SQL_ECHO

url = make_url(DATABASE_URL)

connect_args = {}
# Required for SQLite when used with FastAPI/threads
if url.drivername.startswith("sqlite"):
    connect_args["check_same_thread"] = False

engine = create_engine(
    DATABASE_URL,
    echo=SQL_ECHO,
    connect_args=connect_args,
    pool_pre_ping=True,  # avoid stale connections on resume
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
