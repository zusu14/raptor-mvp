// frontend/src/components/MapView.tsx
import React, { useEffect, useRef } from "react"; // ← 追加（React を明示）
import maplibregl from "maplibre-gl";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import FreehandMode from "mapbox-gl-draw-freehand-mode";
import "maplibre-gl/dist/maplibre-gl.css"; // ← 追加（CSS）
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import { GSI_STANDARD, GSI_CREDIT } from "../lib/gsi";
import drawStyles from "../lib/drawStyles";

// …（中身はそのまま）…

export default function MapView() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const map = new maplibregl.Map({
      container: ref.current,
      style: {
        version: 8,
        sources: {
          gsi: {
            type: "raster",
            tiles: [GSI_STANDARD],
            tileSize: 256,
            attribution: GSI_CREDIT,
          },
        },
        layers: [{ id: "gsi", type: "raster", source: "gsi" }],
      },
      center: [139.76, 35.68],
      zoom: 12,
    });

    const modes = { ...MapboxDraw.modes, draw_freehand: FreehandMode } as any;
    const draw = new MapboxDraw({ displayControlsDefault: false, modes, styles: drawStyles });
    // Debug: verify styles actually applied (check console)
    try {
      const styles = (draw as any).options?.styles as any[] | undefined;
      if (styles) {
        // Log only draw line styles
        const sample = styles
          .filter((l) => String(l.id).includes("gl-draw-lines"))
          .map((l) => ({ id: l.id, lineDash: l.paint?.["line-dasharray"] }));
        console.log("Draw styles (gl-draw-lines):", sample);
      }
    } catch {}
    map.addControl(draw);
    map.addControl(new maplibregl.NavigationControl());

    // 地図PNGキャプチャ（凡例・クレジット焼き込み）
    (window as any).captureMap = async () => {
      const canvas = map.getCanvas();
      const dataUrl = canvas.toDataURL("image/png");
      // 必要に応じてCanvasに凡例や北矢印を合成（省略）し、サーバへPOST
      return dataUrl;
    };

    return () => map.remove();
  }, []);
  return <div ref={ref} style={{ width: "100%", height: "100%" }} />;
}
