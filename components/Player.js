"use client";

import { useEffect, useRef, useState } from "react";

export default function Player({
  video,
  src,
  url,
  type,
  poster,
  sources: propSources
}) {
  const videoRef = useRef(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [useBackupMode, setUseBackupMode] = useState(false);
  const [autoSwitchedMsg, setAutoSwitchedMsg] = useState("");
  const [showDebug, setShowDebug] = useState(false);

  const rawSources = propSources || video?.sources || [];

  const fallbackUrl =
    src ||
    url ||
    video?.videoUrl ||
    video?.hlsUrl ||
    video?.mp4Url ||
    video?.embedUrl ||
    video?.iframe ||
    video?.url ||
    video?.src ||
    "";

  const normalizedSources =
    rawSources.length > 0
      ? rawSources
      : fallbackUrl
      ? [
          {
            label: "Server #1",
            url: fallbackUrl,
            type:
              type ||
              video?.type ||
              (fallbackUrl.includes(".m3u8") ||
              fallbackUrl.includes("rawProxy=1") ||
              fallbackUrl.includes("hlsProxy=1")
                ? "hls"
                : fallbackUrl.includes(".mp4")
                ? "mp4"
                : "iframe")
          }
        ]
      : [];

  const current = normalizedSources[activeIdx] || normalizedSources[0] || null;
  const primaryUrl = current?.url || current?.src || "";
  const backupUrl = current?.backupUrl || current?.proxyUrl || "";

  const activeUrl =
    useBackupMode && backupUrl ? backupUrl : primaryUrl;

  const activeType =
    current?.type ||
    (activeUrl.includes(".m3u8") ||
    activeUrl.includes("rawProxy=1") ||
    activeUrl.includes("hlsProxy=1")
      ? "hls"
      : activeUrl.includes(".mp4")
      ? "mp4"
      : "iframe");

  useEffect(() => {
    setActiveIdx(0);
    setUseBackupMode(false);
    setAutoSwitchedMsg("");
  }, [video?.slug, fallbackUrl]);

  useEffect(() => {
    setUseBackupMode(false);
  }, [activeIdx]);

  // Hàm tự động nhảy sang Server kế tiếp nếu Server hiện tại bị lỗi
  const handleAutoSwitchNext = () => {
    if (!useBackupMode && backupUrl && backupUrl !== primaryUrl) {
      setUseBackupMode(true);
      return;
    }
    if (activeIdx + 1 < normalizedSources.length) {
      const nextIndex = activeIdx + 1;
      const nextLabel =
        normalizedSources[nextIndex]?.label || `Server #${nextIndex + 1}`;
      setAutoSwitchedMsg(`Đã tự động chuyển sang ${nextLabel} do luồng trước phản hồi chậm.`);
      setActiveIdx(nextIndex);
    }
  };

  useEffect(() => {
    if (!activeUrl || activeType === "iframe" || !videoRef.current) return;
    const el = videoRef.current;
    const isHlsStream =
      activeType === "hls" ||
      activeUrl.includes(".m3u8") ||
      activeUrl.includes("rawProxy=1") ||
      activeUrl.includes("hlsProxy=1");

    if (!isHlsStream) {
      el.src = activeUrl;
      return;
    }

    let hlsInstance = null;

    const initHls = () => {
      if (window.Hls && window.Hls.isSupported()) {
        hlsInstance = new window.Hls({
          enableWorker: false,
          lowLatencyMode: false,
          xhrSetup: (xhr) => {
            xhr.withCredentials = false;
          }
        });
        hlsInstance.loadSource(activeUrl);
        hlsInstance.attachMedia(el);
        hlsInstance.on(window.Hls.Events.MANIFEST_PARSED, () => {
          el.play().catch(() => {});
        });
        hlsInstance.on(window.Hls.Events.ERROR, (_, data) => {
          if (data.fatal) {
            hlsInstance.destroy();
            handleAutoSwitchNext();
          }
        });
      } else if (el.canPlayType("application/vnd.apple.mpegurl")) {
        el.src = activeUrl;
      }
    };

    if (window.Hls) {
      initHls();
    } else {
      const existingScript = document.querySelector('script[src*="hls.js"]');
      if (existingScript) {
        existingScript.addEventListener("load", initHls);
      } else {
        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/hls.js@latest";
        script.async = true;
        script.onload = initHls;
        document.head.appendChild(script);
      }
    }

    return () => {
      if (hlsInstance) {
        hlsInstance.destroy();
      }
    };
  }, [activeUrl, activeType, useBackupMode, activeIdx]);

  if (!activeUrl) {
    return (
      <div className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800 text-slate-300 space-y-3">
        <p className="text-sm">
          Video này hiện không có luồng phát khả dụng hoặc đã bị xóa trên máy chủ nguồn.
        </p>
        {video?.postLink && (
          <a
            href={video.postLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 px-4 py-2 text-xs font-semibold text-white transition"
          >
            <span>Kiểm tra trên trang gốc</span>
            <span>↗</span>
          </a>
        )}
        {video?._debug && (
          <div className="text-xs text-slate-500 font-mono space-y-1 pt-2 border-t border-slate-800">
            <p>
              Domain: {video._debug.baseDomain} | HTML: {video._debug.htmlVia} (
              {video._debug.htmlLength || 0} bytes)
            </p>
            {video._debug.playerSnippet && (
              <pre className="p-2 bg-slate-950 rounded-lg overflow-x-auto whitespace-pre-wrap text-[11px] text-slate-400">
                {video._debug.playerSnippet}
              </pre>
            )}
          </div>
        )}
      </div>
    );
  }

  const isLocalProxyIframe = activeUrl.startsWith("/");

  return (
    <div className="space-y-3.5">
      <div className="relative aspect-video w-full bg-black rounded-xl sm:rounded-2xl overflow-hidden border border-slate-800/90 shadow-xl shadow-black/40">
        {activeType === "iframe" ? (
          <iframe
            key={activeUrl}
            src={activeUrl}
            scrolling="no"
            className="w-full h-full border-0 overflow-hidden"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy={
              isLocalProxyIframe ? "same-origin" : "no-referrer"
            }
          />
        ) : (
          <video
            ref={videoRef}
            key={activeUrl}
            poster={poster || video?.thumbnail}
            controls
            autoPlay
            playsInline
            onError={handleAutoSwitchNext}
            className="w-full h-full object-contain"
          />
        )}
      </div>

      {autoSwitchedMsg && (
        <p className="text-xs text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-1.5">
          ⚡ {autoSwitchedMsg}
        </p>
      )}

      {/* Hàng nút chọn Server & Công cụ đổi nhanh */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <span className="text-xs text-slate-400 mr-1 hidden sm:inline">
            Máy chủ:
          </span>
          {normalizedSources.map((s, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                setAutoSwitchedMsg("");
                setActiveIdx(idx);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                activeIdx === idx
                  ? "bg-indigo-500 text-white shadow-sm shadow-indigo-500/30"
                  : "bg-slate-800/80 text-slate-300 hover:bg-slate-700 border border-slate-700/60"
              }`}
            >
              {s.label || s.name || `Server #${idx + 1}`}
            </button>
          ))}

          {/* Nút nhảy nhanh sang Server kế tiếp nếu người xem thấy quay lâu */}
          {normalizedSources.length > 1 && (
            <button
              type="button"
              onClick={handleAutoSwitchNext}
              className="px-2.5 py-1.5 rounded-xl bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 text-xs text-indigo-300 transition"
              title="Bấm nếu server hiện tại tải chậm"
            >
              Đổi Server ↻
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => setShowDebug(!showDebug)}
          className="text-xs text-slate-500 hover:text-slate-300 underline py-1"
        >
          {showDebug ? "Ẩn chi tiết" : "🔍 Chi tiết nguồn"}
        </button>
      </div>

      {showDebug && (
        <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 text-xs font-mono text-slate-400 space-y-1 overflow-x-auto">
          <p className="text-slate-300 break-all">
            Đang phát ({activeType}): {activeUrl}
          </p>
          {current?.rawUrl && (
            <p className="text-emerald-400 break-all">
              Link gốc: {current.rawUrl}
            </p>
          )}
          {video?._debug?.playerSnippet && (
            <pre className="p-2 bg-slate-950 rounded-lg whitespace-pre-wrap break-all text-[11px]">
              {video._debug.playerSnippet}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
