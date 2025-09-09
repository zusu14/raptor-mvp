# backend/app/models/observation_polygon.py
from sqlalchemy import Integer, Column, ForeignKey, Text
from .base import Base


class ObservationPolygon(Base):
    __tablename__ = "observation_polygons"
    id = Column(Integer, primary_key=True)
    observation_id = Column(
        Integer, ForeignKey("observations.id", ondelete="CASCADE"), nullable=False
    )
    geometry = Column(Text, nullable=False)  # GeoJSON string (Polygon, EPSG:4326)

