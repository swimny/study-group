from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, field_validator
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.database import get_db
from app.models.prep_checklist_item import PrepChecklistItem
from app.models.prep_item import PrepItem, PrepItemType
from app.models.prep_resource import PrepResource
from app.models.user import User

router = APIRouter(tags=["prep-notes"])


def _not_blank(v: str) -> str:
    if not v.strip():
        raise ValueError("빈 값일 수 없습니다")
    return v


class ChecklistItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    content: str
    completed: bool


class ResourceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    url: str | None


class PrepItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    item_type: PrepItemType
    notes: str | None
    completed: bool
    position: int
    checklist_items: list[ChecklistItemOut]
    resources: list[ResourceOut]


def _get_owned_prep_item(db: Session, current_user: User, prep_item_id: int) -> PrepItem:
    item = (
        db.query(PrepItem)
        .filter(PrepItem.id == prep_item_id, PrepItem.user_id == current_user.id)
        .first()
    )
    if item is None:
        raise HTTPException(status_code=404, detail="준비 항목을 찾을 수 없습니다")
    return item


@router.get("/prep-items", response_model=list[PrepItemOut])
def get_prep_items(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(PrepItem)
        .filter(PrepItem.user_id == current_user.id)
        .order_by(PrepItem.position)
        .all()
    )


class PrepItemCreate(BaseModel):
    title: str
    item_type: PrepItemType = PrepItemType.other
    notes: str | None = None

    _validate_title = field_validator("title")(_not_blank)


@router.post("/prep-items", response_model=PrepItemOut)
def create_prep_item(
    body: PrepItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    max_position = (
        db.query(func.max(PrepItem.position)).filter(PrepItem.user_id == current_user.id).scalar()
    )
    new_item = PrepItem(
        user_id=current_user.id,
        title=body.title,
        item_type=body.item_type,
        notes=body.notes,
        position=(max_position or 0) + 1,
    )
    db.add(new_item)
    db.commit()
    db.refresh(new_item)
    return new_item


class ReorderRequest(BaseModel):
    ordered_ids: list[int]


@router.patch("/prep-items/reorder")
def reorder_prep_items(
    body: ReorderRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items = (
        db.query(PrepItem)
        .filter(PrepItem.user_id == current_user.id, PrepItem.id.in_(body.ordered_ids))
        .all()
    )
    items_by_id = {item.id: item for item in items}
    for position, item_id in enumerate(body.ordered_ids):
        if item_id in items_by_id:
            items_by_id[item_id].position = position
    db.commit()
    return {"message": "ok"}


class PrepItemUpdate(BaseModel):
    title: str | None = None
    item_type: PrepItemType | None = None
    notes: str | None = None
    completed: bool | None = None


@router.patch("/prep-items/{prep_item_id}", response_model=PrepItemOut)
def update_prep_item(
    prep_item_id: int,
    body: PrepItemUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = _get_owned_prep_item(db, current_user, prep_item_id)

    if body.title is not None:
        item.title = body.title
    if body.item_type is not None:
        item.item_type = body.item_type
    if body.notes is not None:
        item.notes = body.notes
    if body.completed is not None:
        item.completed = body.completed
        item.completed_at = datetime.now(timezone.utc) if body.completed else None

    db.commit()
    db.refresh(item)
    return item


@router.delete("/prep-items/{prep_item_id}")
def delete_prep_item(
    prep_item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = _get_owned_prep_item(db, current_user, prep_item_id)
    db.query(PrepChecklistItem).filter(PrepChecklistItem.prep_item_id == prep_item_id).delete(
        synchronize_session=False
    )
    db.query(PrepResource).filter(PrepResource.prep_item_id == prep_item_id).delete(
        synchronize_session=False
    )
    db.delete(item)
    db.commit()
    return {"message": "deleted"}


class ChecklistItemCreate(BaseModel):
    content: str

    _validate_content = field_validator("content")(_not_blank)


@router.post("/prep-items/{prep_item_id}/checklist-items", response_model=ChecklistItemOut)
def create_checklist_item(
    prep_item_id: int,
    body: ChecklistItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_owned_prep_item(db, current_user, prep_item_id)
    new_checklist_item = PrepChecklistItem(prep_item_id=prep_item_id, content=body.content)
    db.add(new_checklist_item)
    db.commit()
    db.refresh(new_checklist_item)
    return new_checklist_item


class ChecklistItemUpdate(BaseModel):
    content: str | None = None
    completed: bool | None = None


def _get_owned_checklist_item(
    db: Session, current_user: User, checklist_item_id: int
) -> PrepChecklistItem:
    checklist_item = (
        db.query(PrepChecklistItem)
        .join(PrepItem, PrepChecklistItem.prep_item_id == PrepItem.id)
        .filter(PrepChecklistItem.id == checklist_item_id, PrepItem.user_id == current_user.id)
        .first()
    )
    if checklist_item is None:
        raise HTTPException(status_code=404, detail="체크리스트 항목을 찾을 수 없습니다")
    return checklist_item


@router.patch("/checklist-items/{checklist_item_id}", response_model=ChecklistItemOut)
def update_checklist_item(
    checklist_item_id: int,
    body: ChecklistItemUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    checklist_item = _get_owned_checklist_item(db, current_user, checklist_item_id)

    if body.content is not None:
        checklist_item.content = body.content
    if body.completed is not None:
        checklist_item.completed = body.completed

    db.commit()
    db.refresh(checklist_item)
    return checklist_item


@router.delete("/checklist-items/{checklist_item_id}")
def delete_checklist_item(
    checklist_item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    checklist_item = _get_owned_checklist_item(db, current_user, checklist_item_id)
    db.delete(checklist_item)
    db.commit()
    return {"message": "deleted"}


class ResourceCreate(BaseModel):
    title: str
    url: str | None = None

    _validate_title = field_validator("title")(_not_blank)


@router.post("/prep-items/{prep_item_id}/resources", response_model=ResourceOut)
def create_resource(
    prep_item_id: int,
    body: ResourceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_owned_prep_item(db, current_user, prep_item_id)
    new_resource = PrepResource(prep_item_id=prep_item_id, title=body.title, url=body.url)
    db.add(new_resource)
    db.commit()
    db.refresh(new_resource)
    return new_resource


@router.delete("/resources/{resource_id}")
def delete_resource(
    resource_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    resource = (
        db.query(PrepResource)
        .join(PrepItem, PrepResource.prep_item_id == PrepItem.id)
        .filter(PrepResource.id == resource_id, PrepItem.user_id == current_user.id)
        .first()
    )
    if resource is None:
        raise HTTPException(status_code=404, detail="자료를 찾을 수 없습니다")
    db.delete(resource)
    db.commit()
    return {"message": "deleted"}