# backend/app/api/routers/export.py
from fastapi import APIRouter, Depends, HTTPException, Response
from pathlib import Path
from sqlalchemy.orm import Session
from datetime import datetime
import json
import tempfile

from app.db import get_db
from app.models.observation import Observation
from app.models.survey import Survey
from app.models.flightline import FlightLine
from app.models.observation_point import ObservationPoint
from app.models.observation_polygon import ObservationPolygon
from app.services.export.shapefile import export_grouped_shapefiles

router = APIRouter()

@router.post("/shapefile")
def make_shp(
    survey_id: int,
    target_epsg: int,
    encoding: str = "CP932",
    individual_ids: str | None = None,  # CSV（任意）
    db: Session = Depends(get_db),
):
    # 調査日取得（ファイル名プレフィックス）
    survey = db.get(Survey, survey_id)
    if not survey:
        raise HTTPException(status_code=404, detail="survey not found")
    date_prefix = survey.date.strftime("%Y%m%d") if hasattr(survey, "date") and survey.date else datetime.utcnow().strftime("%Y%m%d")

    # 対象個体ID（指定が無ければ全件）
    target_ids: set[str] | None = None
    if individual_ids:
        target_ids = {s.strip() for s in individual_ids.split(",") if s.strip()}

    grouped: dict[tuple[str, str, str], list[dict]] = {}

    def add_feat(gtype: str, geom_json: str, obs: Observation):
        try:
            geom = json.loads(geom_json)
        except Exception:
            return
        indiv = obs.individual_id or f"IND-{obs.id}"
        if target_ids and indiv not in target_ids:
            return
        key = (date_prefix, indiv, gtype)
        feat = {
            "type": "Feature",
            "geometry": geom,
            "properties": {
                "observation_id": obs.id,
                "survey_id": obs.survey_id,
                "species": obs.species,
                "count": obs.count,
                "behavior": obs.behavior,
                "started_at": obs.started_at.isoformat() if obs.started_at else None,
                "ended_at": obs.ended_at.isoformat() if obs.ended_at else None,
                "notes": obs.notes,
                "individual_id": indiv,
            },
        }
        grouped.setdefault(key, []).append(feat)

    # LineString
    ql = db.query(FlightLine, Observation).join(Observation, FlightLine.observation_id == Observation.id).filter(Observation.survey_id == survey_id)
    for fl, obs in ql.all():
        add_feat("LineString", fl.geometry, obs)

    # Point
    qp = db.query(ObservationPoint, Observation).join(Observation, ObservationPoint.observation_id == Observation.id).filter(Observation.survey_id == survey_id)
    for pt, obs in qp.all():
        add_feat("Point", pt.geometry, obs)

    # Polygon
    qg = db.query(ObservationPolygon, Observation).join(Observation, ObservationPolygon.observation_id == Observation.id).filter(Observation.survey_id == survey_id)
    for pg, obs in qg.all():
        add_feat("Polygon", pg.geometry, obs)

    # 一時ディレクトリにZIPを作成し、メモリに読み込んで返す（サーバ上に残さない）
    with tempfile.TemporaryDirectory() as tmpdir:
        out = Path(tmpdir) / f"survey_{survey_id}.zip"
        export_grouped_shapefiles(grouped, out, target_epsg, encoding)
        data = out.read_bytes()
    filename = f"survey_{survey_id}.zip"
    headers = {
        "Content-Disposition": f"attachment; filename=\"{filename}\"",
        "Content-Type": "application/zip",
    }
    return Response(content=data, media_type="application/zip", headers=headers)
