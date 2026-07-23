import enum

from sqlalchemy import Column, Date, DateTime, Enum, ForeignKey, Integer, Text
from sqlalchemy.sql import func

from app.database import Base


class ScreenContext(str, enum.Enum):
    dashboard = "dashboard"
    todos = "todos"
    calendar = "calendar"
    prep_notes = "prep_notes"


class MessageRole(str, enum.Enum):
    assistant = "assistant"
    user = "user"


class CoachingMessage(Base):
    __tablename__ = "coaching_messages"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    screen_context = Column(Enum(ScreenContext), nullable=False, index=True)
    role = Column(Enum(MessageRole), nullable=False)
    content = Column(Text, nullable=False)
    date = Column(Date, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())