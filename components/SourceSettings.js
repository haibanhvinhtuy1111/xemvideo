"use client";

import { useEffect, useRef, useState } from "react";
import { getSource, saveSource } from "@/config/site";

export default function SourceSettings() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [err, setErr] = useState("");
  const boxRef = useRef(null);

  useEffect(() => {
    if (typeof getSource === "function") {
      setValue(getSource() || "");
    }
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const onSave = () => {
    try {
      saveSource(value.trim());
      setOpen(false);
      window.location.reload();
    } catch (e) {
      setErr(e.message);
    }
  };

  const onReset = () => {
    try {
      saveSource("");
      setValue("");
      setOpen(false);
      window.location.reload();
    } catch (_) {}
  };

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700/80 bg-slate-800/70 px-3 py-1.5 text-xs sm:text-sm font-medium text-slate-200 hover:bg-slate-800 hover:border-indigo-500/50 transition"
      >
        <span>⚙</span>
        <span>Nguồn</span>
      </button>

      {open && (
        <div className="fixed inset-x-3 top-16 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80 rounded-2xl border border-slate-700/90 bg-[#1e293b] p-4 shadow-2xl shadow-black/50 z-50">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-slate-300">
              Tên miền nguồn (để trống = mặc định)
            </label>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-slate-400 hover:text-slate-200 text-xs px-1"
            >
              ✕
            </button>
          </div>

          <input
            type="url"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setErr("");
            }}
            placeholder="https://viet69.be"
            className="w-full rounded-xl border border-slate-700 bg-slate-900/90 px-3.5 py-2 text-base sm:text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-indigo-400"
          />

          {err && <p className="mt-1.5 text-xs text-rose-400">{err}</p>}

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={onSave}
              className="flex-1 rounded-xl bg-indigo-500 hover:bg-indigo-400 py-2 text-xs sm:text-sm font-semibold text-white transition"
            >
              Lưu cấu hình
            </button>
            <button
              type="button"
              onClick={onReset}
              className="rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 px-3 py-2 text-xs sm:text-sm text-slate-300 transition"
            >
              Mặc định
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
