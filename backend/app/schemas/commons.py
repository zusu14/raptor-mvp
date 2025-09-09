# backend/app/schemas/commons.py
from pydantic import BaseModel, Field
from typing import Optional, List, Literal

Behavior = Literal["flight","circle","rest"]

class GeoJSONFeature(BaseModel):
    type: Literal["Feature"] = "Feature"
    geometry: dict
    properties: dict
