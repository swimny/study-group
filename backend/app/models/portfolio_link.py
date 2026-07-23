from sqlalchemy import Column, ForeignKey, Integer, String

from app.database import Base


class PortfolioLink(Base):
    __tablename__ = "portfolio_links"

    id = Column(Integer, primary_key=True, index=True)
    portfolio_item_id = Column(Integer, ForeignKey("portfolio_items.id"), nullable=False, index=True)
    title = Column(String, nullable=False)
    url = Column(String, nullable=True)