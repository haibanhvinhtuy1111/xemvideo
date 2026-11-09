"use client";
import { useEffect, useState } from "react";
import { getSource, saveSource } from "@/config/site";

export default function SourceSettings() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => setValue(getSource()), []);

  const onSave = () => {
    try { saveSource(value); window.location.reload(); }
    catch (e) { setErr(e.message); }
  };
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800">⚙ Nguồn</button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[90vw] rounded-lg border border-zinc-700 bg-zinc-900 p-4 shadow-xl">
          <label className="text-xs text-zinc-400">Domain / endpoint API (để trống = API nội bộ)</label>
          <input value={value} onChange={(e) => { setValue(e.target.value); setErr(""); }}
            placeholder="https://api.example.com"
            className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-rose-500" />
          {err && <p className="mt-1 text-xs text-red-400">{err}</p>}
          <button onClick={onSave} className="mt-3 w-full rounded-md bg-rose-600 py-2 text-sm font-medium hover:bg-rose-500">Lưu</button>
          <p className="mt-2 text-xs text-zinc-500">API cần trả về đúng định dạng trong README và bật CORS.</p>
        </div>
      )}
    </div>
  );
}
