# backend/app/services/report/word.py
from docxtpl import DocxTemplate, InlineImage
from docx.shared import Mm
from pathlib import Path

def render_report(template_path: Path, out_path: Path, context: dict):
    tpl = DocxTemplate(str(template_path))
    tpl.render(context)
    tpl.save(str(out_path))

# context例
# {
#   "survey_name": "2025-09-08 現地調査A",
#   "table_observations": [
#       {"species":"ハイタカ","count":2,"started_at":"2025-09-08 10:21","ended_at":"10:23"},
#   ],
#   "species_sections": [
#       {"species":"ハイタカ","map_png":"/app/data/exports/hai_map.png","rep_photo":"/app/data/exports/hai_photo.png"},
#   ],
# }
