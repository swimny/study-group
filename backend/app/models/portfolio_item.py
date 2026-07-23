import enum

from sqlalchemy import Column, Date, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class PortfolioItemType(str, enum.Enum):
    certification = "certification"
    project = "project"
    experience = "experience"
    award = "award"
    other = "other"


class PortfolioItem(Base):
    __tablename__ = "portfolio_items"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String, nullable=False)
    item_type = Column(Enum(PortfolioItemType), nullable=False, default=PortfolioItemType.other)
    description = Column(Text, nullable=True)
    achieved_date = Column(Date, nullable=True)
    source_prep_item_id = Column(Integer, ForeignKey("prep_items.id"), nullable=True, index=True)
    position = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    links = relationship("PortfolioLink", order_by="PortfolioLink.id")