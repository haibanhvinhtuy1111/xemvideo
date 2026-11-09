"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import VideoCard from "@/components/VideoCard";
import { siteConfig, getSource } from "@/config/site";

function Home() {
  const router = useRouter();
  const sp = useSearchParams();
  const category = sp.get("category") || "all";
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
  const q = sp.get("q") || "";
  const [text, setText] = useState(q);
  const [state, setState] = useState({ items: [], totalPages: 1, loading: true, error: "" });

  useEffect(() => setText(q), [q]);
  useEffect(() => {
    const params = new URLSearchParams({ category, page: String(page) });
    if (q) params.set("q", q);
    setState((s) => ({ ...s, loading: true, error: "" }));
    fetch(`${getSource()}/api/videos?${params}`)
      .then((r) => r.json())
      .then((d) => setState({ items: d.items || [], totalPages: d.totalPages || 1, loading: false, error: "" }))
      .catch(() => setState({ items: [], totalPages: 1, loading: false, error: "Không tải được dữ liệu. Kiểm tra lại nguồn/CORS." }));
  }, [category, page, q]);

  const go = (o) => {
    const p = new URLSearchParams({ category, page: "1", ...(q ? { q } : {}) });
    Object.entries(o).forEach(([k, v]) => (v === "" || v == null ? p.delete(k) : p.set(k, String(v))));
    router.push(`/?${p}`);
  };

  return (
    <div>
      <form onSubmit={(e) => { e.preventDefault(); go({ q: text.trim(), page: 1 }); }} className="mb-4 flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Tìm kiếm từ khóa..."
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 outline-none focus:border-rose-500" />
        <button className="rounded-md bg-rose-600 px-4 hover:bg-rose-500">Tìm</button>
      </form>
      <div className="mb-6 flex flex-wrap gap-2">
        {siteConfig.categories.map((c) => (
          <button key={c.value} onClick={() => go({ category: c.value, page: 1 })}
            className={`rounded-full px-4 py-1.5 text-sm ${category === c.value ? "bg-rose-600" : "bg-zinc-800 hover:bg-zinc-700"}`}>{c.label}</button>
        ))}
      </div>
      {state.error && <p className="text-red-400">{state.error}</p>}
      {state.loading ? <p className="text-zinc-400">Đang tải...</p> : state.items.length === 0 && !state.error ? <p className="text-zinc-400">Không có video.</p> : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {state.items.map((v) => <VideoCard key={v.id ?? v.slug} v={v} />)}
        </div>
      )}
      <div className="mt-8 flex items-center justify-center gap-4">
        <button disabled={page <= 1} onClick={() => go({ page: page - 1 })} className="rounded-md bg-zinc-800 px-4 py-2 disabled:opacity-40">← Trước</button>
        <span className="text-sm text-zinc-400">Trang {page} / {state.totalPages}</span>
        <button disabled={page >= state.totalPages} onClick={() => go({ page: page + 1 })} className="rounded-md bg-zinc-800 px-4 py-2 disabled:opacity-40">Sau →</button>
      </div>
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={null}><Home /></Suspense>;
}
