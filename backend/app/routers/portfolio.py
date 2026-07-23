from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, field_validator
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.database import get_db
from app.models.portfolio_item import PortfolioItem, PortfolioItemType
from app.models.portfolio_link import PortfolioLink
from app.models.portfolio_profile import EnrollmentStatus, PortfolioProfile
from app.models.portfolio_profile_link import PortfolioProfileLink
from app.models.prep_item import PrepItem
from app.models.prep_resource import PrepResource
from app.models.user import User

router = APIRouter(tags=["portfolio"])


def _not_blank(v: str) -> str:
    if not v.strip():
        raise ValueError("빈 값일 수 없습니다")
    return v


class LinkOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    url: str | None


class PortfolioItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    item_type: PortfolioItemType
    description: str | None
    achieved_date: date | None
    source_prep_item_id: int | None
    position: int
    links: list[LinkOut]


def _get_owned_portfolio_item(db: Session, current_user: User, portfolio_item_id: int) -> PortfolioItem:
    item = (
        db.query(PortfolioItem)
        .filter(PortfolioItem.id == portfolio_item_id, PortfolioItem.user_id == current_user.id)
        .first()
    )
    if item is None:
        raise HTTPException(status_code=404, detail="포트폴리오 항목을 찾을 수 없습니다")
    return item


@router.get("/portfolio-items", response_model=list[PortfolioItemOut])
def get_portfolio_items(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(PortfolioItem)
        .filter(PortfolioItem.user_id == current_user.id)
        .order_by(PortfolioItem.position)
        .all()
    )


class PortfolioItemCreate(BaseModel):
    title: str
    item_type: PortfolioItemType = PortfolioItemType.other
    description: str | None = None
    achieved_date: date | None = None
    source_prep_item_id: int | None = None

    _validate_title = field_validator("title")(_not_blank)


