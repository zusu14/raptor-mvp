# backend/app/models/observation.py
from sqlalchemy import Integer, String, Column, ForeignKey, DateTime
from .base import Base

class Observation(Base):
    __tablename__ = "observations"
    id = Column(Integer, primary_key=True)
    survey_id = Column(Integer, ForeignKey("surveys.id", ondelete="CASCADE"), nullable=False)
    # 個体ID（任意）。同一個体に紐づく点/線/面を束ねるためのキー
    individual_id = Column(String, nullable=True)
    species = Column(String, nullable=False)
    count = Column(Integer, nullable=False)
    behavior = Column(String, nullable=False)  # flight|circle|rest
    started_at = Column(DateTime, nullable=False)
    ended_at = Column(DateTime, nullable=False)
    notes = Column(String, default="")
