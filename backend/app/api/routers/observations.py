from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import json

from app.db import get_db
from app.schemas.observation import RecordIn
from app.models.observation import Observation
from app.models.flightline import FlightLine
from app.models.observation_point import ObservationPoint
from app.models.observation_polygon import ObservationPolygon

router = APIRouter()


@router.get("/ping")
def ping():
    return {"ok": True, "router": "observations"}


@router.post("/record")
def record_observation(payload: RecordIn, db: Session = Depends(get_db)):
    # 1) Observation 保存
    obs_in = payload.observation
    obs = Observation(
        survey_id=obs_in.survey_id,
        species=obs_in.species,
        count=obs_in.count,
        behavior=obs_in.behavior,
        started_at=obs_in.started_at,
        ended_at=obs_in.ended_at,
        notes=obs_in.notes or "",
    )
    db.add(obs)
    db.flush()  # id 採番

    # 2) 形状保存（Point | LineString | Polygon）
    geom = payload.feature.geometry or {}
    gtype = geom.get("type")
    if gtype not in ("Point", "LineString", "Polygon"):
        raise HTTPException(status_code=400, detail="Unsupported geometry type")

    geom_str = json.dumps(geom, ensure_ascii=False)
    created = None
    if gtype == "Point":
        created = ObservationPoint(observation_id=obs.id, geometry=geom_str)
    elif gtype == "LineString":
        created = FlightLine(observation_id=obs.id, geometry=geom_str, length_m=0.0)
    elif gtype == "Polygon":
        created = ObservationPolygon(observation_id=obs.id, geometry=geom_str)

    db.add(created)
    db.commit()
    db.refresh(obs)

    return {
        "observation_id": obs.id,
        "feature_type": gtype,
        "feature_id": created.id if created else None,
    }


@router.get("/features")
def list_features(survey_id: int | None = None, db: Session = Depends(get_db)):
    """
    保存済みの観察＋形状をGeoJSON FeatureCollectionで返す。
    - survey_id が指定されれば絞り込み
    - Point / LineString / Polygon を統合して一括返却
    """
    feats: list[dict] = []

    # LineString
    ql = db.query(FlightLine, Observation).join(Observation, FlightLine.observation_id == Observation.id)
    if survey_id is not None:
        ql = ql.filter(Observation.survey_id == survey_id)
    for fl, obs in ql.all():
        try:
            geom = json.loads(fl.geometry)
        except Exception:
            continue
        overlay = max(1, int(obs.count or 1))
        for idx in range(1, overlay + 1):
            feats.append({
                "type": "Feature",
                "geometry": geom,
                "properties": {
                    "feature_table": "flightlines",
                    "feature_id": fl.id,
                    "observation_id": obs.id,
                    "survey_id": obs.survey_id,
                    "species": obs.species,
                    "count": obs.count,
                    "behavior": obs.behavior,
                    "started_at": obs.started_at.isoformat() if obs.started_at else None,
                    "ended_at": obs.ended_at.isoformat() if obs.ended_at else None,
                    "notes": obs.notes,
                    "individual_id": f"IND-{obs.id}-{idx}",
                    "individual_index": idx,
                    "overlay_count": overlay,
                }
            })

    # Point
    qp = db.query(ObservationPoint, Observation).join(Observation, ObservationPoint.observation_id == Observation.id)
    if survey_id is not None:
        qp = qp.filter(Observation.survey_id == survey_id)
    for pt, obs in qp.all():
        try:
            geom = json.loads(pt.geometry)
        except Exception:
            continue
        overlay = max(1, int(obs.count or 1))
        for idx in range(1, overlay + 1):
            feats.append({
                "type": "Feature",
                "geometry": geom,
                "properties": {
                    "feature_table": "observation_points",
                    "feature_id": pt.id,
                    "observation_id": obs.id,
                    "survey_id": obs.survey_id,
                    "species": obs.species,
                    "count": obs.count,
                    "behavior": obs.behavior,
                    "started_at": obs.started_at.isoformat() if obs.started_at else None,
                    "ended_at": obs.ended_at.isoformat() if obs.ended_at else None,
                    "notes": obs.notes,
                    "individual_id": f"IND-{obs.id}-{idx}",
                    "individual_index": idx,
                    "overlay_count": overlay,
                }
            })

    # Polygon
    qg = db.query(ObservationPolygon, Observation).join(Observation, ObservationPolygon.observation_id == Observation.id)
    if survey_id is not None:
        qg = qg.filter(Observation.survey_id == survey_id)
    for pg, obs in qg.all():
        try:
            geom = json.loads(pg.geometry)
        except Exception:
            continue
        overlay = max(1, int(obs.count or 1))
        for idx in range(1, overlay + 1):
            feats.append({
                "type": "Feature",
                "geometry": geom,
                "properties": {
                    "feature_table": "observation_polygons",
                    "feature_id": pg.id,
                    "observation_id": obs.id,
                    "survey_id": obs.survey_id,
                    "species": obs.species,
                    "count": obs.count,
                    "behavior": obs.behavior,
                    "started_at": obs.started_at.isoformat() if obs.started_at else None,
                    "ended_at": obs.ended_at.isoformat() if obs.ended_at else None,
                    "notes": obs.notes,
                    "individual_id": f"IND-{obs.id}-{idx}",
                    "individual_index": idx,
                    "overlay_count": overlay,
                }
            })

    return {"type": "FeatureCollection", "features": feats}
