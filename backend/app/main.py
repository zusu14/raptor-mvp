from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routers import auth, surveys, observations, flightlines, photos, export, report
from app.db import init_db

app = FastAPI(title="Raptor MVP API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"ok": True}


# 初回起動時にDBスキーマを作成
@app.on_event("startup")
def on_startup():
    init_db()

app.include_router(auth.router,         prefix="/auth",         tags=["auth"])
app.include_router(surveys.router,      prefix="/surveys",      tags=["surveys"])
app.include_router(observations.router, prefix="/observations", tags=["observations"])
app.include_router(flightlines.router,  prefix="/flightlines",  tags=["flightlines"])
app.include_router(photos.router,       prefix="/photos",       tags=["photos"])
app.include_router(export.router,       prefix="/export",       tags=["export"])
app.include_router(report.router,       prefix="/report",       tags=["report"])
