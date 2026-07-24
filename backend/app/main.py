from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine
from app.routers.auth import router as auth_router
from app.routers.calendar import router as calendar_router
from app.routers.coaching import router as coaching_router
from app.routers.dashboard import router as dashboard_router
from app.routers.feed import router as feed_router
from app.routers.portfolio import router as portfolio_router
from app.routers.prep_notes import router as prep_notes_router
from app.routers.todos import router as todos_router
from app.routers.users import router as users_router
from app.routers.weekly_goals import router as weekly_goals_router
from app.routers.weekly_report import router as weekly_report_router

Base.metadata.create_all(bind=engine)

app = FastAPI(title="studygroup API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(todos_router)
app.include_router(calendar_router)
app.include_router(users_router)
app.include_router(prep_notes_router)
app.include_router(portfolio_router)
app.include_router(feed_router)
app.include_router(weekly_goals_router)
app.include_router(dashboard_router)
app.include_router(coaching_router)
app.include_router(weekly_report_router)