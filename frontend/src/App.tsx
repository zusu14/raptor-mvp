import React from "react";
// Map を出したい場合はこちらを利用（無ければコメントアウトのままでOK）
import MapView from "./components/MapView";

export default function App() {
  return (
    <div style={{ position: "fixed", inset: 0, padding: 16 }}>
      <MapView />
      Hello Raptor MVP 👋
    </div>
  );
}