@router.post("/portfolio-items", response_model=PortfolioItemOut)
def create_portfolio_item(
    body: PortfolioItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    source_prep_item = None
    if body.source_prep_item_id is not None:
        source_prep_item = (
            db.query(PrepItem)
            .filter(PrepItem.id == body.source_prep_item_id, PrepItem.user_id == current_user.id)
            .first()
        )
        if source_prep_item is None:
            raise HTTPException(status_code=404, detail="준비 항목을 찾을 수 없습니다")

    max_position = (
        db.query(func.max(PortfolioItem.position))
        .filter(PortfolioItem.user_id == current_user.id)
        .scalar()
    )
    new_item = PortfolioItem(
        user_id=current_user.id,
        title=body.title,
        item_type=body.item_type,
        description=body.description,
        achieved_date=body.achieved_date,
        source_prep_item_id=body.source_prep_item_id,
        position=(max_position or 0) + 1,
    )
    db.add(new_item)
    db.flush()

    if source_prep_item is not None:
        source_resources = (
            db.query(PrepResource).filter(PrepResource.prep_item_id == source_prep_item.id).all()
        )
        for resource in source_resources:
            db.add(
                PortfolioLink(
                    portfolio_item_id=new_item.id, title=resource.title, url=resource.url
                )
            )

    db.commit()
    db.refresh(new_item)
    return new_item


class ReorderRequest(BaseModel):
    ordered_ids: list[int]


@router.patch("/portfolio-items/reorder")
def reorder_portfolio_items(
    body: ReorderRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items = (
        db.query(PortfolioItem)
        .filter(PortfolioItem.user_id == current_user.id, PortfolioItem.id.in_(body.ordered_ids))
        .all()
    )
    items_by_id = {item.id: item for item in items}
    for position, item_id in enumerate(body.ordered_ids):
        if item_id in items_by_id:
            items_by_id[item_id].position = position
    db.commit()
    return {"message": "ok"}


class PortfolioItemUpdate(BaseModel):
    title: str | None = None
    item_type: PortfolioItemType | None = None
    description: str | None = None
    achieved_date: date | None = None


@router.patch("/portfolio-items/{portfolio_item_id}", response_model=PortfolioItemOut)
def update_portfolio_item(
    portfolio_item_id: int,
    body: PortfolioItemUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = _get_owned_portfolio_item(db, current_user, portfolio_item_id)

    if body.title is not None:
        item.title = body.title
    if body.item_type is not None:
        item.item_type = body.item_type
    if body.description is not None:
        item.description = body.description
    if body.achieved_date is not None:
        item.achieved_date = body.achieved_date

    db.commit()
    db.refresh(item)
    return item


@router.delete("/portfolio-items/{portfolio_item_id}")
def delete_portfolio_item(
    portfolio_item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = _get_owned_portfolio_item(db, current_user, portfolio_item_id)
    db.query(PortfolioLink).filter(PortfolioLink.portfolio_item_id == portfolio_item_id).delete(
        synchronize_session=False
    )
    db.delete(item)
    db.commit()
    return {"message": "deleted"}


class LinkCreate(BaseModel):
    title: str
    url: str | None = None

    _validate_title = field_validator("title")(_not_blank)


@router.post("/portfolio-items/{portfolio_item_id}/links", response_model=LinkOut)
def create_link(
    portfolio_item_id: int,
    body: LinkCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_owned_portfolio_item(db, current_user, portfolio_item_id)
    new_link = PortfolioLink(portfolio_item_id=portfolio_item_id, title=body.title, url=body.url)
    db.add(new_link)
    db.commit()
    db.refresh(new_link)
    return new_link


@router.delete("/links/{link_id}")
def delete_link(
    link_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    link = (
        db.query(PortfolioLink)
        .join(PortfolioItem, PortfolioLink.portfolio_item_id == PortfolioItem.id)
        .filter(PortfolioLink.id == link_id, PortfolioItem.user_id == current_user.id)
        .first()
    )
    if link is None:
        raise HTTPException(status_code=404, detail="자료를 찾을 수 없습니다")
    db.delete(link)
    db.commit()
    return {"message": "deleted"}


class ProfileLinkOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    url: str | None


class PortfolioProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    school: str | None
    major: str | None
    gpa: str | None
    enrollment_status: EnrollmentStatus | None
    intro: str | None
    links: list[ProfileLinkOut]


def _get_or_create_profile(db: Session, current_user: User) -> PortfolioProfile:
    profile = (
        db.query(PortfolioProfile).filter(PortfolioProfile.user_id == current_user.id).first()
    )
    if profile is None:
        profile = PortfolioProfile(user_id=current_user.id)
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return profile


@router.get("/portfolio-profile", response_model=PortfolioProfileOut)
def get_portfolio_profile(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return _get_or_create_profile(db, current_user)


class PortfolioProfileUpdate(BaseModel):
    school: str | None = None
    major: str | None = None
    gpa: str | None = None
    enrollment_status: EnrollmentStatus | None = None
    intro: str | None = None


@router.patch("/portfolio-profile", response_model=PortfolioProfileOut)
def update_portfolio_profile(
    body: PortfolioProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    profile = _get_or_create_profile(db, current_user)

    if body.school is not None:
        profile.school = body.school
    if body.major is not None:
        profile.major = body.major
    if body.gpa is not None:
        profile.gpa = body.gpa
    if body.enrollment_status is not None:
        profile.enrollment_status = body.enrollment_status
    if body.intro is not None:
        profile.intro = body.intro

    db.commit()
    db.refresh(profile)
    return profile


class ProfileLinkCreate(BaseModel):
    title: str
    url: str | None = None

    _validate_title = field_validator("title")(_not_blank)


@router.post("/portfolio-profile/links", response_model=ProfileLinkOut)
def create_profile_link(
    body: ProfileLinkCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    profile = _get_or_create_profile(db, current_user)
    new_link = PortfolioProfileLink(portfolio_profile_id=profile.id, title=body.title, url=body.url)
    db.add(new_link)
    db.commit()
    db.refresh(new_link)
    return new_link


@router.delete("/profile-links/{link_id}")
def delete_profile_link(
    link_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    link = (
        db.query(PortfolioProfileLink)
        .join(PortfolioProfile, PortfolioProfileLink.portfolio_profile_id == PortfolioProfile.id)
        .filter(PortfolioProfileLink.id == link_id, PortfolioProfile.user_id == current_user.id)
        .first()
    )
    if link is None:
        raise HTTPException(status_code=404, detail="링크를 찾을 수 없습니다")
    db.delete(link)
    db.commit()
    return {"message": "deleted"}