import enum

from sqlalchemy import Boolean, Column, Enum, ForeignKey, Integer, UniqueConstraint

from app.database import Base


class DisplayMode(str, enum.Enum):
    daily = "daily"
    day_of = "day_of"


class CalendarEventParticipant(Base):
    __tablename__ = "calendar_event_participants"
    __table_args__ = (UniqueConstraint("event_id", "user_id"),)

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("calendar_events.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    show_as_todo = Column(Boolean, nullable=False, default=False)
    display_mode = Column(Enum(DisplayMode), nullable=True)
    completed = Column(Boolean, nullable=False, default=False)