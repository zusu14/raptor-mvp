# backend/app/services/exif/reader.py
from PIL import Image
import ExifRead
from datetime import datetime
from typing import Optional, Tuple

EXIF_DT_KEYS = ["EXIF DateTimeOriginal", "EXIF DateTimeDigitized", "Image DateTime"]

def parse_exif(path: str):
    # 生EXIF（補助）
    with open(path, 'rb') as f:
        tags = ExifRead.process_file(f, details=False)
    # PillowでGPS
    img = Image.open(path)
    gps_info = img.getexif().get_ifd(0x8825) if hasattr(img, 'getexif') else None

    def _to_deg(values, ref):
        if not values:
            return None
        d = values[0][0]/values[0][1]
        m = values[1][0]/values[1][1]
        s = values[2][0]/values[2][1]
        deg = d + m/60 + s/3600
        if ref in ['S','W']:
            deg *= -1
        return deg

    lon = lat = None
    if gps_info:
        lat = _to_deg(gps_info.get(2), gps_info.get(1))
        lon = _to_deg(gps_info.get(4), gps_info.get(3))

    # 撮影日時（JSTに正規化は上位で）
    taken_at = None
    for k in EXIF_DT_KEYS:
        if k in tags:
            try:
                taken_at = datetime.strptime(str(tags[k]), "%Y:%m:%d %H:%M:%S")
                break
            except Exception:
                pass

    return {
        "taken_at": taken_at.isoformat() if taken_at else None,
        "gps_point": {"lon": lon, "lat": lat} if (lon and lat) else None,
        "exif_raw": {k: str(v) for k, v in tags.items() if k in EXIF_DT_KEYS}
    }
