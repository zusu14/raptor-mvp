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
      <div style={{ fontSize: 18, fontWeight: 700 }}>調査の選択</div>
      <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>新規作成</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            placeholder="調査名（必須）"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ minWidth: 240 }}
          />
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <button onClick={create} disabled={busy || !name.trim()}>
            作成して選択
          </button>
        </div>
        {error && <div style={{ color: "#c00", marginTop: 6 }}>{error}</div>}
      </div>

      <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, minHeight: 160 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>既存の調査</div>
        {loading ? (
          <div>読み込み中...</div>
        ) : items.length === 0 ? (
          <div style={{ color: "#666" }}>まだ調査はありません。上で作成してください。</div>
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            {items.map((s) => {
              const isEdit = editId === s.id;
              return (
                <div key={s.id} style={{ display: "flex", alignItems: "center", border: "1px solid #eee", borderRadius: 6, padding: 8, gap: 8 }}>
                  {isEdit ? (
                    <>
                      <input value={editName} onChange={(e) => setEditName(e.target.value)} style={{ minWidth: 200 }} />
                      <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
                    </>
                  ) : (
                    <>
                      <div style={{ fontWeight: 600 }}>{s.name}</div>
                      <div style={{ color: "#666" }}>{s.date}</div>
                    </>
                  )}
                  <div style={{ marginLeft: "auto", color: "#999" }}>ID: {s.id}</div>
                  {!isEdit ? (
                    <>
                      <button onClick={() => select(s)}>選択</button>
                      <button onClick={() => startEdit(s)}>編集</button>
                      <button onClick={() => remove(s.id)} style={{ color: "#b00" }}>削除</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => saveEdit(s.id)} disabled={busy || !editName.trim()}>保存</button>
                      <button onClick={cancelEdit}>キャンセル</button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
