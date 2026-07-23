from sqlalchemy import Column, ForeignKey, Integer, String

from app.database import Base


class TodoCategory(Base):
    __tablename__ = "todo_categories"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String, nullable=False)