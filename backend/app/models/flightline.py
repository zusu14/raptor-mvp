# backend/app/models/flightline.py
from sqlalchemy import Integer, Column, ForeignKey, Float, Text
from .base import Base

class FlightLine(Base):
    __tablename__ = "flightlines"
    id = Column(Integer, primary_key=True)
    observation_id = Column(Integer, ForeignKey("observations.id", ondelete="CASCADE"), nullable=False)
    geometry = Column(Text, nullable=False)  # GeoJSON string (LineString, EPSG:4326)
    length_m = Column(Float, default=0.0)
