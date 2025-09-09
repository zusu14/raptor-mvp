# backend/app/services/export/shapefile.py
import shapefile  # pyshp
from pyproj import CRS, Transformer
from shapely.geometry import shape, LineString, Point, Polygon, mapping
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


def export_grouped_shapefiles(
    grouped: dict,
    out_zip: Path,
    target_epsg: int,
    encoding: str = "CP932",
):
    """
    grouped: {(date_prefix:str, individual_id:str, geom_type:str) -> list[Feature]}
      - geom_type: "Point" | "LineString" | "Polygon"
      - Feature: {"geometry": GeoJSON, "properties": {...}}
    出力: yyyymmdd_<individual>_<type>.shp をまとめて zip
    """
    out_dir = out_zip.parent / (out_zip.stem)
    out_dir.mkdir(parents=True, exist_ok=True)

    src_crs = CRS.from_epsg(4326)
    dst_crs = CRS.from_epsg(target_epsg)
    tf = Transformer.from_crs(src_crs, dst_crs, always_xy=True)

    def _write(path_base: Path, geom_type: str, fields: Tuple[Tuple[str,str,int,int], ...], rows: Iterable[Tuple]):
        w = shapefile.Writer(str(path_base), shapeType=getattr(shapefile, geom_type))
        w.encoding = encoding
        for f in fields:
            w.field(*f)
        for geom, attrs in rows:
            w.shape(geom)
            w.record(*attrs)
        w.close()
        (path_base.with_suffix('.prj')).write_text(dst_crs.to_wkt())

    for (date_prefix, individual, gtype), feats in grouped.items():
        # 共通フィールド（DBF制約に配慮して短名）
        # obs_id N, species C(50), count N, behav C(10), indiv C(50), started C(19), ended C(19)
        common_fields = (
            ("obs_id", "N", 18, 0),
            ("species", "C", 50, 0),
            ("count", "N", 10, 0),
            ("behav", "C", 10, 0),
            ("indiv", "C", 50, 0),
            ("started", "C", 25, 0),
            ("ended", "C", 25, 0),
        )

        rows = []
        if gtype == "LineString":
            for feat in feats:
                geom_ll = shape(feat["geometry"])  # LineString EPSG:4326
                coords = [tf.transform(x, y) for x, y in geom_ll.coords]
                geom = shapefile.Shape(shapeType=shapefile.POLYLINE)
                geom.points = coords
                attrs = (
                    feat["properties"].get("observation_id"),
                    feat["properties"].get("species"),
                    feat["properties"].get("count"),
                    feat["properties"].get("behavior"),
                    feat["properties"].get("individual_id"),
                    (feat["properties"].get("started_at") or "")[:25],
                    (feat["properties"].get("ended_at") or "")[:25],
                )
                rows.append((geom, attrs))
            fname = f"{date_prefix}_{individual}_line"
            _write(out_dir / fname, "POLYLINE", common_fields, rows)

        elif gtype == "Point":
            for feat in feats:
                pt = shape(feat["geometry"])  # Point
                x, y = tf.transform(pt.x, pt.y)
                geom = shapefile.Shape(shapeType=shapefile.POINT)
                geom.points = [(x, y)]
                attrs = (
                    feat["properties"].get("observation_id"),
                    feat["properties"].get("species"),
                    feat["properties"].get("count"),
                    feat["properties"].get("behavior"),
                    feat["properties"].get("individual_id"),
                    (feat["properties"].get("started_at") or "")[:25],
                    (feat["properties"].get("ended_at") or "")[:25],
                )
                rows.append((geom, attrs))
            fname = f"{date_prefix}_{individual}_point"
            _write(out_dir / fname, "POINT", common_fields, rows)

        elif gtype == "Polygon":
            for feat in feats:
                poly = shape(feat["geometry"])  # Polygon
                geom = shapefile.Shape(shapeType=shapefile.POLYGON)
                # 単純化: 外輪のみ（穴は考慮しない）
                coords = list(poly.exterior.coords)
                coords_tf = [tf.transform(x, y) for x, y in coords]
                geom.points = coords_tf
                attrs = (
                    feat["properties"].get("observation_id"),
                    feat["properties"].get("species"),
                    feat["properties"].get("count"),
                    feat["properties"].get("behavior"),
                    feat["properties"].get("individual_id"),
                    (feat["properties"].get("started_at") or "")[:25],
                    (feat["properties"].get("ended_at") or "")[:25],
                )
                rows.append((geom, attrs))
            fname = f"{date_prefix}_{individual}_polygon"
            _write(out_dir / fname, "POLYGON", common_fields, rows)

    # zip化
    import shutil
    shutil.make_archive(str(out_dir), 'zip', root_dir=out_dir)
    Path(str(out_dir) + '.zip').replace(out_zip)
