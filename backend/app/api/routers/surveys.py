from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import date as Date

from app.db import get_db
from app.models.survey import Survey
from app.schemas.survey import SurveyIn, SurveyOut

router = APIRouter()


@router.get("/ping")
def ping():
    return {"ok": True, "router": "surveys"}


@router.get("")
@router.get("/")
def list_surveys(db: Session = Depends(get_db)) -> list[SurveyOut]:
    rows = db.query(Survey).order_by(Survey.id.asc()).all()
    return [
        SurveyOut(
            id=s.id,
            name=s.name,
            date=s.date,
            observers=s.observers or "",
            area_bbox=s.area_bbox,
        )
        for s in rows
    ]


@router.post("")
@router.post("/")
def create_survey(payload: SurveyIn, db: Session = Depends(get_db)) -> SurveyOut:
    the_date = payload.date or Date.today()
    obj = Survey(
        name=payload.name,
        date=the_date,
        observers=payload.observers or "",
        area_bbox=payload.area_bbox,
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return SurveyOut(
        id=obj.id,
        name=obj.name,
        date=obj.date,
        observers=obj.observers or "",
        area_bbox=obj.area_bbox,
    )


@router.get("/{survey_id}")
def get_survey(survey_id: int, db: Session = Depends(get_db)) -> SurveyOut:
    s = db.get(Survey, survey_id)
    if not s:
        raise HTTPException(status_code=404, detail="survey not found")
    return SurveyOut(
        id=s.id,
        name=s.name,
        date=s.date,
        observers=s.observers or "",
        area_bbox=s.area_bbox,
    )
