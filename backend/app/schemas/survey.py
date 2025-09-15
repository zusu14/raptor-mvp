# backend/app/schemas/survey.py
from pydantic import BaseModel
from typing import Any, Optional
import datetime as dt


class SurveyIn(BaseModel):
    name: str
    date: Optional[dt.date] = None
    observers: str = ""
    area_bbox: Optional[Any] = None  # [minx,miny,maxx,maxy] などを想定（任意）


class SurveyOut(BaseModel):
    id: int
    name: str
    date: dt.date
    observers: str
    area_bbox: Optional[Any] = None


class SurveyUpdate(BaseModel):
    name: Optional[str] = None
    date: Optional[dt.date] = None
    observers: Optional[str] = None
    area_bbox: Optional[Any] = None
