from datetime import date as date_type
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, field_validator
from sqlalchemy.orm import Session

from app.core.gemini_client import generate_text
from app.core.security import get_current_user
from app.database import get_db
from app.models.calendar_event import CalendarEvent, Visibility
from app.models.coaching_message import CoachingMessage, MessageRole, ScreenContext
from app.models.prep_item import PrepItem
from app.models.todo import Todo
from app.models.user import User

router = APIRouter(tags=["coaching"])

SYSTEM_PROMPT = (
    "너는 취업 준비 스터디그룹 앱의 코칭 캐릭터야. "
    "사용자의 오늘 상황을 짧고 친근한 한두 문장으로 코멘트해줘. "
    "이모지는 최대 1개만 쓰고, 너무 길게 말하지 마."
)


def _to_utc_iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def _current_streak(db: Session, user_id: int, today: date_type) -> int:
    completed_dates = {
        row[0]
        for row in db.query(Todo.date)
        .filter(Todo.user_id == user_id, Todo.completed.is_(True))
        .distinct()
        .all()
    }
    if not completed_dates:
        return 0
    streak = 0
    cursor = today if today in completed_dates else today - timedelta(days=1)
    while cursor in completed_dates:
        streak += 1
        cursor -= timedelta(days=1)
    return streak


def _build_context_summary(
    db: Session, user: User, screen_context: ScreenContext, today: date_type
) -> str:
    if screen_context == ScreenContext.dashboard:
        todos = db.query(Todo).filter(Todo.user_id == user.id, Todo.date == today).all()
        completed = sum(1 for t in todos if t.completed)
        streak = _current_streak(db, user.id, today)
        return f"오늘 할일 {completed}/{len(todos)}개 완료. 현재 연속 스트릭 {streak}일."

    if screen_context == ScreenContext.todos:
        todos = db.query(Todo).filter(Todo.user_id == user.id, Todo.date == today).all()
        remaining = [t.title for t in todos if not t.completed]
        if not remaining:
            return "오늘 할일을 전부 완료함."
        return f"오늘 남은 할일: {', '.join(remaining)}"

    if screen_context == ScreenContext.calendar:
        events = (
            db.query(CalendarEvent)
            .filter(
                CalendarEvent.start_date >= today,
                (CalendarEvent.owner_id == user.id)
                | (CalendarEvent.visibility == Visibility.shared),
            )
            .order_by(CalendarEvent.start_date)
            .limit(3)
            .all()
        )
        if not events:
            return "다가오는 일정 없음."
        return "다가오는 일정: " + ", ".join(f"{e.title}({e.start_date})" for e in events)

    if screen_context == ScreenContext.prep_notes:
        items = (
            db.query(PrepItem)
            .filter(PrepItem.user_id == user.id, PrepItem.completed.is_(False))
            .all()
        )
        if not items:
            return "진행 중인 준비노트 항목 없음."
        return "진행 중인 준비노트: " + ", ".join(item.title for item in items)

    return ""


class CoachingMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    role: MessageRole
    content: str
    created_at: str


@router.get("/coaching-messages", response_model=list[CoachingMessageOut])
def get_coaching_messages(
    screen_context: ScreenContext,
    date: date_type,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    existing = (
        db.query(CoachingMessage)
        .filter(
            CoachingMessage.user_id == current_user.id,
            CoachingMessage.screen_context == screen_context,
            CoachingMessage.date == date,
        )
        .order_by(CoachingMessage.created_at)
        .all()
    )

    has_greeting = any(m.role == MessageRole.assistant for m in existing)
    if not has_greeting:
        context_summary = _build_context_summary(db, current_user, screen_context, date)
        prompt = f"{SYSTEM_PROMPT}\n\n상황: {context_summary}"
        content = generate_text(prompt)
        greeting = CoachingMessage(
            user_id=current_user.id,
            screen_context=screen_context,
            role=MessageRole.assistant,
            content=content,
            date=date,
        )
        db.add(greeting)
        db.commit()
        db.refresh(greeting)
        existing.append(greeting)

    return [
        CoachingMessageOut(
            id=m.id, role=m.role, content=m.content, created_at=_to_utc_iso(m.created_at)
        )
        for m in existing
    ]


class ChatCreate(BaseModel):
    screen_context: ScreenContext
    date: date_type
    content: str

    @field_validator("content")
    @classmethod
    def _not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("빈 값일 수 없습니다")
        return v


@router.post("/coaching-messages", response_model=CoachingMessageOut)
def send_coaching_message(
    body: ChatCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user_message = CoachingMessage(
        user_id=current_user.id,
        screen_context=body.screen_context,
        role=MessageRole.user,
        content=body.content,
        date=body.date,
    )
    db.add(user_message)
    db.commit()

    history = (
        db.query(CoachingMessage)
        .filter(
            CoachingMessage.user_id == current_user.id,
            CoachingMessage.screen_context == body.screen_context,
            CoachingMessage.date == body.date,
        )
        .order_by(CoachingMessage.created_at)
        .all()
    )
    conversation = "\n".join(
        f"{'사용자' if m.role == MessageRole.user else '캐릭터'}: {m.content}" for m in history
    )
    prompt = f"{SYSTEM_PROMPT}\n\n지금까지 대화:\n{conversation}\n\n캐릭터의 다음 대답만 출력해:"
    reply_content = generate_text(prompt)

    reply = CoachingMessage(
        user_id=current_user.id,
        screen_context=body.screen_context,
        role=MessageRole.assistant,
        content=reply_content,
        date=body.date,
    )
    db.add(reply)
    db.commit()
    db.refresh(reply)

    return CoachingMessageOut(
        id=reply.id,
        role=reply.role,
        content=reply.content,
        created_at=_to_utc_iso(reply.created_at),
    )