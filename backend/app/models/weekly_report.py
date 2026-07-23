from sqlalchemy import Column, Date, DateTime, Integer, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class WeeklyReport(Base):
    __tablename__ = "weekly_reports"

    id = Column(Integer, primary_key=True, index=True)
    week_start_date = Column(Date, nullable=False, unique=True, index=True)
    team_summary = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    member_summaries = relationship(
        "WeeklyReportMemberSummary", order_by="WeeklyReportMemberSummary.id"
    )