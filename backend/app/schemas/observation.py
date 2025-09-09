# backend/app/schemas/observation.py
from pydantic import BaseModel
from datetime import datetime
from .commons import Behavior

class ObservationIn(BaseModel):
    survey_id: int
    species: str
    count: int
    behavior: Behavior
    started_at: datetime
    ended_at: datetime
    notes: str = ""
