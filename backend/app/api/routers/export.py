# backend/app/api/routers/export.py
from fastapi import APIRouter
from pathlib import Path
from app.services.export.shapefile import export_shapefiles

router = APIRouter()

@router.post("/shapefile")
def make_shp(survey_id: int, target_epsg: int, encoding: str = "CP932"):
    # DBからline_features/point_featuresを収集（省略: リポに合わせて実装）
    line_features = []
    point_features = []
    out = Path(f"/app/data/exports/survey_{survey_id}.zip")
    export_shapefiles(line_features, point_features, out, target_epsg, encoding)
    return {"download": f"/data/exports/{out.name}"}
