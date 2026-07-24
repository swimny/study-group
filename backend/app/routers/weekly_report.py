from datetime import date as date_type

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.database import get_db
from app.models.user import User
from app.models.weekly_report import WeeklyReport
from app.models.weekly_report_member_summary import (  # noqa: F401 (relationship string resolution)
    WeeklyReportMemberSummary,
)

router = APIRouter(tags=["weekly-reports"])


class WeeklyReportMemberSummaryOut(BaseModel):
    user_id: int
    user_name: str
    summary: str


class WeeklyReportOut(BaseModel):
    week_start_date: date_type
    team_summary: str
    member_summaries: list[WeeklyReportMemberSummaryOut]


@router.get("/weekly-reports/latest", response_model=WeeklyReportOut)
def get_latest_weekly_report(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    report = (
        db.query(WeeklyReport).order_by(WeeklyReport.week_start_date.desc()).first()
    )
    if report is None:
        raise HTTPException(status_code=404, detail="아직 생성된 주간 리포트가 없습니다")

    users_by_id = {user.id: user for user in db.query(User).all()}

    return WeeklyReportOut(
        week_start_date=report.week_start_date,
        team_summary=report.team_summary,
        member_summaries=[
            WeeklyReportMemberSummaryOut(
                user_id=summary.user_id,
                user_name=users_by_id[summary.user_id].name,
                summary=summary.summary,
            )
            for summary in report.member_summaries
        ],
    )