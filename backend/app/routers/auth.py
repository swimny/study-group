import jwt
from fastapi import APIRouter, Cookie, Depends, HTTPException, Response
from pydantic import BaseModel, ConfigDict, field_validator
from sqlalchemy.orm import Session

from app.core.security import (
    create_gate_token,
    create_session_token,
    decode_token,
    hash_profile_password,
    verify_profile_password,
    verify_shared_password,
)
from app.database import get_db
from app.models.calendar_event import CalendarEvent
from app.models.calendar_event_participant import CalendarEventParticipant
from app.models.todo import Todo
from app.models.todo_category import TodoCategory
from app.models.user import User

router = APIRouter(prefix="/auth", tags=["auth"])

GATE_COOKIE = "gate_token"
SESSION_COOKIE = "session_token"


def require_gate(gate_token: str | None = Cookie(default=None)) -> None:
    if gate_token is None:
        raise HTTPException(status_code=401, detail="비밀번호 확인이 필요합니다")

    try:
        payload = decode_token(gate_token)
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="유효하지 않은 토큰입니다")

    if payload.get("type") != "gate":
        raise HTTPException(status_code=401, detail="잘못된 토큰 종류입니다")


def set_session_cookie(response: Response, user: User) -> None:
    token = create_session_token(user.id, user.token_version)
    response.set_cookie(
        key=SESSION_COOKIE,
        value=token,
        httponly=True,
        samesite="lax",
        max_age=30 * 24 * 60 * 60,
    )


class LoginRequest(BaseModel):
    password: str


@router.post("/login")
def login(body: LoginRequest, response: Response):
    if not verify_shared_password(body.password):
        raise HTTPException(status_code=401, detail="비밀번호가 틀렸습니다")

    token = create_gate_token()
    response.set_cookie(
        key=GATE_COOKIE,
        value=token,
        httponly=True,
        samesite="lax",
        max_age=5 * 60,
    )
    return {"message": "ok"}


class ProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


@router.get("/profiles", response_model=list[ProfileOut], dependencies=[Depends(require_gate)])
def get_profiles(db: Session = Depends(get_db)):
    return db.query(User).all()


class ProfileCreateRequest(BaseModel):
    name: str
    password: str

    @field_validator("name", "password")
    @classmethod
    def must_not_be_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("빈 값일 수 없습니다")
        return v


@router.post(
    "/profiles",
    response_model=ProfileOut,
    dependencies=[Depends(require_gate)],
)
def create_profile(
    body: ProfileCreateRequest, response: Response, db: Session = Depends(get_db)
):
    new_user = User(
        name=body.name,
        profile_password_hash=hash_profile_password(body.password),
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    set_session_cookie(response, new_user)
    return new_user


class ProfileRenameRequest(BaseModel):
    new_name: str
    password: str

    @field_validator("new_name", "password")
    @classmethod
    def must_not_be_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("빈 값일 수 없습니다")
        return v


@router.patch(
    "/profiles/{user_id}",
    response_model=ProfileOut,
    dependencies=[Depends(require_gate)],
)
def rename_profile(user_id: int, body: ProfileRenameRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=404, detail="존재하지 않는 프로필입니다")
    if not verify_profile_password(body.password, user.profile_password_hash):
        raise HTTPException(status_code=403, detail="비밀번호가 틀렸습니다")

    user.name = body.new_name
    db.commit()
    db.refresh(user)
    return user


class ProfileDeleteRequest(BaseModel):
    password: str


@router.delete("/profiles/{user_id}", dependencies=[Depends(require_gate)])
def delete_profile(user_id: int, body: ProfileDeleteRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=404, detail="존재하지 않는 프로필입니다")
    if not verify_profile_password(body.password, user.profile_password_hash):
        raise HTTPException(status_code=403, detail="비밀번호가 틀렸습니다")

    owned_event_ids = [
        event_id
        for (event_id,) in db.query(CalendarEvent.id).filter(CalendarEvent.owner_id == user_id).all()
    ]
    if owned_event_ids:
        db.query(CalendarEventParticipant).filter(
            CalendarEventParticipant.event_id.in_(owned_event_ids)
        ).delete(synchronize_session=False)
        db.query(CalendarEvent).filter(CalendarEvent.id.in_(owned_event_ids)).delete(
            synchronize_session=False
        )

    db.query(CalendarEventParticipant).filter(
        CalendarEventParticipant.user_id == user_id
    ).delete(synchronize_session=False)
    db.query(Todo).filter(Todo.user_id == user_id).delete(synchronize_session=False)
    db.query(TodoCategory).filter(TodoCategory.user_id == user_id).delete(synchronize_session=False)
    db.delete(user)
    db.commit()
    return {"message": "deleted"}


class SelectProfileRequest(BaseModel):
    user_id: int


@router.post("/select-profile", dependencies=[Depends(require_gate)])
def select_profile(body: SelectProfileRequest, response: Response, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == body.user_id).first()
    if user is None:
        raise HTTPException(status_code=404, detail="존재하지 않는 프로필입니다")

    set_session_cookie(response, user)
    return {"message": "ok"}