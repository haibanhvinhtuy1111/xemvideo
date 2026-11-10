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

  // Tự động chuyển server khi gặp sự cố
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
      <div className="space-y-3 rounded-2xl border border-border bg-surface p-6 text-textSub shadow-sm">
        <p className="text-sm">
          Video này hiện không có luồng phát khả dụng hoặc đã bị xóa trên máy chủ nguồn.
        </p>
        {video?.postLink && (
          <a
            href={video.postLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary-hover"
          >
            <span>Kiểm tra trên trang gốc</span>
            <span>↗</span>
          </a>
        )}
        {video?._debug && (
          <div className="space-y-1 border-t border-border pt-2 font-mono text-xs text-textSub">
            <p>
              Domain: {video._debug.baseDomain} | HTML: {video._debug.htmlVia} (
              {video._debug.htmlLength || 0} bytes)
            </p>
            {video._debug.playerSnippet && (
              <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg border border-border bg-sub p-2.5 text-[11px] text-textMain">
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
      {/* Khung phát Video / Iframe */}
      <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-border bg-black shadow-xl shadow-black/25 sm:rounded-2xl">
        {activeType === "iframe" ? (
          <iframe
            key={activeUrl}
            src={activeUrl}
            scrolling="no"
            className="h-full w-full border-0 overflow-hidden"
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
            className="h-full w-full object-contain"
          />
        )}
      </div>

      {/* Thông báo tự động đổi server */}
      {autoSwitchedMsg && (
        <p className="rounded-xl border border-hot/30 bg-hot-bg px-3.5 py-2 text-xs font-medium text-hot">
          ⚡ {autoSwitchedMsg}
        </p>
      )}

      {/* Hàng nút chọn Server & Nút chuyển nhanh */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <span className="mr-1 hidden text-xs font-medium text-textSub sm:inline">
            Máy chủ:
          </span>
          {normalizedSources.map((s, idx) => {
            const isActive = activeIdx === idx;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setAutoSwitchedMsg("");
                  setActiveIdx(idx);
                }}
                className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm shadow-primary/30"
                    : "border border-border bg-sub text-textMain hover:bg-surface"
                }`}
              >
                {s.label || s.name || `Server #${idx + 1}`}
              </button>
            );
          })}

          {normalizedSources.length > 1 && (
            <button
              type="button"
              onClick={handleAutoSwitchNext}
              className="rounded-xl border border-border bg-sub px-2.5 py-1.5 text-xs font-medium text-primary transition hover:bg-surface"
              title="Bấm nếu server hiện tại tải chậm"
            >
              Đổi Server ↻
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => setShowDebug(!showDebug)}
          className="py-1 text-xs text-textSub underline transition-colors hover:text-textMain"
        >
          {showDebug ? "Ẩn chi tiết" : "🔍 Chi tiết nguồn"}
        </button>
      </div>

      {/* Hộp debug chi tiết luồng phát */}
      {showDebug && (
        <div className="space-y-1 overflow-x-auto rounded-xl border border-border bg-sub/80 p-3 font-mono text-xs text-textSub">
          <p className="break-all text-textMain">
            Đang phát ({activeType}): {activeUrl}
          </p>
          {current?.rawUrl && (
            <p className="break-all text-success">
              Link gốc: {current.rawUrl}
            </p>
          )}
          {video?._debug?.playerSnippet && (
            <pre className="break-all whitespace-pre-wrap rounded-lg border border-border bg-surface p-2 text-[11px] text-textMain">
              {video._debug.playerSnippet}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
