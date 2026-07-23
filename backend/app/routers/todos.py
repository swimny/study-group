from datetime import date as date_type

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, field_validator
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.database import get_db
from app.models.todo import Todo
from app.models.todo_category import TodoCategory
from app.models.user import User

router = APIRouter(tags=["todos"])


class TodoCategoryCreate(BaseModel):
    name: str

    @field_validator("name")
    @classmethod
    def must_not_be_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("빈 값일 수 없습니다")
        return v


class TodoCategoryUpdate(BaseModel):
    name: str

    @field_validator("name")
    @classmethod
    def must_not_be_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("빈 값일 수 없습니다")
        return v


class TodoCategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


@router.get("/todo-categories", response_model=list[TodoCategoryOut])
def get_todo_categories(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return db.query(TodoCategory).filter(TodoCategory.user_id == current_user.id).all()


@router.post("/todo-categories", response_model=TodoCategoryOut)
def create_todo_category(
    category: TodoCategoryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    new_category = TodoCategory(user_id=current_user.id, name=category.name)
    db.add(new_category)
    db.commit()
    db.refresh(new_category)
    return new_category


class TodoCreate(BaseModel):
    category_id: int
    title: str
    date: date_type

    @field_validator("title")
    @classmethod
    def must_not_be_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("빈 값일 수 없습니다")
        return v


class TodoUpdate(BaseModel):
    title: str | None = None
    completed: bool | None = None
    date: date_type | None = None


class TodoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    category_id: int
    title: str
    completed: bool
    date: date_type


@router.get("/todos", response_model=list[TodoOut])
def get_todos(
    date: date_type | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    target_date = date or date_type.today()
    return (
        db.query(Todo)
        .filter(Todo.user_id == current_user.id, Todo.date == target_date)
        .all()
    )


def _get_owned_category(db: Session, current_user: User, category_id: int) -> TodoCategory:
    category = (
        db.query(TodoCategory)
        .filter(TodoCategory.id == category_id, TodoCategory.user_id == current_user.id)
        .first()
    )
    if category is None:
        raise HTTPException(status_code=404, detail="카테고리를 찾을 수 없습니다")
    return category


@router.patch("/todo-categories/{category_id}", response_model=TodoCategoryOut)
def update_todo_category(
    category_id: int,
    body: TodoCategoryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    category = _get_owned_category(db, current_user, category_id)
    category.name = body.name
    db.commit()
    db.refresh(category)
    return category


@router.delete("/todo-categories/{category_id}")
def delete_todo_category(
    category_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    category = _get_owned_category(db, current_user, category_id)
    db.query(Todo).filter(Todo.category_id == category_id).delete(synchronize_session=False)
    db.delete(category)
    db.commit()
    return {"message": "deleted"}


@router.post("/todos", response_model=TodoOut)
def create_todo(
    todo: TodoCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_owned_category(db, current_user, todo.category_id)

    new_todo = Todo(
        user_id=current_user.id,
        category_id=todo.category_id,
        title=todo.title,
        date=todo.date,
    )
    db.add(new_todo)
    db.commit()
    db.refresh(new_todo)
    return new_todo


def _get_owned_todo(db: Session, current_user: User, todo_id: int) -> Todo:
    todo = db.query(Todo).filter(Todo.id == todo_id, Todo.user_id == current_user.id).first()
    if todo is None:
        raise HTTPException(status_code=404, detail="Todo를 찾을 수 없습니다")
    return todo


@router.patch("/todos/{todo_id}", response_model=TodoOut)
def update_todo(
    todo_id: int,
    body: TodoUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    todo = _get_owned_todo(db, current_user, todo_id)

    if body.title is not None:
        todo.title = body.title
    if body.completed is not None:
        todo.completed = body.completed
    if body.date is not None:
        todo.date = body.date

    db.commit()
    db.refresh(todo)
    return todo


@router.delete("/todos/{todo_id}")
def delete_todo(
    todo_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    todo = _get_owned_todo(db, current_user, todo_id)
    db.delete(todo)
    db.commit()
    return {"message": "deleted"}