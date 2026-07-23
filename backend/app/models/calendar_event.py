import enum

from sqlalchemy import Column, Date, Enum, ForeignKey, Integer, String

from app.database import Base


class Visibility(str, enum.Enum):
    private = "private"
    shared = "shared"


class CalendarEvent(Base):
    __tablename__ = "calendar_events"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String, nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    visibility = Column(Enum(Visibility), nullable=False, default=Visibility.private)