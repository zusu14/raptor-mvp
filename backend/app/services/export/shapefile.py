# backend/app/services/export/shapefile.py
import shapefile  # pyshp
from pyproj import CRS, Transformer
from shapely.geometry import shape, LineString, Point, mapping
from pathlib import Path
from typing import Iterable, Tuple

# target_epsg: 例 6677 (JGD2011 / 平面直角9系)

def export_shapefiles(line_features: Iterable[dict], point_features: Iterable[dict], out_zip: Path, target_epsg: int, encoding: str = "CP932"):
    out_dir = out_zip.parent / (out_zip.stem)
    out_dir.mkdir(parents=True, exist_ok=True)

    src_crs = CRS.from_epsg(4326)
    dst_crs = CRS.from_epsg(target_epsg)
    tf = Transformer.from_crs(src_crs, dst_crs, always_xy=True)

    def _write_shp(path_base: Path, geom_type: str, fields: Tuple[Tuple[str,str,int,int], ...], rows: Iterable[Tuple]):
        w = shapefile.Writer(str(path_base), shapeType=getattr(shapefile, geom_type))
        w.encoding = encoding
        for f in fields:
            w.field(*f)
        for geom, attrs in rows:
            w.shape(geom)
            w.record(*attrs)
        w.close()
        # .prj
        (path_base.with_suffix('.prj')).write_text(dst_crs.to_wkt())

    # Lines
    line_path = out_dir / "flightlines"
    line_fields = (("obs_id", "N", 18, 0), ("species","C",50,0), ("count","N",10,0), ("behavior","C",10,0))
    line_rows = []
    for feat in line_features:
        geom_ll = shape(feat["geometry"])  # EPSG:4326
        coords = [tf.transform(x,y) for x,y in geom_ll.coords]
        geom = shapefile.Shape(shapeType=shapefile.POLYLINE)
        geom.points = coords
        attrs = (feat["properties"].get("observation_id"), feat["properties"].get("species"), feat["properties"].get("count"), feat["properties"].get("behavior"))
        line_rows.append((geom, attrs))
    _write_shp(line_path, "POLYLINE", line_fields, line_rows)

    # Points（観察点の代表座標）
    pt_path = out_dir / "observations"
    pt_fields = (("obs_id","N",18,0),("species","C",50,0),("count","N",10,0))
    pt_rows = []
    for feat in point_features:
        pt = shape(feat["geometry"])  # Point
        x,y = tf.transform(pt.x, pt.y)
        geom = shapefile.Shape(shapeType=shapefile.POINT)
        geom.points = [(x,y)]
        attrs = (feat["properties"].get("observation_id"), feat["properties"].get("species"), feat["properties"].get("count"))
        pt_rows.append((geom, attrs))
    _write_shp(pt_path, "POINT", pt_fields, pt_rows)

    # zip化
    import shutil
    shutil.make_archive(str(out_dir), 'zip', root_dir=out_dir)
    Path(str(out_dir) + '.zip').replace(out_zip)
