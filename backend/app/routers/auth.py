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
from app.models.coaching_message import CoachingMessage
from app.models.feed_comment import FeedComment
from app.models.feed_post import FeedPost
from app.models.feed_reaction import FeedReaction
from app.models.portfolio_item import PortfolioItem
from app.models.portfolio_link import PortfolioLink
from app.models.portfolio_profile import PortfolioProfile
from app.models.portfolio_profile_link import PortfolioProfileLink
from app.models.prep_checklist_item import PrepChecklistItem
from app.models.prep_item import PrepItem
from app.models.prep_resource import PrepResource
from app.models.todo import Todo
from app.models.todo_category import TodoCategory
from app.models.user import User
from app.models.weekly_goal import WeeklyGoal
from app.models.weekly_report_member_summary import WeeklyReportMemberSummary

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
    # DB에 ON DELETE CASCADE도, SQLAlchemy relationship cascade도 안 씀(FeedPost의
    # comments/reactions 속성을 feed.py에서 수동으로 덮어써서 relationship cascade와 충돌 위험 있음).
    # user_id/author_id로 유저를 참조하는 테이블이 새로 생기면 여기에도 삭제 코드를 추가할 것.
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

    owned_prep_item_ids = [
        prep_item_id
        for (prep_item_id,) in db.query(PrepItem.id).filter(PrepItem.user_id == user_id).all()
    ]
    if owned_prep_item_ids:
        db.query(PrepChecklistItem).filter(
            PrepChecklistItem.prep_item_id.in_(owned_prep_item_ids)
        ).delete(synchronize_session=False)
        db.query(PrepResource).filter(
            PrepResource.prep_item_id.in_(owned_prep_item_ids)
        ).delete(synchronize_session=False)

    owned_portfolio_item_ids = [
        item_id
        for (item_id,) in db.query(PortfolioItem.id).filter(PortfolioItem.user_id == user_id).all()
    ]
    if owned_portfolio_item_ids:
        db.query(PortfolioLink).filter(
            PortfolioLink.portfolio_item_id.in_(owned_portfolio_item_ids)
        ).delete(synchronize_session=False)
        db.query(PortfolioItem).filter(PortfolioItem.user_id == user_id).delete(
            synchronize_session=False
        )

    db.query(PrepItem).filter(PrepItem.user_id == user_id).delete(synchronize_session=False)

    owned_portfolio_profile_ids = [
        profile_id
        for (profile_id,) in db.query(PortfolioProfile.id)
        .filter(PortfolioProfile.user_id == user_id)
        .all()
    ]
    if owned_portfolio_profile_ids:
        db.query(PortfolioProfileLink).filter(
            PortfolioProfileLink.portfolio_profile_id.in_(owned_portfolio_profile_ids)
        ).delete(synchronize_session=False)
        db.query(PortfolioProfile).filter(PortfolioProfile.user_id == user_id).delete(
            synchronize_session=False
        )

    owned_post_ids = [
        post_id for (post_id,) in db.query(FeedPost.id).filter(FeedPost.author_id == user_id).all()
    ]
    if owned_post_ids:
        db.query(FeedComment).filter(FeedComment.post_id.in_(owned_post_ids)).delete(
            synchronize_session=False
        )
        db.query(FeedReaction).filter(FeedReaction.post_id.in_(owned_post_ids)).delete(
            synchronize_session=False
        )
        db.query(FeedPost).filter(FeedPost.id.in_(owned_post_ids)).delete(synchronize_session=False)

    db.query(FeedComment).filter(FeedComment.author_id == user_id).delete(synchronize_session=False)
    db.query(FeedReaction).filter(FeedReaction.user_id == user_id).delete(synchronize_session=False)

    db.query(WeeklyGoal).filter(WeeklyGoal.user_id == user_id).delete(synchronize_session=False)
    db.query(CoachingMessage).filter(CoachingMessage.user_id == user_id).delete(
        synchronize_session=False
    )
    db.query(WeeklyReportMemberSummary).filter(
        WeeklyReportMemberSummary.user_id == user_id
    ).delete(synchronize_session=False)

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