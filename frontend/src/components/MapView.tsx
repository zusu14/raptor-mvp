// frontend/src/components/MapView.tsx
import React, { useEffect, useRef, useState } from "react"; // ← 追加（React を明示）
import maplibregl from "maplibre-gl";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import FreehandMode from "mapbox-gl-draw-freehand-mode";
import "maplibre-gl/dist/maplibre-gl.css"; // ← 追加（CSS）
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import "../styles/mapbox-draw-maplibre-compat.css";
import { GSI_STANDARD, GSI_CREDIT } from "../lib/gsi";
import drawStyles from "../lib/drawStyles";
import { api } from "../lib/api";

// …（中身はそのまま）…

export default function MapView() {
  const ref = useRef<HTMLDivElement>(null);
  const drawRef = useRef<any>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [savedFeatures, setSavedFeatures] = useState<any[]>([]);
  const [hiddenIndividualIds, setHiddenIndividualIds] = useState<string[]>([]);
  const [savedPanelOpen, setSavedPanelOpen] = useState<boolean>(false);
  const [expandedIndividuals, setExpandedIndividuals] = useState<string[]>([]);
  const [exportPanelOpen, setExportPanelOpen] = useState<boolean>(false);
  const [exportEpsg, setExportEpsg] = useState<number>(6677);
  const [exportEncoding, setExportEncoding] = useState<string>("CP932");
  const [exportVisibleOnly, setExportVisibleOnly] = useState<boolean>(true);
  const [exportSelectedIds, setExportSelectedIds] = useState<string[]>([]);
  const [exportBusy, setExportBusy] = useState<boolean>(false);

  // 入力フォーム状態
  const [surveyId, setSurveyId] = useState<number>(1);
  const [species, setSpecies] = useState<string>("");
  const [count, setCount] = useState<number>(1);
  const [behavior, setBehavior] = useState<"flight" | "circle" | "rest">("flight");
  const [startedAt, setStartedAt] = useState<string>("");
  const [endedAt, setEndedAt] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [individualId, setIndividualId] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);
  const [msg, setMsg] = useState<string>("");
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
    const draw = new MapboxDraw({
      displayControlsDefault: false,
      modes,
      styles: drawStyles,
      controls: { point: true, line_string: true, polygon: true, trash: true },
    } as any);
    // Debug log removed
    map.addControl(draw, "top-left");
    drawRef.current = draw;
    map.addControl(new maplibregl.NavigationControl(), "bottom-right");
    mapRef.current = map;

    // 保存レイヤを用意（スタイルロード後）
    if (map.isStyleLoaded()) {
      ensureSavedLayers();
      // 初回ロードで保存済みも取得
      loadSaved();
    } else {
      map.on("load", () => {
        ensureSavedLayers();
        loadSaved();
      });
    }

    // 地図PNGキャプチャ（凡例・クレジット焼き込み）
    (window as any).captureMap = async () => {
      const canvas = map.getCanvas();
      const dataUrl = canvas.toDataURL("image/png");
      // 必要に応じてCanvasに凡例や北矢印を合成（省略）し、サーバへPOST
      return dataUrl;
    };

    return () => map.remove();
  }, []);

  // 保存処理
  async function handleSave() {
    setMsg("");
    const draw = drawRef.current;
    if (!draw) return;

    const sel = draw.getSelected();
    let feature = sel?.features?.[0];
    if (!feature) {
      const all = draw.getAll();
      feature = all?.features?.[all.features.length - 1];
    }
    if (!feature) {
      setMsg("図形がありません。点/線/面のいずれかを描画してください。");
      return;
    }
    const gtype = feature.geometry?.type;
    if (!["Point", "LineString", "Polygon"].includes(gtype)) {
      setMsg(`未対応の形状タイプです: ${gtype}`);
      return;
    }

    if (!species || !count || !startedAt || !endedAt) {
      setMsg("必須項目（種名・個体数・開始/終了）が未入力です。");
      return;
    }

    const startedIso = new Date(startedAt).toISOString();
    const endedIso = new Date(endedAt).toISOString();

      const payload = {
        observation: {
          survey_id: surveyId,
          individual_id: individualId || null,
          species,
          count,
          behavior,
          started_at: startedIso,
          ended_at: endedIso,
          notes,
      },
      feature: {
        type: "Feature",
        geometry: feature.geometry,
        properties: {},
      },
    };

    try {
      setBusy(true);
      const res = await api.post("/observations/record", payload);
      setMsg(`保存しました: observation_id=${res.data.observation_id}`);
      // 保存後表示: サーバの保存レイヤを再読込
      await loadSaved();
      // Draw 図形の扱い
      if (keepDrawAfterSave) {
        draw.changeMode("simple_select");
      } else {
        draw.deleteAll();
      }
      setSpecies("");
      setCount(1);
      setBehavior("flight");
      setStartedAt("");
      setEndedAt("");
      setNotes("");
    } catch (e: any) {
      setMsg(`保存に失敗しました: ${e?.response?.data?.detail || e.message}`);
    } finally {
      setBusy(false);
    }
  }

  // 保存済みレイヤの状態
  const [showPoints, setShowPoints] = useState(true);
  const [showLines, setShowLines] = useState(true);
  const [showPolygons, setShowPolygons] = useState(true);
  const [keepDrawAfterSave, setKeepDrawAfterSave] = useState(false);

  function ensureSavedLayers() {
    const map = mapRef.current;
    if (!map) return;
    if (!map.isStyleLoaded()) return; // guard until style is fully loaded
    if (!map.getSource("saved")) {
      map.addSource("saved", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      } as any);

      // Polygons (fill)
      if (!map.getLayer("saved-polygons-fill")) {
        map.addLayer({
          id: "saved-polygons-fill",
          type: "fill",
          source: "saved",
          filter: ["==", ["geometry-type"], "Polygon"],
          paint: {
            "fill-color": "#29b6f6",
            "fill-opacity": 0.2,
          },
        } as any);
      }
      // Polygons (outline)
      if (!map.getLayer("saved-polygons-outline")) {
        map.addLayer({
          id: "saved-polygons-outline",
          type: "line",
          source: "saved",
          filter: ["==", ["geometry-type"], "Polygon"],
          paint: {
            "line-color": "#0288d1",
            "line-width": 2,
          },
        } as any);
      }
      // Lines
      if (!map.getLayer("saved-lines")) {
        map.addLayer({
          id: "saved-lines",
          type: "line",
          source: "saved",
          filter: ["==", ["geometry-type"], "LineString"],
          paint: {
            "line-color": "#43a047",
            "line-width": 3,
          },
        } as any);
      }
      // Points
      if (!map.getLayer("saved-points")) {
        map.addLayer({
          id: "saved-points",
          type: "circle",
          source: "saved",
          filter: ["==", ["geometry-type"], "Point"],
          paint: {
            "circle-radius": 5,
            "circle-color": "#ef6c00",
            "circle-stroke-color": "#d84315",
            "circle-stroke-width": 1,
          },
        } as any);
      }
    }

    // 可視状態反映
    setLayerVisibility("saved-points", showPoints);
    setLayerVisibility("saved-lines", showLines);
    setLayerVisibility("saved-polygons-fill", showPolygons);
    setLayerVisibility("saved-polygons-outline", showPolygons);
  }

  function setLayerVisibility(id: string, visible: boolean) {
    const map = mapRef.current;
    if (!map || !map.getLayer(id)) return;
    map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
  }

  function applySavedFilters() {
    const map = mapRef.current;
    if (!map) return;
    const hidden = hiddenIndividualIds;
    const notHiddenFilter: any = ["!", ["in", ["get", "individual_id"], ["literal", hidden]]];
    const pointFilter: any = ["all", ["==", ["geometry-type"], "Point"], notHiddenFilter];
    const lineFilter: any = ["all", ["==", ["geometry-type"], "LineString"], notHiddenFilter];
    const polyFilter: any = ["all", ["==", ["geometry-type"], "Polygon"], notHiddenFilter];
    if (map.getLayer("saved-points")) map.setFilter("saved-points", pointFilter as any);
    if (map.getLayer("saved-lines")) map.setFilter("saved-lines", lineFilter as any);
    if (map.getLayer("saved-polygons-fill")) map.setFilter("saved-polygons-fill", polyFilter as any);
    if (map.getLayer("saved-polygons-outline")) map.setFilter("saved-polygons-outline", polyFilter as any);
  }

  async function loadSaved() {
    const map = mapRef.current;
    if (!map) return;
    if (!map.isStyleLoaded()) {
      // wait for style load then retry once
      map.once("load", () => {
        ensureSavedLayers();
        // fire-and-forget reload
        setTimeout(() => { loadSaved(); }, 0);
      });
      return;
    }
    ensureSavedLayers();
    try {
      const res = await api.get("/observations/features", { params: { survey_id: surveyId } });
      const fc = res.data;
      setSavedFeatures(fc?.features || []);
      // エクスポート用の個体ID初期化（未選択→全件）
      const ids = Array.from(
        new Set((fc?.features || []).map((f: any) => f?.properties?.individual_id).filter(Boolean))
      ) as string[];
      setExportSelectedIds((prev) => (prev && prev.length ? prev : ids));
      const src = map.getSource("saved") as any;
      if (src) src.setData(fc);
      // 反映
      setLayerVisibility("saved-points", showPoints);
      setLayerVisibility("saved-lines", showLines);
      setLayerVisibility("saved-polygons-fill", showPolygons);
      setLayerVisibility("saved-polygons-outline", showPolygons);
      applySavedFilters();
    } catch (e) {
      console.warn("Failed to load saved features", e);
    }
  }

  // エクスポートZIPを保存ダイアログで保存（Chromium系ではFile System Access API、それ以外はダウンロードにフォールバック）
  async function saveZipWithDialog(zipBlob: Blob, suggestedName: string) {
    const anyWin: any = window as any;
    try {
      if (typeof anyWin.showSaveFilePicker === "function") {
        const handle = await anyWin.showSaveFilePicker({
          suggestedName,
          types: [
            { description: "ZIP file", accept: { "application/zip": [".zip"] } },
          ],
        });
        const writable = await handle.createWritable();
        await writable.write(zipBlob);
        await writable.close();
        return;
      }
    } catch (e) {
      // ユーザーがダイアログをキャンセルした場合はフォールバックしないで終了
      const name = (e as any)?.name || "";
      const msg = (e as any)?.message || "";
      if (name === "AbortError" || /abort|cancel/i.test(msg)) {
        return; // 何もしない（再度ポップアップを出さない）
      }
      // それ以外の例外はフォールバックへ
    }
    // フォールバック: 通常ダウンロード（ブラウザ設定により保存ダイアログが出る場合あり）
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = suggestedName || "export.zip";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 0);
  }

  

  // surveyId 変更時に保存レイヤを再読込
  useEffect(() => {
    loadSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surveyId]);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <div ref={ref} style={{ width: "100%", height: "100%" }} />
      {/* 入力パネル */}
      <div
        style={{
          position: "absolute",
          right: 12,
          top: 12,
          width: 320,
          padding: 12,
          background: "rgba(255,255,255,0.95)",
          borderRadius: 8,
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
          fontSize: 14,
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 8 }}>観察入力</div>
          <div style={{ display: "grid", gap: 8 }}>
          {/* 保存済みデータパネル */}
          <div style={{ border: "1px solid #ddd", borderRadius: 6 }}>
            <div
              style={{ padding: 8, cursor: "pointer", display: "flex", alignItems: "center" }}
              onClick={() => setSavedPanelOpen((v) => !v)}
            >
              <span style={{ fontWeight: 600 }}>保存済みデータ</span>
              <span style={{ marginLeft: "auto" }}>{savedPanelOpen ? "▾" : "▸"}</span>
            </div>
            {savedPanelOpen && (
              <div style={{ padding: 8, display: "grid", gap: 8, maxHeight: 260, overflow: "auto" }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => {
                      setHiddenIndividualIds([]);
                      applySavedFilters();
                    }}
                  >
                    全表示
                  </button>
                  <button
                    onClick={() => {
                      const ids = Array.from(
                        new Set((savedFeatures || []).map((f: any) => f?.properties?.individual_id).filter(Boolean))
                      ) as string[];
                      setHiddenIndividualIds(ids);
                      applySavedFilters();
                    }}
                  >
                    全非表示
                  </button>
                  <button onClick={loadSaved} style={{ marginLeft: "auto" }}>
                    再読込
                  </button>
                </div>
                <div>
                  {(() => {
                    const groups: Record<string, any[]> = {};
                    for (const f of savedFeatures || []) {
                      const id = f?.properties?.individual_id;
                      if (!id) continue;
                      (groups[id] = groups[id] || []).push(f);
                    }
                    const ids = Object.keys(groups).sort();
                    return ids.map((id) => {
                      const hidden = hiddenIndividualIds.includes(id);
                      const expanded = expandedIndividuals.includes(id);
                      const species = groups[id][0]?.properties?.species ?? "";
                      return (
                        <div key={id} style={{ borderBottom: "1px dashed #eee", padding: "4px 0" }}>
                          <div style={{ display: "flex", alignItems: "center" }}>
                            <button
                              title={hidden ? "表示" : "非表示"}
                              onClick={() => {
                                setHiddenIndividualIds((prev) => {
                                  const set = new Set(prev);
                                  if (hidden) set.delete(id); else set.add(id);
                                  return Array.from(set);
                                });
                                setTimeout(applySavedFilters, 0);
                              }}
                              style={{ width: 28 }}
                            >
                              {hidden ? "🙈" : "👁️"}
                            </button>
                            <button
                              onClick={() => {
                                setExpandedIndividuals((prev) => {
                                  const set = new Set(prev);
                                  if (expanded) set.delete(id); else set.add(id);
                                  return Array.from(set);
                                });
                              }}
                              style={{ marginLeft: 6 }}
                              title={expanded ? "閉じる" : "展開"}
                            >
                              {expanded ? "▾" : "▸"}
                            </button>
                            <div style={{ marginLeft: 8, fontFamily: "monospace" }}>{id}</div>
                            <div style={{ marginLeft: 8, color: "#555" }}>{species}</div>
                            <div style={{ marginLeft: "auto", color: "#999" }}>{groups[id].length}件</div>
                          </div>
                          {expanded && (
                            <div style={{ paddingLeft: 36, marginTop: 4, display: "grid", gap: 4 }}>
                              {groups[id].map((f, i) => {
                                const p = f.properties || {};
                                const t = f.geometry?.type;
                                const label = t === "Point" ? "点" : t === "LineString" ? "線" : t === "Polygon" ? "面" : t;
                                return (
                                  <div key={`${id}-${t}-${p.feature_id}-${i}`} style={{ display: "flex", alignItems: "center" }}>
                                    <div style={{ width: 24, color: "#666" }}>{label}</div>
                                    <div style={{ marginLeft: 8, color: "#666" }}>obs:{p.observation_id}</div>
                                    <div style={{ marginLeft: 8, color: "#999" }}>id:{p.feature_id}</div>
                                    <button
                                      style={{ marginLeft: "auto", color: "#b00" }}
                                      title="削除"
                                      onClick={async () => {
                                        try {
                                          await api.delete("/observations/feature", { params: { feature_table: p.feature_table, feature_id: p.feature_id } });
                                          await loadSaved();
                                        } catch (e) {
                                          console.warn("delete failed", e);
                                        }
                                      }}
                                    >
                                      削除
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            )}
          </div>

          {/* エクスポートパネル */}
          <div style={{ border: "1px solid #ddd", borderRadius: 6 }}>
            <div
              style={{ padding: 8, cursor: "pointer", display: "flex", alignItems: "center" }}
              onClick={() => setExportPanelOpen((v) => !v)}
            >
              <span style={{ fontWeight: 600 }}>エクスポート（Shapefile）</span>
              <span style={{ marginLeft: "auto" }}>{exportPanelOpen ? "▾" : "▸"}</span>
            </div>
            {exportPanelOpen && (
              <div style={{ padding: 8, display: "grid", gap: 8 }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <label>
                    EPSG
                    <select
                      value={exportEpsg}
                      onChange={(e) => setExportEpsg(parseInt(e.target.value, 10))}
                      style={{ width: 140, marginLeft: 6 }}
                    >
                      {Array.from({ length: 6687 - 6669 + 1 }, (_, i) => 6669 + i).map((code) => (
                        <option key={code} value={code}>
                          {code}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    文字コード
                    <select
                      value={exportEncoding}
                      onChange={(e) => setExportEncoding(e.target.value)}
                      style={{ width: 120, marginLeft: 6 }}
                    >
                      <option value="CP932">CP932</option>
                      <option value="UTF-8">UTF-8</option>
                    </select>
                  </label>
                </div>
                
                <label>
                  <input
                    type="checkbox"
                    checked={exportVisibleOnly}
                    onChange={(e) => setExportVisibleOnly(e.target.checked)}
                  />
                  現在表示中のみ（個体IDトグルを反映）
                </label>
                {!exportVisibleOnly && (
                  <div style={{ maxHeight: 160, overflow: "auto", border: "1px solid #eee", borderRadius: 4, padding: 6 }}>
                    <div style={{ marginBottom: 6, display: "flex", gap: 8 }}>
                      <button
                        onClick={() => {
                          const ids = Array.from(
                            new Set((savedFeatures || []).map((f: any) => f?.properties?.individual_id).filter(Boolean))
                          ) as string[];
                          setExportSelectedIds(ids);
                        }}
                      >
                        全選択
                      </button>
                      <button onClick={() => setExportSelectedIds([])}>全解除</button>
                    </div>
                    {Array.from(
                      new Set((savedFeatures || []).map((f: any) => f?.properties?.individual_id).filter(Boolean))
                    )
                      .sort()
                      .map((id: any) => {
                        const checked = exportSelectedIds.includes(id);
                        return (
                          <label key={id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 0" }}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                setExportSelectedIds((prev) => {
                                  const set = new Set(prev);
                                  if (e.target.checked) set.add(id);
                                  else set.delete(id);
                                  return Array.from(set);
                                });
                              }}
                            />
                            <span style={{ fontFamily: "monospace" }}>{id}</span>
                          </label>
                        );
                      })}
                  </div>
                )}
                <button
                  disabled={exportBusy}
                  onClick={async () => {
                    try {
                      setExportBusy(true);
                      // 個体IDの決定
                      let ids: string[] = [];
                      if (exportVisibleOnly) {
                        const allIds = Array.from(
                          new Set((savedFeatures || []).map((f: any) => f?.properties?.individual_id).filter(Boolean))
                        ) as string[];
                        const visible = allIds.filter((id) => !hiddenIndividualIds.includes(id));
                        ids = visible;
                      } else {
                        ids = exportSelectedIds;
                      }
                      const params: any = {
                        survey_id: surveyId,
                        target_epsg: exportEpsg,
                        encoding: exportEncoding,
                      };
                      if (ids && ids.length) params.individual_ids = ids.join(",");
                      const res = await api.post(
                        "/export/shapefile",
                        null,
                        { params, responseType: "blob" }
                      );
                      // ファイル名はContent-Dispositionから取得（無ければ既定）
                      const cd = (res.headers as any)["content-disposition"] || "";
                      let fname = `survey_${surveyId}.zip`;
                      const m = /filename="?([^";]+)"?/i.exec(cd);
                      if (m && m[1]) fname = m[1];
                      const blob = new Blob([res.data], { type: "application/zip" });
                      await saveZipWithDialog(blob, fname);
                    } catch (e: any) {
                      alert(`エクスポートに失敗しました: ${e?.response?.data?.detail || e.message}`);
                    } finally {
                      setExportBusy(false);
                    }
                  }}
                >
                  {exportBusy ? "エクスポート中..." : "エクスポート"}
                </button>
                <div style={{ color: "#666" }}>ファイル名: 調査日_個体ID_型.shp をZIPにまとめます。</div>
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <label>
              <input
                type="checkbox"
                checked={showPoints}
                onChange={(e) => {
                  setShowPoints(e.target.checked);
                  setLayerVisibility("saved-points", e.target.checked);
                  applySavedFilters();
                }}
              />
              点
            </label>
            <label>
              <input
                type="checkbox"
                checked={showLines}
                onChange={(e) => {
                  setShowLines(e.target.checked);
                  setLayerVisibility("saved-lines", e.target.checked);
                  applySavedFilters();
                }}
              />
              線
            </label>
            <label>
              <input
                type="checkbox"
                checked={showPolygons}
                onChange={(e) => {
                  setShowPolygons(e.target.checked);
                  setLayerVisibility("saved-polygons-fill", e.target.checked);
                  setLayerVisibility("saved-polygons-outline", e.target.checked);
                  applySavedFilters();
                }}
              />
              面
            </label>
            <button onClick={loadSaved} style={{ marginLeft: "auto" }}>再読込</button>
          </div>
          <label>
            Survey ID
            <input
              type="number"
              value={surveyId}
              onChange={(e) => setSurveyId(parseInt(e.target.value || "1", 10))}
              style={{ width: "100%" }}
            />
          </label>
          <label>
            種名
            <input
              value={species}
              onChange={(e) => setSpecies(e.target.value)}
              placeholder="例: ハイタカ"
              style={{ width: "100%" }}
            />
          </label>
          <label>
            個体ID
            <input
              value={individualId}
              onChange={(e) => setIndividualId(e.target.value)}
              placeholder="例: IND-2025-001"
              style={{ width: "100%" }}
            />
          </label>
          <label>
            個体数
            <input
              type="number"
              min={1}
              value={count}
              onChange={(e) => setCount(parseInt(e.target.value || "1", 10))}
              style={{ width: "100%" }}
            />
          </label>
          <div>
            行動：
            <label style={{ marginRight: 8 }}>
              <input
                type="radio"
                name="behavior"
                checked={behavior === "flight"}
                onChange={() => setBehavior("flight")}
              />
              飛翔
            </label>
            <label style={{ marginRight: 8 }}>
              <input
                type="radio"
                name="behavior"
                checked={behavior === "circle"}
                onChange={() => setBehavior("circle")}
              />
              旋回
            </label>
            <label>
              <input
                type="radio"
                name="behavior"
                checked={behavior === "rest"}
                onChange={() => setBehavior("rest")}
              />
              休息
            </label>
          </div>
          <label>
            観察開始
            <input
              type="datetime-local"
              value={startedAt}
              onChange={(e) => setStartedAt(e.target.value)}
              style={{ width: "100%" }}
            />
          </label>
          <label>
            観察終了
            <input
              type="datetime-local"
              value={endedAt}
              onChange={(e) => setEndedAt(e.target.value)}
              style={{ width: "100%" }}
            />
          </label>
          <label>
            備考
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              style={{ width: "100%" }}
            />
          </label>
          <button onClick={handleSave} disabled={busy}>
            {busy ? "保存中..." : "保存"}
          </button>
          <label>
            <input
              type="checkbox"
              checked={keepDrawAfterSave}
              onChange={(e) => setKeepDrawAfterSave(e.target.checked)}
            />
            保存後もDrawの図形を残す
          </label>
          {msg && (
            <div style={{ color: msg.startsWith("保存に失敗") ? "#d33" : "#090" }}>{msg}</div>
          )}
          <div style={{ color: "#555" }}>
            図形は「点・線・面」いずれでも可。選択中があればそれを保存、なければ最後に描画したものを保存します。
          </div>
        </div>
      </div>
    </div>
  );
}
