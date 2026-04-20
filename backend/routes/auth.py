from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.security import hash_password, verify_password, create_access_token, decode_bearer
from backend.models import User  # must have email + password_hash columns

router = APIRouter(prefix="/auth", tags=["Auth (JWT)"])


class AuthPayload(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)

@router.post("/signup")
def signup(body: AuthPayload, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=409, detail="Email already registered")
    user = User(email=body.email, password_hash=hash_password(body.password))
    db.add(user); db.commit(); db.refresh(user)
    token = create_access_token(sub=str(user.id), extra={"email": user.email})
    return {"access_token": token, "token_type": "bearer"}

@router.post("/login")
def login(body: AuthPayload, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_access_token(sub=str(user.id), extra={"email": user.email})
    return {"access_token": token, "token_type": "bearer"}

@router.get("/me")
def me(claims: dict = Depends(decode_bearer)):
    return {"user_id": claims["sub"], "email": claims.get("email")}
