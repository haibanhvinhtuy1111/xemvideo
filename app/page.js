"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Hàm tải và đóng gói lại file .m3u8 ngay trên trình duyệt (chỉ dùng cho Hls.js, không dùng cho Native Video của iOS)
async function buildClientBlobM3u8(rawM3u8Url, proxyOrigin = "") {
  const fetchCandidates = [
    () =>
      fetch(
        `${proxyOrigin}/api/videos?rawProxy=1&proxySegments=1&url=${encodeURIComponent(
          rawM3u8Url
        )}&referer=${encodeURIComponent("https://qmhv3.top/")}`,
        { cache: "no-store" }
      ),
    () =>
      fetch(rawM3u8Url, {
        referrerPolicy: "no-referrer",
        cache: "no-store"
      }),
    () =>
      fetch(
        `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(
          rawM3u8Url
        )}`,
        { cache: "no-store" }
      )
  ];

  for (const runFetch of fetchCandidates) {
    try {
      const res = await runFetch();
      if (!res.ok) continue;
      const text = await res.text();
      if (!text || !text.trim().startsWith("#EXTM3U")) continue;

      const rewritten = text
        .split(/\r?\n/)
        .map((line) => {
          const trimmed = line.trim();
          if (!trimmed) return line;
          if (trimmed.startsWith("#")) {
            return line.replace(/URI=["']([^"']+)["']/gi, (_, uri) => {
              try {
                if (uri.startsWith("/api/videos?")) {
                  return `URI="${window.location.origin}${uri}"`;
                }
                const abs = new URL(uri, rawM3u8Url).toString();
                return `URI="${abs}"`;
              } catch (_) {
                return `URI="${uri}"`;
              }
            });
          }
          if (trimmed.startsWith("/api/videos?")) {
            return `${window.location.origin}${trimmed}`;
          }
          try {
            return new URL(trimmed, rawM3u8Url).toString();
          } catch (_) {
            return line;
          }
        })
        .join("\n");

      const blob = new Blob([rewritten], {
        type: "application/vnd.apple.mpegurl"
      });
      return URL.createObjectURL(blob);
    } catch (_) {}
  }
  return null;
}

