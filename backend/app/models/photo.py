# backend/app/models/photo.py
from sqlalchemy import Integer, Column, ForeignKey, String, DateTime, JSON
from .base import Base

class Photo(Base):
    __tablename__ = "photos"
    id = Column(Integer, primary_key=True)
    survey_id = Column(Integer, ForeignKey("surveys.id", ondelete="CASCADE"), nullable=False)
    file_path = Column(String, nullable=False)
    taken_at = Column(DateTime, nullable=True)
    gps_point = Column(JSON, nullable=True)  # {"lon":...,"lat":...} (EPSG:4326)
    exif_raw = Column(JSON, nullable=True)
