# backend/app/api/routers/report.py
from fastapi import APIRouter
from pathlib import Path
from app.services.report.word import render_report

router = APIRouter()

@router.post("/word")
def make_report(survey_id: int):
    tpl = Path("/app/templates/report_template.docx")
    out = Path(f"/app/data/exports/report_{survey_id}.docx")
    context = {"survey_name":"Sample", "table_observations": [], "species_sections":[]}  # TODO
    render_report(tpl, out, context)
    return {"download": f"/data/exports/{out.name}"}
