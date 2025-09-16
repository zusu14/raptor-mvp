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
import { useNavigate, useParams } from "react-router-dom";

// …（中身はそのまま）…

export default function MapView() {
  const ref = useRef<HTMLDivElement>(null);
  const drawRef = useRef<any>(null);
  const navCtrlRef = useRef<maplibregl.NavigationControl | null>(null);
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
  const [activeDrawMode, setActiveDrawMode] = useState<string>('simple_select');
  const [stickyDrawMode, setStickyDrawMode] = useState<string | null>(null); // draw_point/line_string/polygon or null
  const stickyDrawModeRef = useRef<string | null>(null);
  const [freehandTarget, setFreehandTarget] = useState<'LineString'|'Polygon'|null>(null);
  const freehandTargetRef = useRef<'LineString'|'Polygon'|null>(null);
  // カスタム実装：フリーハンド「線」用（一部プラグインが常にPolygonを生成するため）
  const customFHActiveRef = useRef(false);
  const customFHCapturingRef = useRef(false);
  const customFHFeatIdRef = useRef<string | null>(null);
  const customFHTargetRef = useRef<'LineString'|'Polygon'|null>(null);
  const customFHLastScreenRef = useRef<{x:number,y:number}|null>(null);
  const PIXEL_TOL_SQ = 4; // 2px 相当（2*2）
  const [palettePos, setPalettePos] = useState<{x:number,y:number}>(() => {
    try { const raw = localStorage.getItem('raptor:ui:drawPalettePos'); if (raw) { const v = JSON.parse(raw); if (typeof v?.x==='number' && typeof v?.y==='number') return v; } } catch {}
    return { x: 12, y: 80 };
  });

  // 入力フォーム状態
  const nav = useNavigate();
  const { surveyId: surveyIdParam } = useParams();
  const surveyId = surveyIdParam ? parseInt(surveyIdParam, 10) : null;
  const [surveyName, setSurveyName] = useState<string>("");

  // 可視状態の永続化キー（ブラウザlocalStorageに保存）
  const visibilityKey = (sid: number) => `raptor:visibility:hiddenIndividuals:survey:${sid}`;
  const [species, setSpecies] = useState<string>("");
  const [count, setCount] = useState<number>(1);
  const [behavior, setBehavior] = useState<"flight" | "circle" | "rest">("flight");
  const [startedAt, setStartedAt] = useState<string>("");
  const [endedAt, setEndedAt] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [individualId, setIndividualId] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);
  const [msg, setMsg] = useState<string>("");
  // UI 設定（永続化）
  const [panelVisible, setPanelVisible] = useState<boolean>(() => {
    try { const raw = localStorage.getItem("raptor:ui:panelVisible"); return raw ? JSON.parse(raw) : true; } catch { return true; }
  });
  const [panelSide, setPanelSide] = useState<"left"|"right">(() => {
    try { const raw = localStorage.getItem("raptor:ui:panelSide"); return raw === 'left' ? 'left' : 'right'; } catch { return 'right'; }
  });
  const [controlsPos, setControlsPos] = useState<"top-left"|"top-right"|"bottom-left"|"bottom-right">(() => {
    try { const raw = localStorage.getItem("raptor:ui:controlsPos"); if (raw === 'top-right' || raw === 'bottom-left' || raw === 'bottom-right') return raw as any; } catch {}
    return 'top-left';
  });
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
      attributionControl: false,
      center: [139.76, 35.68],
      zoom: 12,
    });

    const modes = { ...MapboxDraw.modes, draw_freehand: FreehandMode } as any;
    const draw = new MapboxDraw({
      displayControlsDefault: false,
      modes,
      styles: drawStyles,
      controls: {},
    } as any);
    // Debug log removed
    map.addControl(draw, controlsPos);
    drawRef.current = draw;
    const nav = new maplibregl.NavigationControl();
    map.addControl(nav, controlsPos);
    navCtrlRef.current = nav;
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');
    // 現在地（追尾＋向き表示）コントロールを追加
    try {
      const geo = new (maplibregl as any).GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
        showUserHeading: true,
        fitBoundsOptions: { maxZoom: 16 },
      } as any);
      // ズームコントロールと被らない側に配置
      const geoPos = controlsPos.startsWith('bottom-')
        ? (controlsPos.endsWith('right') ? 'bottom-left' : 'bottom-right')
        : 'bottom-right';
      map.addControl(geo as any, geoPos as any);
    } catch {}
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

    // Drawモード変更を検知してUIに反映
    // 連続作成: Drawが作成完了後にsimple_selectへ戻しても、stickyが有効なら即座に同モードへ復帰
    // ヘルパ: フリーハンドのターゲットに応じた起動オプション
    const freehandOpts = (tgt: 'LineString'|'Polygon'|null|undefined) => ({
      // 代表的な実装が受け付ける可能性のあるキーを併記（未対応キーは無視される）
      feature: tgt === 'Polygon' ? 'Polygon' : 'LineString',
      line: tgt !== 'Polygon',
      lineString: tgt !== 'Polygon',
      polygon: tgt === 'Polygon',
    });

    map.on('draw.modechange', (e: any) => {
      const mode = e?.mode || 'simple_select';
      // 表示上のモード名（freehandはターゲット別に表示）
      if (mode === 'draw_freehand') {
        const tgt = freehandTargetRef.current;
        setActiveDrawMode(tgt === 'Polygon' ? 'freehand_polygon' : 'freehand_line');
      } else {
        setActiveDrawMode(mode);
      }
      const sticky = stickyDrawModeRef.current;
      if (sticky && mode === 'simple_select') {
        setTimeout(() => {
          try {
            const s = stickyDrawModeRef.current;
            if (s) {
              if (s === 'draw_freehand') {
                const tgt = freehandTargetRef.current;
                if (tgt === 'LineString') {
                  setActiveDrawMode('freehand_line');
                  enableCustomFreehand('LineString');
                } else if (tgt === 'Polygon') {
                  setActiveDrawMode('freehand_polygon');
                  enableCustomFreehand('Polygon');
                }
              } else {
                draw.changeMode(s as any);
                setActiveDrawMode(s as any);
              }
            }
          } catch {}
        }, 0);
      }
    });

    // freehand作図直後に自動保存（属性が揃っている場合）
    map.on('draw.create', async (e: any) => {
      try {
        const s = stickyDrawModeRef.current;
        if (s === 'draw_freehand') {
          const feat = (e && e.features && e.features[0]) || null;
          if (!feat || !feat.geometry) return;
          // カスタムfreehand（ライン/ポリゴン）で追加したものは対象外
          try {
            const src = feat?.properties?.source;
            if (src === 'freehand_custom_line' || src === 'freehand_custom_polygon') return;
          } catch {}
          let geom = feat.geometry;
          const tgt = freehandTargetRef.current;
          if (tgt === 'Polygon') {
            if (geom.type === 'LineString') {
              const coords = (geom.coordinates || []).slice();
              if (coords.length >= 3) {
                // 閉じてポリゴン化
                if (coords.length === 0 || (coords[0][0] !== coords[coords.length-1][0] || coords[0][1] !== coords[coords.length-1][1])) {
                  coords.push(coords[0]);
                }
                geom = { type: 'Polygon', coordinates: [coords] } as any;
              } else {
                // 頂点不足は保存せず中断
                return;
              }
            }
          } else if (tgt === 'LineString') {
            // 一部freehand実装はPolygonを返すことがある → LineStringへ矯正
            if (geom.type === 'Polygon') {
              let ring = (geom.coordinates && geom.coordinates[0]) || [];
              if (ring.length >= 2) {
                // 末尾が先頭と同じなら閉じ頂点を除去
                const first = ring[0];
                const last = ring[ring.length - 1];
                if (first && last && first[0] === last[0] && first[1] === last[1]) {
                  ring = ring.slice(0, -1);
                }
                geom = { type: 'LineString', coordinates: ring } as any;
              } else {
                return;
              }
            }
          }
          // 自動保存（成功しなかった場合は、描画中の図形をラインとして残す）
          let saved = false;
          try { saved = await saveGeometryAuto(geom); } catch {}
          if (!saved && tgt === 'LineString') {
            try {
              // 画面上にラインを残す（Drawフィーチャとして再追加）
              const added = draw.add({ type: 'Feature', geometry: geom, properties: { intended: 'LineString', source: 'freehand' } });
              // 追加したラインを選択状態に
              try { draw.changeMode('simple_select', { featureIds: added }); } catch {}
            } catch {}
          }
          // 画面上のドラフトを削除してクリア
          try { if (feat.id != null) draw.delete(String(feat.id)); } catch {}
        }
      } catch {}
    });

    // 地図PNGキャプチャ（凡例・クレジット焼き込み）
    (window as any).captureMap = async () => {
      const canvas = map.getCanvas();
      const dataUrl = canvas.toDataURL("image/png");
      // 必要に応じてCanvasに凡例や北矢印を合成（省略）し、サーバへPOST
      return dataUrl;
    };

    return () => map.remove();
  }, []);

  // UI設定の永続化
  useEffect(() => { try { localStorage.setItem("raptor:ui:panelVisible", JSON.stringify(panelVisible)); } catch {} }, [panelVisible]);
  useEffect(() => { try { localStorage.setItem("raptor:ui:panelSide", panelSide); } catch {} }, [panelSide]);
  useEffect(() => {
    try { localStorage.setItem("raptor:ui:controlsPos", controlsPos); } catch {}
    const map = mapRef.current;
    if (!map) return;
    try { if (drawRef.current) map.removeControl(drawRef.current); } catch {}
    try { if (navCtrlRef.current) map.removeControl(navCtrlRef.current as any); } catch {}
    try {
      if (drawRef.current) map.addControl(drawRef.current, controlsPos);
      if (navCtrlRef.current) map.addControl(navCtrlRef.current, controlsPos);
    } catch {}
  }, [controlsPos]);

  // パレット位置の永続化
  useEffect(() => {
    try { localStorage.setItem('raptor:ui:drawPalettePos', JSON.stringify(palettePos)); } catch {}
  }, [palettePos]);

  // stickyモードの参照を常に最新に
  useEffect(() => {
    stickyDrawModeRef.current = stickyDrawMode;
  }, [stickyDrawMode]);

  // スナックバー: メッセージの自動クローズ
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(""), 3000);
    return () => clearTimeout(t);
  }, [msg]);

  // 調査情報の取得（名称表示や存在確認）
  useEffect(() => {
    (async () => {
      if (!surveyId || Number.isNaN(surveyId)) {
        nav("/surveys", { replace: true });
        return;
      }
      try {
        const res = await api.get(`/surveys/${surveyId}`);
        setSurveyName(res?.data?.name || "");
        // 選択直後に飛翔データ等を再読込（地図準備は別effectで保障）
        await loadSaved();
      } catch (e) {
        // 存在しない → 一覧へ戻す
        nav("/surveys", { replace: true });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surveyId]);

  // 調査切替時にビュー状態を初期化し、明示的に保存レイヤをクリア
  useEffect(() => {
    const map = mapRef.current;
    // UI状態のリセット（前の調査のフィルタ/選択を持ち越さない）
    // 個体IDの可視状態は調査ごとにlocalStorageから復元
    if (surveyId) {
      try {
        const raw = localStorage.getItem(visibilityKey(surveyId));
        const parsed = raw ? (JSON.parse(raw) as string[]) : [];
        setHiddenIndividualIds(Array.isArray(parsed) ? parsed : []);
      } catch {
        setHiddenIndividualIds([]);
      }
    } else {
      setHiddenIndividualIds([]);
    }
    setExpandedIndividuals([]);
    setSavedFeatures([]);
    setExportSelectedIds([]);
    if (map && map.getSource("saved")) {
      const src: any = map.getSource("saved");
      src.setData({ type: "FeatureCollection", features: [] });
    }
    // 直後の再読込は既存の[surveyId]依存effectとmapのload時処理で実施されます
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surveyId]);

  // 非表示リストの変更を永続化（調査ごと）
  useEffect(() => {
    if (!surveyId) return;
    try {
      localStorage.setItem(visibilityKey(surveyId), JSON.stringify(hiddenIndividualIds));
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hiddenIndividualIds, surveyId]);

  // 保存処理
  async function handleSave() {
    setMsg("");
    if (!surveyId) {
      setMsg("調査が選択されていません。まず調査を選択してください。");
      return;
    }
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
    // freehand の線指定なのに Polygon が返ることがあるため、ここで最終的に LineString へ矯正
    let geometry: any = feature.geometry;
    if (geometry && geometry.type === 'Polygon') {
      const wantLine = (activeDrawMode === 'freehand_line') || (stickyDrawModeRef.current === 'draw_freehand' && freehandTargetRef.current === 'LineString');
      if (wantLine) {
        try {
          let ring = (geometry.coordinates && geometry.coordinates[0]) || [];
          if (Array.isArray(ring) && ring.length >= 2) {
            const first = ring[0];
            const last = ring[ring.length - 1];
            if (first && last && first[0] === last[0] && first[1] === last[1]) {
              ring = ring.slice(0, -1);
            }
            geometry = { type: 'LineString', coordinates: ring } as any;
          }
        } catch {}
      }
    }
    const gtype = geometry?.type;
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
        geometry,
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
        // 今回保存に使用したドラフトだけ削除し、他の未保存は残す
        try {
          const fid = (feature as any)?.id;
          if (fid != null) {
            draw.delete(String(fid));
          } else if (sel && Array.isArray(sel?.features) && sel.features.length) {
            // 念のため選択状態のものを削除（安全側）
            for (const f of sel.features) {
              try { if (f?.id != null) draw.delete(String(f.id)); } catch {}
            }
          }
        } catch {}
        try { draw.changeMode("simple_select"); } catch {}
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

  // freehand作図後の自動保存用（属性が揃っている時のみ保存）
  async function saveGeometryAuto(geometry: any): Promise<boolean> {
    try {
      if (!surveyId) return;
      // 必須が未入力なら自動保存は行わない
      if (!species || !count || !startedAt || !endedAt) return false;
      // Polygon→LineString の保険（freehand線指定時）
      if (geometry && geometry.type === 'Polygon' && (freehandTargetRef.current === 'LineString')) {
        try {
          let ring = (geometry.coordinates && geometry.coordinates[0]) || [];
          if (Array.isArray(ring) && ring.length >= 2) {
            const first = ring[0];
            const last = ring[ring.length - 1];
            if (first && last && first[0] === last[0] && first[1] === last[1]) {
              ring = ring.slice(0, -1);
            }
            geometry = { type: 'LineString', coordinates: ring } as any;
          }
        } catch {}
      }
      const startedIso = new Date(startedAt).toISOString();
      const endedIso = new Date(endedAt).toISOString();
      const payload: any = {
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
        feature: { type: 'Feature', geometry, properties: {} },
      };
      const res = await api.post("/observations/record", payload);
      setMsg(`保存しました: observation_id=${res.data?.observation_id ?? ''}`);
      await loadSaved();
      return true;
    } catch (e: any) {
      setMsg(`保存に失敗しました: ${e?.response?.data?.detail || e?.message || e}`);
      return false;
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
    // Drawのレイヤより下に"saved"レイヤを配置することで、描画操作のヒットテストを妨げない
    const layers = map.getStyle()?.layers || [] as any[];
    const drawLayer = layers.find((l:any)=> String(l.id||'').startsWith('gl-draw-'));
    const beforeId = drawLayer ? drawLayer.id : undefined;
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
        } as any, beforeId);
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
        } as any, beforeId);
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
        } as any, beforeId);
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
        } as any, beforeId);
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
    // 2引数形式: ["in", needle, haystack(array)] を使用（MapLibre v4互換）
    // hidden が空配列なら in(..., []) は常に false → not で常に true（全表示）
    const notHiddenFilter: any = [
      "!",
      ["in", ["get", "individual_id"], ["literal", hidden]],
    ];
    const pointFilter: any = [
      "all",
      ["==", ["geometry-type"], "Point"],
      notHiddenFilter,
    ];
    const lineFilter: any = [
      "all",
      ["==", ["geometry-type"], "LineString"],
      notHiddenFilter,
    ];
    const polyFilter: any = [
      "all",
      ["==", ["geometry-type"], "Polygon"],
      notHiddenFilter,
    ];
    if (map.getLayer("saved-points")) map.setFilter("saved-points", pointFilter as any);
    if (map.getLayer("saved-lines")) map.setFilter("saved-lines", lineFilter as any);
    if (map.getLayer("saved-polygons-fill")) map.setFilter("saved-polygons-fill", polyFilter as any);
    if (map.getLayer("saved-polygons-outline")) map.setFilter("saved-polygons-outline", polyFilter as any);
  }

  // 非表示IDの変更に追従してフィルタを適用（setStateの非同期反映に確実に追従）
  useEffect(() => {
    applySavedFilters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hiddenIndividualIds]);

  // 個体IDの全図形へズーム
  function focusIndividual(id: string) {
    const feats = (savedFeatures || []).filter((f: any) => f?.properties?.individual_id === id);
    const map = mapRef.current;
    if (!map || feats.length === 0) return;
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    const eat = (x: number, y: number) => {
      if (x < minx) minx = x; if (y < miny) miny = y;
      if (x > maxx) maxx = x; if (y > maxy) maxy = y;
    };
    for (const f of feats) {
      const g = f?.geometry;
      if (!g) continue;
      if (g.type === "Point") {
        const [x, y] = g.coordinates || [];
        if (typeof x === "number" && typeof y === "number") eat(x, y);
      } else if (g.type === "LineString") {
        for (const [x, y] of g.coordinates || []) eat(x, y);
      } else if (g.type === "Polygon") {
        for (const ring of g.coordinates || []) for (const [x, y] of ring) eat(x, y);
      }
    }
    if (minx === Infinity) return;
    map.fitBounds([[minx, miny], [maxx, maxy]], { padding: 40, duration: 600 });
  }

  // 現在地へ移動
  function flyToCurrentLocation() {
    if (!navigator.geolocation) { setMsg("位置情報が利用できません"); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { longitude, latitude } = pos.coords;
        const map = mapRef.current;
        if (!map) return;
        map.flyTo({ center: [longitude, latitude], zoom: Math.max(map.getZoom(), 14), duration: 800 });
      },
      () => setMsg("現在地の取得に失敗しました"),
      { enableHighAccuracy: true, timeout: 5000 }
    );
  }

  async function loadSaved() {
    const map = mapRef.current;
    if (!map) return;
    if (!surveyId) return;
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

  // パレット位置を画面内に収める
  function clampToViewport(x: number, y: number) {
    const pad = 8;
    const w = window.innerWidth || 1024;
    const h = window.innerHeight || 768;
    const pw = 280; // パレット概算幅
    const ph = 56;  // パレット概算高さ
    const nx = Math.max(pad, Math.min(w - pw - pad, x));
    const ny = Math.max(pad, Math.min(h - ph - pad, y));
    return { x: nx, y: ny };
  }

  // ボタンのトグル挙動: 同じボタンを再押下で選択（simple_select）に戻す
  function toggleDrawMode(mode: 'draw_point'|'draw_line_string'|'draw_polygon') {
    const draw = drawRef.current as any;
    if (!draw) return;
    if (activeDrawMode === mode) {
      setStickyDrawMode(null);
      stickyDrawModeRef.current = null;
      setFreehandTarget(null);
      setActiveDrawMode('simple_select');
      try { draw.changeMode('simple_select'); } catch {}
    } else {
      setStickyDrawMode(mode);
      stickyDrawModeRef.current = mode;
      setFreehandTarget(null);
      setActiveDrawMode(mode);
      try { draw.changeMode(mode); } catch {}
    }
  }

  function toggleFreehand(target: 'LineString'|'Polygon') {
    const draw = drawRef.current as any;
    if (!draw) return;
    const currentIsFree = activeDrawMode === 'freehand_line' || activeDrawMode === 'freehand_polygon';
    const want = target === 'Polygon' ? 'freehand_polygon' : 'freehand_line';
    if (currentIsFree && ((target==='Polygon' && activeDrawMode==='freehand_polygon') || (target==='LineString' && activeDrawMode==='freehand_line'))) {
      // トグルOFF → 選択
      setStickyDrawMode(null);
      stickyDrawModeRef.current = null;
      setFreehandTarget(null);
      freehandTargetRef.current = null;
      setActiveDrawMode('simple_select');
      try { draw.changeMode('simple_select'); } catch {}
      // カスタム freehand を無効化
      disableCustomFreehand();
    } else {
      setStickyDrawMode('draw_freehand');
      stickyDrawModeRef.current = 'draw_freehand';
      setFreehandTarget(target);
      freehandTargetRef.current = target;
      setActiveDrawMode(want);
      // Line/Polygon 共にカスタム実装へ統一
      enableCustomFreehand(target);
    }
  }

  function enableCustomFreehand(target: 'LineString'|'Polygon') {
    const map = mapRef.current as any;
    const draw = drawRef.current as any;
    if (!map || !draw) return;
    customFHTargetRef.current = target;
    if (customFHActiveRef.current) return;
    customFHActiveRef.current = true;

    const onDown = (e: any) => {
      if (!customFHActiveRef.current) return;
      customFHCapturingRef.current = true;
      const p = e.lngLat;
      const pt = e.point || (map && map.project ? map.project(p) : { x: 0, y: 0 });
      customFHLastScreenRef.current = { x: pt.x, y: pt.y };
      // 地図のパン/ズームを一時無効化
      try { map.dragPan?.disable(); } catch {}
      try { map.scrollZoom?.disable(); } catch {}
      try { map.boxZoom?.disable(); } catch {}
      try { map.doubleClickZoom?.disable(); } catch {}
      try { map.touchZoomRotate?.disable(); } catch {}
      const intended = customFHTargetRef.current || 'LineString';
      const feat = {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [[p.lng, p.lat]] },
        properties: { intended, source: intended === 'Polygon' ? 'freehand_custom_polygon' : 'freehand_custom_line' },
      } as any;
      try {
        const ids = draw.add(feat);
        customFHFeatIdRef.current = (ids && ids[0]) || null;
        // 選択状態に
        try { draw.changeMode('simple_select', { featureIds: ids }); } catch {}
      } catch {}
      // このイベントを他の操作に伝播させない
      try { e.preventDefault?.(); } catch {}
    };

    const onMove = (e: any) => {
      if (!customFHCapturingRef.current) return;
      const id = customFHFeatIdRef.current;
      if (!id) return;
      const p = e.lngLat;
      const pt = e.point || (map && map.project ? map.project(p) : { x: 0, y: 0 });
      const lastPt = customFHLastScreenRef.current;
      try {
        const f = draw.get(id);
        if (!f) return;
        let coords = (f.geometry?.type === 'Polygon'
          ? (f.geometry?.coordinates?.[0] || [])
          : (f.geometry?.coordinates || [])
        ).slice();

        // Polygonの場合、前回のクローズ頂点（先頭と同じ座標が末尾にある）を一度取り除いてから追加する
        if (coords.length >= 2) {
          const first0 = coords[0];
          const last0 = coords[coords.length - 1];
          if (first0 && last0 && first0[0] === last0[0] && first0[1] === last0[1]) {
            coords = coords.slice(0, -1);
          }
        }

        // ピクセル間引き: 2px未満の移動は追加しない
        if (lastPt) {
          const dxp = (pt.x - lastPt.x);
          const dyp = (pt.y - lastPt.y);
          if ((dxp*dxp + dyp*dyp) < PIXEL_TOL_SQ) return;
        }

        coords.push([p.lng, p.lat]);

        const intended = (f.properties?.intended || customFHTargetRef.current);
        if (intended === 'Polygon') {
          if (coords.length >= 3) {
            const ring = coords.slice();
            const first = ring[0];
            const last = ring[ring.length - 1];
            if (!(first && last && first[0] === last[0] && first[1] === last[1])) {
              ring.push(first);
            }
            f.geometry = { type: 'Polygon', coordinates: [ring] } as any;
          } else {
            f.geometry = { type: 'LineString', coordinates: coords } as any;
          }
        } else {
          f.geometry = { type: 'LineString', coordinates: coords } as any;
        }
        customFHLastScreenRef.current = { x: pt.x, y: pt.y };
        draw.add(f); // 上書き用に再追加
      } catch {}
    };

    const onUp = async (e: any) => {
      if (!customFHCapturingRef.current) return;
      customFHCapturingRef.current = false;
      const id = customFHFeatIdRef.current;
      customFHFeatIdRef.current = null;
      customFHLastScreenRef.current = null;
      let f: any = null;
      try { f = id ? draw.get(id) : null; } catch {}
      const intended = f?.properties?.intended || customFHTargetRef.current;
      // 最終確定形状を用意
      let finalGeom: any = null;
      try {
        if (f && f.geometry) {
          if (intended === 'Polygon') {
            // 既にPolygon化されていれば外輪を取り出し、末尾のクローズ頂点があれば取り除いてから再クローズ
            let coords = (f.geometry.type === 'Polygon') ? (f.geometry.coordinates?.[0] || []) : (f.geometry.coordinates || []);
            if (coords.length >= 3) {
              if (coords.length >= 2) {
                const first0 = coords[0];
                const last0 = coords[coords.length - 1];
                if (first0 && last0 && first0[0] === last0[0] && first0[1] === last0[1]) {
                  coords = coords.slice(0, -1);
                }
              }
              const ring = coords.slice();
              const first = ring[0];
              const last = ring[ring.length - 1];
              if (!(first && last && first[0] === last[0] && first[1] === last[1])) {
                ring.push(first);
              }
              finalGeom = { type: 'Polygon', coordinates: [ring] } as any;
            }
          } else {
            // LineString（Polygonだったら外輪のみを取得・クローズ点は除去）
            let coords = (f.geometry.type === 'Polygon') ? (f.geometry.coordinates?.[0] || []) : (f.geometry.coordinates || []);
            if (coords.length >= 2) {
              if (coords.length >= 2) {
                const first0 = coords[0];
                const last0 = coords[coords.length - 1];
                if (first0 && last0 && first0[0] === last0[0] && first0[1] === last0[1]) {
                  coords = coords.slice(0, -1);
                }
              }
              finalGeom = { type: 'LineString', coordinates: coords } as any;
            }
          }
        }
      } catch {}

      // 自動保存（成功したら下書きを消す。失敗時は下書きを残す）
      if (finalGeom) {
        const saved = await saveGeometryAuto(finalGeom);
        if (saved) {
          try { draw.delete(id as any); } catch {}
        }
      }
      // 地図のパン/ズームを再有効化
      try { map.dragPan?.enable(); } catch {}
      try { map.scrollZoom?.enable(); } catch {}
      try { map.boxZoom?.enable(); } catch {}
      try { map.doubleClickZoom?.enable(); } catch {}
      try { map.touchZoomRotate?.enable(); } catch {}
      try { e.preventDefault?.(); } catch {}
    };

    // リスナ登録
    map.on('mousedown', onDown);
    map.on('mousemove', onMove);
    map.on('mouseup', onUp);
    // タッチ（iPad/Safari/Chromeエミュレーション対策）
    map.on('touchstart', onDown);
    map.on('touchmove', onMove);
    map.on('touchend', onUp);
    // 保存: ハンドラの参照をプロパティに退避
    (map as any)._raptorFH = { onDown, onMove, onUp };
  }

  function disableCustomFreehand() {
    const map = mapRef.current as any;
    if (!map) return;
    customFHActiveRef.current = false;
    customFHCapturingRef.current = false;
    customFHTargetRef.current = null;
    customFHLastScreenRef.current = null;
    const h = (map as any)._raptorFH;
    if (h) {
      try { map.off('mousedown', h.onDown); } catch {}
      try { map.off('mousemove', h.onMove); } catch {}
      try { map.off('mouseup', h.onUp); } catch {}
      try { map.off('touchstart', h.onDown); } catch {}
      try { map.off('touchmove', h.onMove); } catch {}
      try { map.off('touchend', h.onUp); } catch {}
      (map as any)._raptorFH = null;
    }
  }

  

  // surveyId 変更時に保存レイヤを再読込
  useEffect(() => {
    loadSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surveyId]);

  // パレット用コンポーネント（ローカル）
  function DrawPalette(props: { x:number, y:number, active:string, onDrag:(x:number,y:number)=>void, onPoint:()=>void, onLine:()=>void, onPolygon:()=>void, onTrash:()=>void }){
    const pRef = useRef<HTMLDivElement>(null);
    const posRef = useRef({ x: props.x, y: props.y });
    const draggingRef = useRef(false);
    const startRef = useRef({ sx:0, sy:0, ox:0, oy:0 });
    useEffect(() => { posRef.current = { x: props.x, y: props.y }; }, [props.x, props.y]);

    const disableMapInteractions = () => {
      const m = mapRef.current as any; if(!m) return;
      try { m.dragPan?.disable(); } catch {}
      try { m.scrollZoom?.disable(); } catch {}
      try { m.boxZoom?.disable(); } catch {}
      try { m.doubleClickZoom?.disable(); } catch {}
      try { m.touchZoomRotate?.disable(); } catch {}
    };
    const enableMapInteractions = () => {
      const m = mapRef.current as any; if(!m) return;
      try { m.dragPan?.enable(); } catch {}
      try { m.scrollZoom?.enable(); } catch {}
      try { m.boxZoom?.enable(); } catch {}
      try { m.doubleClickZoom?.enable(); } catch {}
      try { m.touchZoomRotate?.enable(); } catch {}
    };

    const onPointerDown = (e: React.PointerEvent) => {
      draggingRef.current = true;
      startRef.current.sx = e.clientX;
      startRef.current.sy = e.clientY;
      startRef.current.ox = posRef.current.x;
      startRef.current.oy = posRef.current.y;
      (e.currentTarget as any).setPointerCapture?.(e.pointerId);
      disableMapInteractions();
      e.preventDefault();
      e.stopPropagation();
    };
    const onPointerMove = (e: React.PointerEvent) => {
      if(!draggingRef.current) return;
      const { sx, sy, ox, oy } = startRef.current;
      const nx = ox + (e.clientX - sx);
      const ny = oy + (e.clientY - sy);
      props.onDrag(nx, ny);
      e.preventDefault();
      e.stopPropagation();
    };
    const onPointerUp = (e: React.PointerEvent) => {
      draggingRef.current = false;
      try { (e.currentTarget as any).releasePointerCapture?.(e.pointerId); } catch {}
      enableMapInteractions();
      e.preventDefault();
      e.stopPropagation();
    };
    const Btn = ( {label, on, onClick}:{label:string, on:boolean, onClick:()=>void} ) => (
      <button onClick={onClick} style={{ padding:'8px 10px', borderRadius:6, border:'1px solid #ddd', background:on?'#1976d2':'#fff', color:on?'#fff':'#333' }}>{label}</button>
    );
    return (
      <div
        ref={pRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{ position:'absolute', left: props.x, top: props.y, background:'#fff', border:'1px solid #ddd', borderRadius:10, boxShadow:'0 4px 12px rgba(0,0,0,0.15)', padding:8, display:'flex', gap:6, alignItems:'center', zIndex:1000, touchAction:'none', cursor:'move' }}
      >
        <div className="drag-handle" title="ドラッグで移動" style={{ cursor:'move', padding:'6px 6px' }}>≡</div>
        <Btn label="点" on={props.active==='draw_point'} onClick={props.onPoint} />
        <Btn label="線" on={props.active==='draw_line_string'} onClick={props.onLine} />
        <Btn label="面" on={props.active==='draw_polygon'} onClick={props.onPolygon} />
        <button onClick={props.onTrash} title="削除" style={{ padding:'8px 10px', borderRadius:6, border:'1px solid #ddd', background:'#fff' }}>🗑</button>
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <div ref={ref} style={{ width: "100%", height: "100%" }} />
      { /* フローティングパレットは無効化（ドック型に切替） */ }
      {/* 入力パネル（表示切替・左右切替対応） */}
      <div
        style={{
          position: "absolute",
          top: 12,
          [panelSide]: 12 as any,
          width: 320,
          padding: 12,
          background: "rgba(255,255,255,0.95)",
          borderRadius: 8,
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
          fontSize: 14,
          transform: panelVisible ? 'translateX(0)' : (panelSide==='right' ? 'translateX(360px)' : 'translateX(-360px)'),
          transition: 'transform 200ms ease',
        }}
      >
        <div style={{ display: "flex", alignItems: "center", marginBottom: 8, gap: 8 }}>
          <div style={{ fontWeight: 600 }}>観察入力</div>
          <button
            title="パネル位置切替"
            onClick={() => setPanelSide((s) => (s === 'right' ? 'left' : 'right'))}
            style={{ marginLeft: 'auto', padding: '4px 8px', borderRadius: 6, border: '1px solid #ddd', background: '#fff' }}>
            ↔
          </button>
          <div style={{ fontSize: 12, color: surveyId ? "#333" : "#b00" }}>
            {surveyId ? `対象: ${surveyName || "(名称取得中)"} (ID: ${surveyId})` : "調査未選択"}
          </div>
        </div>
          {/* 地物作成ツールバー（ドック：パネル上部に固定） */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '4px 0 8px 0' }}>
            <button onClick={()=> toggleDrawMode('draw_point')} style={{ padding:'6px 10px', borderRadius:6, border:'1px solid #ddd', background: activeDrawMode==='draw_point' ? '#1976d2' : '#fff', color: activeDrawMode==='draw_point' ? '#fff' : '#333' }}>点</button>
            <button onClick={()=> toggleDrawMode('draw_line_string')} style={{ padding:'6px 10px', borderRadius:6, border:'1px solid #ddd', background: activeDrawMode==='draw_line_string' ? '#1976d2' : '#fff', color: activeDrawMode==='draw_line_string' ? '#fff' : '#333' }}>線</button>
            <button onClick={()=> toggleDrawMode('draw_polygon')} style={{ padding:'6px 10px', borderRadius:6, border:'1px solid #ddd', background: activeDrawMode==='draw_polygon' ? '#1976d2' : '#fff', color: activeDrawMode==='draw_polygon' ? '#fff' : '#333' }}>面</button>
            {/* フリーハンド（明示モード、線/面は自動判定しない） */}
            <button onClick={()=> toggleFreehand('LineString')} style={{ padding:'6px 10px', borderRadius:6, border:'1px solid #ddd', background: activeDrawMode==='freehand_line' ? '#1976d2' : '#fff', color: activeDrawMode==='freehand_line' ? '#fff' : '#333' }}>フリ線</button>
            <button onClick={()=> toggleFreehand('Polygon')} style={{ padding:'6px 10px', borderRadius:6, border:'1px solid #ddd', background: activeDrawMode==='freehand_polygon' ? '#1976d2' : '#fff', color: activeDrawMode==='freehand_polygon' ? '#fff' : '#333' }}>フリ面</button>
            <button
              onClick={()=> drawRef.current?.trash()}
              title="削除"
              style={{ padding:'6px 10px', borderRadius:6, border:'1px solid #ddd', background:'#fff' }}
            >🗑</button>
          </div>

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
                            <div style={{ marginLeft: 8, fontFamily: "monospace", cursor: "pointer" }} onClick={() => focusIndividual(id)} title="フォーカス">
                              {id}
                            </div>
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
                  disabled={exportBusy || !surveyId}
                  onClick={async () => {
                    if (!surveyId) return;
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
            {/* 再読込ボタンは自動同期方針のため削除 */}
          </div>
          {!surveyId && (
            <div style={{ color: "#b00", marginTop: 6 }}>
              調査が選択されていません。「調査を変更」から選択してください。
            </div>
          )}
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
          <button onClick={handleSave} disabled={busy || !surveyId}>
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
          {/* 一覧に戻るボタンはヘッダに統一し、パネル内からは削除 */}
        </div>
      </div>
      {/* パネルハンドル（Googleマップ風の三角/山形） */}
      <div
        onClick={() => setPanelVisible((v) => !v)}
        title={panelVisible ? 'パネルを閉じる' : 'パネルを開く'}
        style={{
          position: 'absolute',
          top: '50%',
          transform: 'translateY(-50%)',
          [panelSide]: panelVisible ? (12 + 320 + 8) : 12 as any,
          width: 28,
          height: 100,
          borderRadius: 8,
          background: '#fff',
          border: '1px solid #ddd',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          userSelect: 'none',
          zIndex: 5,
        }}
      >
        <span style={{ fontSize: 18 }}>
          {panelSide === 'right' ? (panelVisible ? '▶' : '◀') : (panelVisible ? '◀' : '▶')}
        </span>
      </div>

      {/* GeolocateControl を採用したため、独自の現在地ボタンは削除 */}
      

      {/* スナックバー */}
      {msg && (
        <div style={{ position: "absolute", left: 12, bottom: 12, background: "rgba(0,0,0,0.8)", color: "#fff", padding: "8px 12px", borderRadius: 8 }}>
          {msg}
        </div>
      )}
    </div>
  );
}
