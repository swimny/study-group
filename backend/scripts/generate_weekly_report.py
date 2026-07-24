"""매주 일요일 밤 실행되는 주간 리포트 생성 스크립트.

팀원별 요약을 먼저 생성하고, 그 요약들을 모아 팀 전체 요약을 생성해 저장한다.
같은 주(week_start_date)에 대해 다시 실행하면 기존 리포트를 지우고 재생성한다(테스트/재시도 용도).

실행: cd backend && python scripts/generate_weekly_report.py
"""

import sys
from datetime import date, datetime, timedelta
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parent.parent))

from app.core.gemini_client import generate_text
from app.database import Base, SessionLocal, engine
from app.models.portfolio_item import PortfolioItem
from app.models.portfolio_link import PortfolioLink  # noqa: F401 (relationship string resolution)
from app.models.portfolio_profile_link import PortfolioProfileLink  # noqa: F401
from app.models.prep_checklist_item import PrepChecklistItem  # noqa: F401
from app.models.prep_item import PrepItem
from app.models.prep_resource import PrepResource  # noqa: F401
from app.models.todo import Todo
from app.models.user import User
from app.models.weekly_goal import WeeklyGoal
from app.models.weekly_report import WeeklyReport
from app.models.weekly_report_member_summary import WeeklyReportMemberSummary

MEMBER_SYSTEM_PROMPT = (
    "너는 취업 준비 스터디그룹 앱의 주간 리포트 작성자야. "
    "아래 '이번 주 활동'만 근거로, 한 팀원에 대한 격려형 요약을 2~3문장으로 써줘. "
    "활동이 없으면 그 사실을 담담하게 언급하고 부담 주지 않는 톤으로 짧게 마무리해. "
    "숫자를 부풀리거나 없는 활동을 지어내지 마."
)

TEAM_SYSTEM_PROMPT = (
    "너는 취업 준비 스터디그룹 앱의 주간 리포트 작성자야. "
    "아래는 이번 주 팀원별 요약이야. 이걸 바탕으로 팀 전체를 향한 격려형 총평을 3~4문장으로 써줘. "
    "팀원 개개인을 비교하거나 순위 매기지 말고, 팀 전체 분위기를 북돋는 톤으로 써줘."
)


def _week_start(today: date) -> date:
    return today - timedelta(days=today.weekday())


def _build_member_context(db, user: User, week_start: date, week_end: date) -> str:
    todos = (
        db.query(Todo)
        .filter(Todo.user_id == user.id, Todo.date >= week_start, Todo.date <= week_end)
        .all()
    )
    goals = (
        db.query(WeeklyGoal)
        .filter(WeeklyGoal.user_id == user.id, WeeklyGoal.week_start_date == week_start)
        .all()
    )
    portfolio_items = (
        db.query(PortfolioItem)
        .filter(
            PortfolioItem.user_id == user.id,
            PortfolioItem.achieved_date >= week_start,
            PortfolioItem.achieved_date <= week_end,
        )
        .all()
    )
    prep_items = (
        db.query(PrepItem)
        .filter(
            PrepItem.user_id == user.id,
            PrepItem.completed.is_(True),
            PrepItem.completed_at >= datetime.combine(week_start, datetime.min.time()),
            PrepItem.completed_at < datetime.combine(week_end + timedelta(days=1), datetime.min.time()),
        )
        .all()
    )

    if not todos and not goals and not portfolio_items and not prep_items:
        return "이번 주 활동 없음."

    lines = []
    if todos:
        completed = sum(1 for t in todos if t.completed)
        lines.append(f"할일 {completed}/{len(todos)}개 완료")
    if goals:
        completed_goals = sum(1 for g in goals if g.completed)
        lines.append(f"주간 목표 {completed_goals}/{len(goals)}개 완료")
    if portfolio_items:
        lines.append("새 포트폴리오 성과: " + ", ".join(p.title for p in portfolio_items))
    if prep_items:
        lines.append("이번 주 완료한 준비노트 항목: " + ", ".join(p.title for p in prep_items))

    return " / ".join(lines)


def main() -> None:
    Base.metadata.create_all(bind=engine)

    today = date.today()
    week_start = _week_start(today)
    week_end = week_start + timedelta(days=6)

    db = SessionLocal()
    try:
        existing = (
            db.query(WeeklyReport).filter(WeeklyReport.week_start_date == week_start).first()
        )
        if existing is not None:
            db.query(WeeklyReportMemberSummary).filter(
                WeeklyReportMemberSummary.weekly_report_id == existing.id
            ).delete()
            db.delete(existing)
            db.commit()

        users = db.query(User).order_by(User.id).all()
        member_summaries: list[tuple[User, str]] = []
        for user in users:
            context = _build_member_context(db, user, week_start, week_end)
            prompt = f"{MEMBER_SYSTEM_PROMPT}\n\n팀원: {user.name}\n이번 주 활동: {context}"
            summary = generate_text(prompt)
            member_summaries.append((user, summary))

        team_prompt = TEAM_SYSTEM_PROMPT + "\n\n" + "\n".join(
            f"- {user.name}: {summary}" for user, summary in member_summaries
        )
        team_summary = generate_text(team_prompt)

        report = WeeklyReport(week_start_date=week_start, team_summary=team_summary)
        db.add(report)
        db.commit()
        db.refresh(report)

        for user, summary in member_summaries:
            db.add(
                WeeklyReportMemberSummary(
                    weekly_report_id=report.id, user_id=user.id, summary=summary
                )
            )
        db.commit()

        print(f"주간 리포트 생성 완료: {week_start} ~ {week_end} ({len(users)}명)")
    finally:
        db.close()


if __name__ == "__main__":
    main()