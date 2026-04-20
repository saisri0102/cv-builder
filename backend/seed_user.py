# backend/seed_user.py
from backend.database import SessionLocal
from backend.models import User
from backend.utils.passwords import hash_password

db = SessionLocal()

email = "harishsure45@gmail.com"
password = "Hari123"

# check if already exists
existing = db.query(User).filter_by(email=email).first()
if existing:
    print(f"User {email} already exists.")
else:
    user = User(
        email=email,
        password_hash=hash_password(password),
        # verified removed, as it's not in User model
    )
    db.add(user)
    db.commit()
    print(f"✅ Seeded test user {email} with password {password}")

db.close()
