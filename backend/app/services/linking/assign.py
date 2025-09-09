# backend/app/services/linking/assign.py
from __future__ import annotations
from math import radians, sin, cos, asin, sqrt, exp
from datetime import datetime
from typing import Optional

JST_OFFSET = 9 * 3600

def _haversine_m(lon1, lat1, lon2, lat2) -> float:
    R = 6371000.0
    dlon, dlat = radians(lon2 - lon1), radians(lat2 - lat1)
    a = sin(dlat/2)**2 + cos(radians(lat1))*cos(radians(lat2))*sin(dlon/2)**2
    return 2 * R * asin(sqrt(a))

def score_photo_to_obs(
    photo_time: Optional[datetime],
    photo_pt: Optional[tuple],  # (lon,lat)
    obs_start: datetime,
    obs_end: datetime,
    obs_repr_pt: Optional[tuple],
    tau_s: float = 300.0,  # 5min
    r_m: float = 200.0,
    w_t: float = 0.7,
    w_s: float = 0.3,
):
    # 時刻スコア
    if photo_time is None:
        s_t = 0.0
    else:
        # 観察区間中心からのΔt（秒）
        mid = obs_start + (obs_end - obs_start)/2
        dt = abs((photo_time - mid).total_seconds())
        s_t = exp(-dt / tau_s)

    # 位置スコア
    if (photo_pt is None) or (obs_repr_pt is None):
        s_s = 0.0
    else:
        d = _haversine_m(photo_pt[0], photo_pt[1], obs_repr_pt[0], obs_repr_pt[1])
        s_s = exp(-d / r_m)

    return w_t * s_t + w_s * s_s