export default function Player({
  video,
  src,
  url,
  type,
  poster,
  sources: propSources
}) {
  const videoRef = useRef(null);
  const watchdogTimerRef = useRef(null);
  const blobUrlRef = useRef(null);

  const [activeIdx, setActiveIdx] = useState(0);
  const [useBackupMode, setUseBackupMode] = useState(false);
  const [autoSwitchedMsg, setAutoSwitchedMsg] = useState("");
  const [showDebug, setShowDebug] = useState(false);
  const [playerErrorLog, setPlayerErrorLog] = useState("");

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

  const activeUrl = useBackupMode && backupUrl ? backupUrl : primaryUrl;

  const activeType =
    current?.type === "iframe" ||
    activeUrl.includes("embedProxy=1") ||
    activeUrl.includes("qmhPlayerProxy=1")
      ? "iframe"
      : current?.type ||
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
    setPlayerErrorLog("");
  }, [video?.slug, fallbackUrl]);

  useEffect(() => {
    setUseBackupMode(false);
  }, [activeIdx]);

  const handleAutoSwitchNext = useCallback(
    (reason = "") => {
      if (watchdogTimerRef.current) {
        clearTimeout(watchdogTimerRef.current);
        watchdogTimerRef.current = null;
      }
      if (reason) {
        setPlayerErrorLog(String(reason));
      }

      setActiveIdx((prevIdx) => {
        if (prevIdx + 1 < normalizedSources.length) {
          const nextIndex = prevIdx + 1;
          const nextLabel =
            normalizedSources[nextIndex]?.label || `Server #${nextIndex + 1}`;
          setAutoSwitchedMsg(
            `Đã tự động chuyển sang ${nextLabel} (${reason || "tối ưu luồng"}).`
          );
          return nextIndex;
        }
        return prevIdx;
      });
    },
    [normalizedSources]
  );

  useEffect(() => {
    if (watchdogTimerRef.current) {
      clearTimeout(watchdogTimerRef.current);
      watchdogTimerRef.current = null;
    }
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }

    if (!activeUrl || activeType === "iframe" || !videoRef.current) return;

    const el = videoRef.current;
    let isCancelled = false;
    let hlsInstance = null;

    const isHlsStream =
      activeType === "hls" ||
      activeUrl.includes(".m3u8") ||
      activeUrl.includes("rawProxy=1") ||
      activeUrl.includes("hlsProxy=1");

    const startWatchdog = () => {
      if (watchdogTimerRef.current) clearTimeout(watchdogTimerRef.current);
      watchdogTimerRef.current = setTimeout(() => {
        if (!isCancelled && el && el.readyState < 1 && el.currentTime === 0) {
          handleAutoSwitchNext("Quá 8s chưa nhận được khung hình");
        }
      }, 8000);
    };

    const clearWatchdog = () => {
      if (watchdogTimerRef.current) {
        clearTimeout(watchdogTimerRef.current);
        watchdogTimerRef.current = null;
      }
    };

    el.addEventListener("loadeddata", clearWatchdog);
    el.addEventListener("playing", clearWatchdog);

    if (!isHlsStream) {
      startWatchdog();
      el.src = activeUrl;
      el.play().catch(() => {});
      return () => {
        isCancelled = true;
        clearWatchdog();
        el.removeEventListener("loadeddata", clearWatchdog);
        el.removeEventListener("playing", clearWatchdog);
      };
    }

    const startPlayback = async () => {
      startWatchdog();

      let finalStreamUrl =
        activeUrl.startsWith("/") && typeof window !== "undefined"
          ? `${window.location.origin}${activeUrl}`
          : activeUrl;

      const canUseHlsJs = Boolean(window.Hls && window.Hls.isSupported());
      const rawQmhUrl = current?.rawUrl || "";
      const isDirectQmh =
        activeUrl.includes("api.qmhv3.top") &&
        !activeUrl.includes("rawProxy=1");

      // CHỈ dùng Blob URL khi chạy bằng Hls.js (vì Native HLS của Safari iOS không đọc được blob: URL!)
      if (canUseHlsJs && isDirectQmh && rawQmhUrl) {
        const blobUrl = await buildClientBlobM3u8(
          rawQmhUrl,
          window.location.origin
        );
        if (isCancelled) return;
        if (blobUrl) {
          blobUrlRef.current = blobUrl;
          finalStreamUrl = blobUrl;
        }
      }

      if (canUseHlsJs) {
        hlsInstance = new window.Hls({
          // Tắt enableWorker để không bị Brave Shields hoặc CSP chặn Web Worker khi đọc Blob/Proxy
          enableWorker: false,
          lowLatencyMode: false,
          manifestLoadingTimeOut: 8000,
          manifestLoadingMaxRetry: 1,
          levelLoadingTimeOut: 8000,
          levelLoadingMaxRetry: 1,
          fragLoadingTimeOut: 12000,
          fragLoadingMaxRetry: 2,
          xhrSetup: (xhr) => {
            xhr.withCredentials = false;
          }
        });

        hlsInstance.loadSource(finalStreamUrl);
        hlsInstance.attachMedia(el);

        hlsInstance.on(window.Hls.Events.MANIFEST_PARSED, () => {
          if (isCancelled) return;
          clearWatchdog();
          el.play().catch(() => {});
        });

        hlsInstance.on(window.Hls.Events.ERROR, (_, data) => {
          if (isCancelled) return;
          if (data.fatal) {
            const errDetail = `${data.type || "ERR"}: ${
              data.details || "unknown"
            } (${data.response?.code || ""})`;
            try {
              hlsInstance.destroy();
            } catch (_) {}
            handleAutoSwitchNext(errDetail);
          }
        });
      } else if (el.canPlayType("application/vnd.apple.mpegurl")) {
        // Trên Safari iPhone: luôn truyền URL http/https thật (không truyền blob:)
        el.src = finalStreamUrl;
        el.load();
        el.play().catch(() => {});
      }
    };

    if (typeof window !== "undefined" && window.Hls) {
      startPlayback();
    } else if (typeof document !== "undefined") {
      const existingScript = document.querySelector('script[src*="hls."]');
      if (existingScript) {
        existingScript.addEventListener("load", startPlayback, {
          once: true
        });
      } else {
        const script = document.createElement("script");
        script.src =
          "https://cdn.jsdelivr.net/npm/hls.js@1.5.15/dist/hls.min.js";
        script.async = true;
        script.onload = startPlayback;
        script.onerror = startPlayback;
        document.head.appendChild(script);
      }
    }

    return () => {
      isCancelled = true;
      clearWatchdog();
      el.removeEventListener("loadeddata", clearWatchdog);
      el.removeEventListener("playing", clearWatchdog);
      if (hlsInstance) {
        try {
          hlsInstance.destroy();
        } catch (_) {}
      }
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [activeUrl, activeType, activeIdx, current?.rawUrl, handleAutoSwitchNext]);

  if (!activeUrl) {
    return (
      <div className="space-y-3 rounded-2xl border border-border bg-surface p-6 text-textSub shadow-sm">
        <p className="text-sm">
          Video này hiện không có luồng phát khả dụng hoặc đã bị xóa trên máy
          chủ nguồn.
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
            referrerPolicy="no-referrer"
            onError={() => handleAutoSwitchNext("Video Element Error")}
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
                  setPlayerErrorLog("");
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
              onClick={() => handleAutoSwitchNext("Người dùng bấm Đổi Server")}
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
          {playerErrorLog && (
            <p className="break-all text-hot">
              Trạng thái luồng trước: {playerErrorLog}
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
