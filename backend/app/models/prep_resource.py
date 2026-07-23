from sqlalchemy import Column, ForeignKey, Integer, String

from app.database import Base


class PrepResource(Base):
    __tablename__ = "prep_resources"

    id = Column(Integer, primary_key=True, index=True)
    prep_item_id = Column(Integer, ForeignKey("prep_items.id"), nullable=False, index=True)
    title = Column(String, nullable=False)
    url = Column(String, nullable=True)