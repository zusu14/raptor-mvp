import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useNavigate } from "react-router-dom";

type Props = {};

type Survey = {
  id: number;
  name: string;
  date: string;
  observers?: string;
  area_bbox?: any;
};

export default function SurveyListView({}: Props) {
  const nav = useNavigate();
  const [items, setItems] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editDate, setEditDate] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/surveys");
      setItems(res.data || []);
    } catch (e: any) {
      setError(e?.message || "読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const payload: any = { name: name.trim() };
      if (date) payload.date = date; // yyyy-mm-dd
      const res = await api.post("/surveys", payload);
      const created: Survey = res.data;
      setItems((prev) => [...prev, created]);
      nav(`/map/${created.id}`);
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || "作成に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  function select(s: Survey) {
    nav(`/map/${s.id}`);
  }

  async function startEdit(s: Survey) {
    setEditId(s.id);
    setEditName(s.name);
    setEditDate(s.date || "");
  }

  function cancelEdit() {
    setEditId(null);
    setEditName("");
    setEditDate("");
  }

  async function saveEdit(id: number) {
    const payload: any = {};
    if (editName.trim()) payload.name = editName.trim();
    if (editDate) payload.date = editDate;
    setBusy(true);
    setError(null);
    try {
      const res = await api.patch(`/surveys/${id}`, payload);
      const updated: Survey = res.data;
      setItems((prev) => prev.map((x) => (x.id === id ? updated : x)));
      cancelEdit();
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || "更新に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    // まず観察件数を確認
    try {
      const stats = await api.get(`/surveys/${id}/stats`);
      const n = (stats?.data?.observations_count ?? 0) as number;
      if (n > 0) {
        alert(`この調査には観察が ${n} 件あります。観察が残っているため削除できません。先に観察を削除してください。`);
        return;
      }
    } catch (e) {
      // stats取得に失敗した場合は安全側で中止
      alert("観察件数の取得に失敗しました。再度お試しください。");
      return;
    }
    if (!window.confirm("観察が0件のため削除可能です。本当に削除しますか？この操作は元に戻せません。")) return;
    setBusy(true);
    setError(null);
    try {
      await api.delete(`/surveys/${id}`);
      setItems((prev) => prev.filter((x) => x.id !== id));
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || "削除に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12, width: "100%", height: "100%", padding: 16 }}>
      {/* 一覧 */}
      <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, minHeight: 160 }}>
        {loading ? (
          <div>読み込み中...</div>
        ) : items.length === 0 ? (
          <div style={{ color: "#666", display: "grid", placeItems: "center", padding: 24 }}>
            <div>まだ調査はありません。上の「＋ 新規作成」から追加してください。</div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {items.map((s) => {
              const isEdit = editId === s.id;
              return (
                <div
                  key={s.id}
                  onClick={() => !isEdit && select(s)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    border: "1px solid #eee",
                    borderRadius: 10,
                    padding: 12,
                    gap: 12,
                    minHeight: 56,
                    cursor: isEdit ? "default" : "pointer",
                  }}
                  title={isEdit ? undefined : "開く（地図）"}
                >
                  {isEdit ? (
                    <>
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        style={{ minWidth: 200, minHeight: 44, padding: "8px 10px" }}
                      />
                      <input
                        type="date"
                        value={editDate}
                        onChange={(e) => setEditDate(e.target.value)}
                        style={{ minHeight: 44, padding: "8px 10px" }}
                      />
                    </>
                  ) : (
                    <div style={{ display: "grid", gap: 4 }}>
                      <div style={{ fontWeight: 700, fontSize: 16 }}>{s.name}</div>
                      <div style={{ color: "#666", fontSize: 14 }}>{s.date}</div>
                    </div>
                  )}
                  <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ color: "#999", fontSize: 12, border: "1px solid #eee", borderRadius: 6, padding: "2px 6px" }}>ID: {s.id}</span>
                    {!isEdit ? (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            startEdit(s);
                          }}
                          style={{ minHeight: 44, padding: "8px 12px" }}
                        >
                          編集
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            remove(s.id);
                          }}
                          style={{ minHeight: 44, padding: "8px 12px", color: "#b00" }}
                        >
                          削除
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            saveEdit(s.id);
                          }}
                          disabled={busy || !editName.trim()}
                          style={{ minHeight: 44, padding: "8px 12px" }}
                        >
                          保存
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            cancelEdit();
                          }}
                          style={{ minHeight: 44, padding: "8px 12px" }}
                        >
                          キャンセル
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* FAB: 新規作成 */}
      <button
        onClick={() => setCreateOpen(true)}
        title="新規作成"
        aria-label="新規作成"
        style={{
          position: "fixed",
          right: 20,
          bottom: 20,
          width: 56,
          height: 56,
          borderRadius: 28,
          background: "#1976d2",
          color: "#fff",
          fontSize: 24,
          border: "none",
          boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
        }}
      >
        ＋
      </button>

      {/* Bottom Sheet: 新規作成 */}
      {createOpen && (
        <div
          onClick={() => setCreateOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "flex-end",
            zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              background: "#fff",
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              padding: 16,
              boxShadow: "0 -6px 16px rgba(0,0,0,0.2)",
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 8 }}>新規作成</div>
            <div style={{ display: "grid", gap: 8 }}>
              <label style={{ display: "grid", gap: 4 }}>
                <span>名称（必須）</span>
                <input
                  placeholder="例：9/20 現地調査"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={{ minHeight: 44, padding: "8px 10px" }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && name.trim() && !busy) create();
                  }}
                />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span>日付（任意）</span>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ minHeight: 44, padding: "8px 10px" }} />
              </label>
              {error && <div style={{ color: "#c00" }}>{error}</div>}
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button onClick={create} disabled={busy || !name.trim()} style={{ minHeight: 44, padding: "10px 14px", fontWeight: 600 }}>
                  作成して開く
                </button>
                <button onClick={() => setCreateOpen(false)} style={{ minHeight: 44, padding: "10px 14px" }}>キャンセル</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
