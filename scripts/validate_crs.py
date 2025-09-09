# scripts/validate_crs.py
from pyproj import CRS

codes = [6669, 6670, 6671, 6672, 6673, 6674, 6675, 6676, 6677, 6678, 6679, 6680, 6681, 6682, 6683, 6684, 6685, 6686, 6687]
for c in codes:
    print(c, CRS.from_epsg(c).name)
