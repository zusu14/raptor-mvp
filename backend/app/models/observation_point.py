# backend/app/models/observation_point.py
from sqlalchemy import Integer, Column, ForeignKey, Text
from .base import Base


class ObservationPoint(Base):
    __tablename__ = "observation_points"
    id = Column(Integer, primary_key=True)
    observation_id = Column(
        Integer, ForeignKey("observations.id", ondelete="CASCADE"), nullable=False
    )
    geometry = Column(Text, nullable=False)  # GeoJSON string (Point, EPSG:4326)

