from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, field_validator
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.database import get_db
from app.models.feed_comment import FeedComment
from app.models.feed_post import FeedPost
from app.models.feed_reaction import FeedReaction
from app.models.user import User

router = APIRouter(tags=["feed"])

ALLOWED_EMOJI = {"👍", "🔥", "💪", "👏", "❤️"}


def _not_blank(v: str) -> str:
    if not v.strip():
        raise ValueError("빈 값일 수 없습니다")
    return v


def _to_utc_iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


class CommentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    author_id: int
    author_name: str
    content: str
    created_at: str


class ReactionSummary(BaseModel):
    emoji: str
    count: int
    reacted_by_me: bool


class PostOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    author_id: int
    author_name: str
    content: str
    created_at: str
    updated_at: str | None
    comments: list[CommentOut]
    reactions: list[ReactionSummary]


def _serialize_post(post: FeedPost, users_by_id: dict[int, User], current_user: User) -> PostOut:
    comments = (
        [
            CommentOut(
                id=c.id,
                author_id=c.author_id,
                author_name=users_by_id[c.author_id].name,
                content=c.content,
                created_at=_to_utc_iso(c.created_at),
            )
            for c in sorted(post.comments, key=lambda c: c.id)
        ]
        if hasattr(post, "comments")
        else []
    )

    reaction_map: dict[str, list[int]] = {}
    for r in post.reactions:
        reaction_map.setdefault(r.emoji, []).append(r.user_id)

    reactions = [
        ReactionSummary(emoji=emoji, count=len(user_ids), reacted_by_me=current_user.id in user_ids)
        for emoji, user_ids in reaction_map.items()
    ]

    return PostOut(
        id=post.id,
        author_id=post.author_id,
        author_name=users_by_id[post.author_id].name,
        content=post.content,
        created_at=_to_utc_iso(post.created_at),
        updated_at=_to_utc_iso(post.updated_at) if post.updated_at else None,
        comments=comments,
        reactions=reactions,
    )


def _load_posts(db: Session, current_user: User, posts: list[FeedPost]) -> list[PostOut]:
    users_by_id = {u.id: u for u in db.query(User).all()}
    post_ids = [p.id for p in posts]
    comments = (
        db.query(FeedComment).filter(FeedComment.post_id.in_(post_ids)).all() if post_ids else []
    )
    reactions = (
        db.query(FeedReaction).filter(FeedReaction.post_id.in_(post_ids)).all() if post_ids else []
    )
    comments_by_post: dict[int, list[FeedComment]] = {}
    for c in comments:
        comments_by_post.setdefault(c.post_id, []).append(c)
    reactions_by_post: dict[int, list[FeedReaction]] = {}
    for r in reactions:
        reactions_by_post.setdefault(r.post_id, []).append(r)

    result = []
    for post in posts:
        post.comments = comments_by_post.get(post.id, [])
        post.reactions = reactions_by_post.get(post.id, [])
        result.append(_serialize_post(post, users_by_id, current_user))
    return result


@router.get("/feed-posts", response_model=list[PostOut])
def get_feed_posts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    posts = db.query(FeedPost).order_by(FeedPost.created_at.desc()).all()
    return _load_posts(db, current_user, posts)


class PostCreate(BaseModel):
    content: str

    _validate_content = field_validator("content")(_not_blank)


def _get_owned_post(db: Session, current_user: User, post_id: int) -> FeedPost:
    post = (
        db.query(FeedPost)
        .filter(FeedPost.id == post_id, FeedPost.author_id == current_user.id)
        .first()
    )
    if post is None:
        raise HTTPException(status_code=404, detail="게시글을 찾을 수 없습니다")
    return post


@router.post("/feed-posts", response_model=PostOut)
def create_feed_post(
    body: PostCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    new_post = FeedPost(author_id=current_user.id, content=body.content)
    db.add(new_post)
    db.commit()
    db.refresh(new_post)
    return _load_posts(db, current_user, [new_post])[0]


class PostUpdate(BaseModel):
    content: str

    _validate_content = field_validator("content")(_not_blank)


@router.patch("/feed-posts/{post_id}", response_model=PostOut)
def update_feed_post(
    post_id: int,
    body: PostUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    post = _get_owned_post(db, current_user, post_id)
    post.content = body.content
    post.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(post)
    return _load_posts(db, current_user, [post])[0]


@router.delete("/feed-posts/{post_id}")
def delete_feed_post(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    post = _get_owned_post(db, current_user, post_id)
    db.query(FeedComment).filter(FeedComment.post_id == post_id).delete(synchronize_session=False)
    db.query(FeedReaction).filter(FeedReaction.post_id == post_id).delete(synchronize_session=False)
    db.delete(post)
    db.commit()
    return {"message": "deleted"}


class CommentCreate(BaseModel):
    content: str

    _validate_content = field_validator("content")(_not_blank)


def _get_post_or_404(db: Session, post_id: int) -> FeedPost:
    post = db.query(FeedPost).filter(FeedPost.id == post_id).first()
    if post is None:
        raise HTTPException(status_code=404, detail="게시글을 찾을 수 없습니다")
    return post


@router.post("/feed-posts/{post_id}/comments", response_model=PostOut)
def create_comment(
    post_id: int,
    body: CommentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    post = _get_post_or_404(db, post_id)
    new_comment = FeedComment(post_id=post.id, author_id=current_user.id, content=body.content)
    db.add(new_comment)
    db.commit()
    return _load_posts(db, current_user, [post])[0]


@router.delete("/comments/{comment_id}")
def delete_comment(
    comment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    comment = (
        db.query(FeedComment)
        .filter(FeedComment.id == comment_id, FeedComment.author_id == current_user.id)
        .first()
    )
    if comment is None:
        raise HTTPException(status_code=404, detail="댓글을 찾을 수 없습니다")
    db.delete(comment)
    db.commit()
    return {"message": "deleted"}


class ReactionToggle(BaseModel):
    emoji: str

    @field_validator("emoji")
    @classmethod
    def _validate_emoji(cls, v: str) -> str:
        if v not in ALLOWED_EMOJI:
            raise ValueError("지원하지 않는 이모지입니다")
        return v


@router.post("/feed-posts/{post_id}/reactions", response_model=PostOut)
def toggle_reaction(
    post_id: int,
    body: ReactionToggle,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    post = _get_post_or_404(db, post_id)
    existing = (
        db.query(FeedReaction)
        .filter(
            FeedReaction.post_id == post_id,
            FeedReaction.user_id == current_user.id,
            FeedReaction.emoji == body.emoji,
        )
        .first()
    )
    if existing is not None:
        db.delete(existing)
    else:
        db.add(FeedReaction(post_id=post_id, user_id=current_user.id, emoji=body.emoji))
    db.commit()
    return _load_posts(db, current_user, [post])[0]