from sqlalchemy import Column, ForeignKey, Integer, String

from app.database import Base


class PortfolioProfileLink(Base):
    __tablename__ = "portfolio_profile_links"

    id = Column(Integer, primary_key=True, index=True)
    portfolio_profile_id = Column(
        Integer, ForeignKey("portfolio_profiles.id"), nullable=False, index=True
    )
    title = Column(String, nullable=False)
    url = Column(String, nullable=True)