# backend/app/models/survey.py
from sqlalchemy import Integer, String, Date, JSON, Column
from .base import Base

class Survey(Base):
    __tablename__ = "surveys"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    date = Column(Date, nullable=False)
    observers = Column(String, default="")  # CSV文字列でMVP対応
    area_bbox = Column(JSON, nullable=True)  # [minx,miny,maxx,maxy] (EPSG:4326)
