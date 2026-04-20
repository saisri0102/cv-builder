# backend/init_db.py
from backend.database import engine, Base
from backend.models import Feedback, Resume

def init():
    print("Creating tables...")
    Base.metadata.create_all(bind=engine)
    print("✅ Tables created successfully!")

if __name__ == "__main__":
    init()
