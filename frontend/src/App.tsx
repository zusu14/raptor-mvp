import React from "react";
import MapView from "./components/MapView";
import SurveyListView from "./components/SurveyListView";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";

function Shell() {
  const nav = useNavigate();
  const loc = useLocation();
  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <div style={{ height: 48, display: "flex", alignItems: "center", padding: "0 12px", borderBottom: "1px solid #eee", background: "#fafafa" }}>
        <div style={{ fontWeight: 700 }}>Raptor MVP</div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button onClick={() => nav("/surveys")} disabled={loc.pathname.startsWith("/surveys")}>調査一覧</button>
        </div>
      </div>
      <div style={{ position: "absolute", inset: "48px 0 0 0" }}>
        <Routes>
          <Route path="/surveys" element={<SurveyListView />} />
          <Route path="/map/:surveyId" element={<MapView />} />
          <Route path="*" element={<Navigate to="/surveys" replace />} />
        </Routes>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  );
}
