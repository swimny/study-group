from sqlalchemy import Column, ForeignKey, Integer, Text

from app.database import Base


class WeeklyReportMemberSummary(Base):
    __tablename__ = "weekly_report_member_summaries"

    id = Column(Integer, primary_key=True, index=True)
    weekly_report_id = Column(
        Integer, ForeignKey("weekly_reports.id"), nullable=False, index=True
    )
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    summary = Column(Text, nullable=False)