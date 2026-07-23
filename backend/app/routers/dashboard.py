from datetime import date as date_type, datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.database import get_db
from app.models.portfolio_item import PortfolioItem, PortfolioItemType
from app.models.todo import Todo
from app.models.user import User

router = APIRouter(tags=["dashboard"])


def _to_utc_iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


class StreakOut(BaseModel):
    current_streak: int
    longest_streak: int


def _calculate_streak(db: Session, user_id: int, today: date_type) -> StreakOut:
    completed_dates = {
        row[0]
        for row in db.query(Todo.date)
        .filter(Todo.user_id == user_id, Todo.completed.is_(True))
        .distinct()
        .all()
    }

    if not completed_dates:
        return StreakOut(current_streak=0, longest_streak=0)

    current_streak = 0
    cursor = today if today in completed_dates else today - timedelta(days=1)
    while cursor in completed_dates:
        current_streak += 1
        cursor -= timedelta(days=1)

    longest_streak = 0
    run = 0
    prev = None
    for d in sorted(completed_dates):
        run = run + 1 if prev is not None and d == prev + timedelta(days=1) else 1
        longest_streak = max(longest_streak, run)
        prev = d

    longest_streak = max(longest_streak, current_streak)

    return StreakOut(current_streak=current_streak, longest_streak=longest_streak)


@router.get("/dashboard/streak", response_model=StreakOut)
def get_streak(
    today: date_type,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return _calculate_streak(db, current_user.id, today)


class HeatmapDay(BaseModel):
    date: date_type
    completed: bool


@router.get("/dashboard/activity-heatmap", response_model=list[HeatmapDay])
def get_activity_heatmap(
    end_date: date_type,
    days: int = 84,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    start_date = end_date - timedelta(days=days - 1)
    completed_dates = {
        row[0]
        for row in db.query(Todo.date)
        .filter(
            Todo.user_id == current_user.id,
            Todo.completed.is_(True),
            Todo.date >= start_date,
            Todo.date <= end_date,
        )
        .distinct()
        .all()
    }

    return [
        HeatmapDay(
            date=start_date + timedelta(days=i),
            completed=(start_date + timedelta(days=i)) in completed_dates,
        )
        for i in range(days)
    ]


class TeamProgressEntry(BaseModel):
    user_id: int
    name: str
    completed: int
    total: int


@router.get("/dashboard/team-progress", response_model=list[TeamProgressEntry])
def get_team_progress(
    date: date_type,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    users = db.query(User).all()
    todos = db.query(Todo).filter(Todo.date == date).all()

    todos_by_user: dict[int, list[Todo]] = {}
    for todo in todos:
        todos_by_user.setdefault(todo.user_id, []).append(todo)

    return [
        TeamProgressEntry(
            user_id=user.id,
            name=user.name,
            completed=sum(1 for t in todos_by_user.get(user.id, []) if t.completed),
            total=len(todos_by_user.get(user.id, [])),
        )
        for user in users
    ]


class RecentPortfolioActivity(BaseModel):
    id: int
    user_id: int
    author_name: str
    title: str
    item_type: PortfolioItemType
    achieved_date: date_type | None
    created_at: str


@router.get("/dashboard/recent-portfolio-activity", response_model=list[RecentPortfolioActivity])
def get_recent_portfolio_activity(
    limit: int = 5,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    users_by_id = {u.id: u for u in db.query(User).all()}
    items = db.query(PortfolioItem).order_by(PortfolioItem.created_at.desc()).limit(limit).all()

    return [
        RecentPortfolioActivity(
            id=item.id,
            user_id=item.user_id,
            author_name=users_by_id[item.user_id].name,
            title=item.title,
            item_type=item.item_type,
            achieved_date=item.achieved_date,
            created_at=_to_utc_iso(item.created_at),
        )
        for item in items
    ]