from datetime import date as date_type

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, field_validator
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.database import get_db
from app.models.user import User
from app.models.weekly_goal import WeeklyGoal

router = APIRouter(tags=["weekly-goals"])


def _not_blank(v: str) -> str:
    if not v.strip():
        raise ValueError("빈 값일 수 없습니다")
    return v


class WeeklyGoalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    week_start_date: date_type
    title: str
    completed: bool


class WeeklyGoalCreate(BaseModel):
    week_start_date: date_type
    title: str

    _validate_title = field_validator("title")(_not_blank)


class WeeklyGoalUpdate(BaseModel):
    title: str | None = None
    completed: bool | None = None


def _get_owned_weekly_goal(db: Session, current_user: User, goal_id: int) -> WeeklyGoal:
    goal = (
        db.query(WeeklyGoal)
        .filter(WeeklyGoal.id == goal_id, WeeklyGoal.user_id == current_user.id)
        .first()
    )
    if goal is None:
        raise HTTPException(status_code=404, detail="주간 목표를 찾을 수 없습니다")
    return goal


@router.get("/weekly-goals", response_model=list[WeeklyGoalOut])
def get_weekly_goals(
    week_start_date: date_type,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(WeeklyGoal)
        .filter(
            WeeklyGoal.user_id == current_user.id,
            WeeklyGoal.week_start_date == week_start_date,
        )
        .all()
    )


@router.post("/weekly-goals", response_model=WeeklyGoalOut)
def create_weekly_goal(
    body: WeeklyGoalCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    new_goal = WeeklyGoal(
        user_id=current_user.id,
        week_start_date=body.week_start_date,
        title=body.title,
    )
    db.add(new_goal)
    db.commit()
    db.refresh(new_goal)
    return new_goal


@router.patch("/weekly-goals/{goal_id}", response_model=WeeklyGoalOut)
def update_weekly_goal(
    goal_id: int,
    body: WeeklyGoalUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    goal = _get_owned_weekly_goal(db, current_user, goal_id)

    if body.title is not None:
        goal.title = body.title
    if body.completed is not None:
        goal.completed = body.completed

    db.commit()
    db.refresh(goal)
    return goal


@router.delete("/weekly-goals/{goal_id}")
def delete_weekly_goal(
    goal_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    goal = _get_owned_weekly_goal(db, current_user, goal_id)
    db.delete(goal)
    db.commit()
    return {"message": "deleted"}