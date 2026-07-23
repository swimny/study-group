import enum

from sqlalchemy import Column, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.database import Base


class EnrollmentStatus(str, enum.Enum):
    enrolled = "enrolled"
    on_leave = "on_leave"
    graduated = "graduated"
    expected_graduation = "expected_graduation"


class PortfolioProfile(Base):
    __tablename__ = "portfolio_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, unique=True, index=True)
    school = Column(String, nullable=True)
    major = Column(String, nullable=True)
    gpa = Column(String, nullable=True)
    enrollment_status = Column(Enum(EnrollmentStatus), nullable=True)
    intro = Column(Text, nullable=True)

    links = relationship("PortfolioProfileLink", order_by="PortfolioProfileLink.id")