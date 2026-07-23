import os
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Cookie, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User

SECRET_KEY = os.getenv("JWT_SECRET_KEY")
ALGORITHM = "HS256"
GATE_TOKEN_EXPIRE_MINUTES = 5
SESSION_TOKEN_EXPIRE_DAYS = 30


def verify_shared_password(password: str) -> bool:
    stored_hash = os.getenv("APP_PASSWORD_HASH")
    return bcrypt.checkpw(password.encode(), stored_hash.encode())


def hash_profile_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_profile_password(password: str, stored_hash: str) -> bool:
    return bcrypt.checkpw(password.encode(), stored_hash.encode())


def create_gate_token() -> str:
    payload = {
        "type": "gate",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=GATE_TOKEN_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def create_session_token(user_id: int, token_version: int) -> str:
    payload = {
        "type": "session",
        "user_id": user_id,
        "token_version": token_version,
        "exp": datetime.now(timezone.utc) + timedelta(days=SESSION_TOKEN_EXPIRE_DAYS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])


def get_current_user(
    session_token: str | None = Cookie(default=None),
    db: Session = Depends(get_db),
) -> User:
    if session_token is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다")

    try:
        payload = decode_token(session_token)
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="유효하지 않은 토큰입니다")

    if payload.get("type") != "session":
        raise HTTPException(status_code=401, detail="잘못된 토큰 종류입니다")

    user = db.query(User).filter(User.id == payload["user_id"]).first()
    if user is None or user.token_version != payload["token_version"]:
        raise HTTPException(status_code=401, detail="세션이 만료되었습니다")

    return user