import enum

from sqlalchemy import Boolean, Column, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class PrepItemType(str, enum.Enum):
    cert = "cert"
    company = "company"
    other = "other"


class PrepItem(Base):
    __tablename__ = "prep_items"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String, nullable=False)
    item_type = Column(Enum(PrepItemType), nullable=False, default=PrepItemType.other)
    notes = Column(Text, nullable=True)
    completed = Column(Boolean, nullable=False, default=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    position = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    checklist_items = relationship("PrepChecklistItem", order_by="PrepChecklistItem.id")
    resources = relationship("PrepResource", order_by="PrepResource.id")
