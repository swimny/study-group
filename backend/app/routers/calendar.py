import calendar as calendar_module
from datetime import date as date_type

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, field_validator, model_validator
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.database import get_db
from app.models.calendar_event import CalendarEvent, Visibility
from app.models.calendar_event_participant import CalendarEventParticipant, DisplayMode
from app.models.user import User

router = APIRouter(tags=["calendar"])


class CalendarEventCreate(BaseModel):
    title: str
    start_date: date_type
    end_date: date_type | None = None
    visibility: Visibility = Visibility.private

    @field_validator("title")
    @classmethod
    def must_not_be_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("빈 값일 수 없습니다")
        return v

    @model_validator(mode="after")
    def default_end_date(self) -> "CalendarEventCreate":
        if self.end_date is None:
            self.end_date = self.start_date
        if self.end_date < self.start_date:
            raise ValueError("종료일은 시작일보다 빠를 수 없습니다")
        return self


class CalendarEventUpdate(BaseModel):
    title: str | None = None
    start_date: date_type | None = None
    end_date: date_type | None = None
    visibility: Visibility | None = None


class CalendarEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    owner_id: int
    title: str
    start_date: date_type
    end_date: date_type
    visibility: Visibility


@router.get("/calendar-events", response_model=list[CalendarEventOut])
def get_calendar_events(
    year: int,
    month: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    first_day = date_type(year, month, 1)
    last_day = date_type(year, month, calendar_module.monthrange(year, month)[1])

    return (
        db.query(CalendarEvent)
        .filter(
            or_(CalendarEvent.owner_id == current_user.id, CalendarEvent.visibility == Visibility.shared),
            CalendarEvent.start_date <= last_day,
            CalendarEvent.end_date >= first_day,
        )
        .all()
    )


@router.post("/calendar-events", response_model=CalendarEventOut)
def create_calendar_event(
    event: CalendarEventCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    new_event = CalendarEvent(
        owner_id=current_user.id,
        title=event.title,
        start_date=event.start_date,
        end_date=event.end_date,
        visibility=event.visibility,
    )
    db.add(new_event)
    db.commit()
    db.refresh(new_event)
    return new_event


def _get_owned_event(db: Session, current_user: User, event_id: int) -> CalendarEvent:
    event = (
        db.query(CalendarEvent)
        .filter(CalendarEvent.id == event_id, CalendarEvent.owner_id == current_user.id)
        .first()
    )
    if event is None:
        raise HTTPException(status_code=404, detail="일정을 찾을 수 없습니다")
    return event


@router.patch("/calendar-events/{event_id}", response_model=CalendarEventOut)
def update_calendar_event(
    event_id: int,
    body: CalendarEventUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    event = _get_owned_event(db, current_user, event_id)

    if body.title is not None:
        event.title = body.title
    if body.start_date is not None:
        event.start_date = body.start_date
    if body.end_date is not None:
        event.end_date = body.end_date
    if body.visibility is not None:
        event.visibility = body.visibility

    if event.end_date < event.start_date:
        raise HTTPException(status_code=422, detail="종료일은 시작일보다 빠를 수 없습니다")

    db.commit()
    db.refresh(event)
    return event


@router.delete("/calendar-events/{event_id}")
def delete_calendar_event(
    event_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    event = _get_owned_event(db, current_user, event_id)
    db.query(CalendarEventParticipant).filter(
        CalendarEventParticipant.event_id == event_id
    ).delete(synchronize_session=False)
    db.delete(event)
    db.commit()
    return {"message": "deleted"}


class CalendarEventParticipantCreate(BaseModel):
    event_id: int
    show_as_todo: bool = False
    display_mode: DisplayMode | None = None


class CalendarEventParticipantOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    event_id: int
    user_id: int
    show_as_todo: bool
    display_mode: DisplayMode | None
    completed: bool


@router.get("/calendar-event-participants", response_model=list[CalendarEventParticipantOut])
def get_calendar_event_participants(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(CalendarEventParticipant)
        .filter(CalendarEventParticipant.user_id == current_user.id)
        .all()
    )


@router.post("/calendar-event-participants", response_model=CalendarEventParticipantOut)
def create_calendar_event_participant(
    participant: CalendarEventParticipantCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    new_participant = CalendarEventParticipant(
        event_id=participant.event_id,
        user_id=current_user.id,
        show_as_todo=participant.show_as_todo,
        display_mode=participant.display_mode,
    )
    db.add(new_participant)
    db.commit()
    db.refresh(new_participant)
    return new_participant