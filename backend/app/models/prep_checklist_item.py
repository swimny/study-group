from sqlalchemy import Boolean, Column, ForeignKey, Integer, String

from app.database import Base


class PrepChecklistItem(Base):
    __tablename__ = "prep_checklist_items"

    id = Column(Integer, primary_key=True, index=True)
    prep_item_id = Column(Integer, ForeignKey("prep_items.id"), nullable=False, index=True)
    content = Column(String, nullable=False)
    completed = Column(Boolean, nullable=False, default=False)