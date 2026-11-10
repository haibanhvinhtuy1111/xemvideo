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
      {/* Nút Mở Cài Đặt */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-sub px-3 py-1.5 text-xs font-medium text-textMain transition hover:border-primary/50 hover:bg-surface sm:text-sm"
      >
        <span>⚙</span>
        <span>Nguồn</span>
      </button>

      {open && (
        <div className="fixed inset-x-3 top-16 z-50 rounded-2xl border border-border bg-surface p-4 shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80">
          <div className="mb-2 flex items-center justify-between">
            <label className="text-xs font-medium text-textSub">
              Tên miền nguồn (để trống = mặc định)
            </label>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-1 text-xs text-textSub transition-colors hover:text-textMain"
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
            className="w-full rounded-xl border border-border bg-sub px-3.5 py-2 text-base text-textMain placeholder:text-textSub outline-none focus:border-primary focus:ring-1 focus:ring-primary sm:text-sm"
          />

          {err && <p className="mt-1.5 text-xs text-hot">{err}</p>}

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={onSave}
              className="flex-1 rounded-xl bg-primary py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary-hover sm:text-sm"
            >
              Lưu cấu hình
            </button>
            <button
              type="button"
              onClick={onReset}
              className="rounded-xl border border-border bg-sub px-3 py-2 text-xs text-textMain transition hover:bg-surface sm:text-sm"
            >
              Mặc định
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
