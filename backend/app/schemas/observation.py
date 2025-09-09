# backend/app/schemas/observation.py
from pydantic import BaseModel
from datetime import datetime
from typing import Literal
from .commons import Behavior, GeoJSONFeature

class ObservationIn(BaseModel):
    survey_id: int
    species: str
    count: int
    behavior: Behavior
    started_at: datetime
    ended_at: datetime
    notes: str = ""


class RecordIn(BaseModel):
    observation: ObservationIn
    feature: GeoJSONFeature

    # 許可する形状のみ
    def geometry_type(self) -> Literal["Point", "LineString", "Polygon"]:
        g = self.feature.geometry or {}
        t = g.get("type")
        if t not in ("Point", "LineString", "Polygon"):
            raise ValueError("feature.geometry.type must be Point|LineString|Polygon")
        return t  # type: ignore[return-value]
