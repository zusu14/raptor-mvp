# backend/app/models/photolink.py
from sqlalchemy import Integer, Column, ForeignKey, Float, Boolean
from .base import Base

class PhotoLink(Base):
    __tablename__ = "photolinks"
    photo_id = Column(Integer, ForeignKey("photos.id", ondelete="CASCADE"), primary_key=True)
    observation_id = Column(Integer, ForeignKey("observations.id", ondelete="CASCADE"), primary_key=True)
    link_score = Column(Float, nullable=False)
    is_representative = Column(Boolean, default=False)
