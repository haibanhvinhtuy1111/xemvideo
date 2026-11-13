"use client";

import { useEffect, useRef, useState } from "react";

// Tạo Custom Loader cho Hls.js: Khi tải Key hoặc Segment của qmhv3.top,
// dùng fetch() với referrerPolicy: "no-referrer" (ẩn hoàn toàn tên miền vercel.app)
// và đua song song với Proxy để không bao giờ bị lỗi keyLoadError (403)
function createQmhMultiRouteLoader(HlsClass) {
  const DefaultLoader = HlsClass.DefaultConfig.loader;

  return class QmhMultiRouteLoader {
    constructor(config) {
      this.inner = new DefaultLoader(config);
      this.aborted = false;
    }

    destroy() {
      this.aborted = true;
      if (this.inner) this.inner.destroy();
    }

    abort() {
      this.aborted = true;
      if (this.inner) this.inner.abort();
    }

    load(context, config, callbacks) {
      const url = context.url || "";
      const isBinary = context.responseType === "arraybuffer";

      // Áp dụng cho mọi request tải Key giải mã hoặc phân đoạn .ts từ qmhv3.top
      if (
        isBinary &&
        url.includes("qmhv3.top") &&
        !url.includes("/api/videos?")
      ) {
        const startTime = performance.now();
        const isKey =
          url.includes(".key") ||
          url.includes("/key") ||
          Boolean(context.decryptdata);

        const proxyFallbackUrl = `${
          window.location.origin
        }/api/videos?rawProxy=1${
          isKey ? "&isKey=1" : "&proxySegments=1"
        }&url=${encodeURIComponent(url)}&referer=${encodeURIComponent(
          "https://qmhv3.top/"
        )}`;

        const checkBuffer = async (res) => {
          if (!res.ok && res.status !== 206) {
            throw new Error(`HTTP_${res.status}`);
          }
          const buf = await res.arrayBuffer();
          if (!buf || buf.byteLength === 0) {
            throw new Error("EMPTY_BUF");
          }
          return buf;
        };

        // Đua song song:
        // 1. Gọi trực tiếp từ IP máy người dùng nhưng ẩn hoàn toàn Referer (no-referrer)
        // 2. Gọi qua Proxy của server
        Promise.any([
          fetch(url, {
            referrerPolicy: "no-referrer",
            mode: "cors",
            credentials: "omit",
            cache: "no-store"
          }).then(checkBuffer),
          fetch(proxyFallbackUrl, { cache: "no-store" }).then(checkBuffer)
        ])
          .then((buf) => {
            if (this.aborted) return;
            const now = performance.now();
            const stats = {
              aborted: false,
              loaded: buf.byteLength,
              total: buf.byteLength,
              retry: 0,
              chunkCount: 1,
              bwEstimate: 0,
              loading: { start: startTime, first: now, end: now },
              parsing: { start: now, end: now },
              buffering: { start: now, first: now, end: now }
            };
            callbacks.onSuccess({ url, data: buf }, stats, context, null);
          })
          .catch((err) => {
            if (this.aborted) return;
            callbacks.onError(
              { code: 403, text: err?.message || "key_or_frag_blocked" },
              context,
              null,
              {}
            );
          });
        return;
      }

      this.inner.load(context, config, callbacks);
    }
  };
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
  const hlsRef = useRef(null);

  const [activeIdx, setActiveIdx] = useState(0);
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

  const sourcesCount = normalizedSources.length;
  const current = normalizedSources[activeIdx] || normalizedSources[0] || null;
  const activeUrl = current?.url || current?.src || "";

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
    setAutoSwitchedMsg("");
    setPlayerErrorLog("");
  }, [video?.slug]);

  const switchNextServer = (reason = "") => {
    if (watchdogTimerRef.current) {
      clearTimeout(watchdogTimerRef.current);
      watchdogTimerRef.current = null;
    }
    if (reason) {
      setPlayerErrorLog(String(reason));
    }
    setActiveIdx((prev) => {
      if (prev + 1 < sourcesCount) {
        const nextIdx = prev + 1;
        const nextLabel =
          normalizedSources[nextIdx]?.label || `Server #${nextIdx + 1}`;
        setAutoSwitchedMsg(
          `Đã tự động chuyển sang ${nextLabel}${reason ? ` (${reason})` : ""}.`
        );
        return nextIdx;
      }
      return prev;
    });
  };

  useEffect(() => {
    if (watchdogTimerRef.current) {
      clearTimeout(watchdogTimerRef.current);
      watchdogTimerRef.current = null;
    }
    if (hlsRef.current) {
      try {
        hlsRef.current.destroy();
      } catch (_) {}
      hlsRef.current = null;
    }

    if (!activeUrl || activeType === "iframe" || !videoRef.current) return;

    const el = videoRef.current;
    let isCancelled = false;

    const isHlsStream =
      activeType === "hls" ||
      activeUrl.includes(".m3u8") ||
      activeUrl.includes("rawProxy=1") ||
      activeUrl.includes("hlsProxy=1");

    const clearWatchdog = () => {
      if (watchdogTimerRef.current) {
        clearTimeout(watchdogTimerRef.current);
        watchdogTimerRef.current = null;
      }
    };

    const startWatchdog = () => {
      clearWatchdog();
      watchdogTimerRef.current = setTimeout(() => {
        if (!isCancelled && el && el.readyState < 1 && el.currentTime === 0) {
          switchNextServer("Quá 12s chưa nhận được khung hình");
        }
      }, 12000);
    };

    el.addEventListener("loadedmetadata", clearWatchdog);
    el.addEventListener("loadeddata", clearWatchdog);
    el.addEventListener("playing", clearWatchdog);

    const resolvedStreamUrl =
      activeUrl.startsWith("/") && typeof window !== "undefined"
        ? `${window.location.origin}${activeUrl}`
        : activeUrl;

    if (!isHlsStream) {
      startWatchdog();
      el.src = resolvedStreamUrl;
      el.play().catch(() => {});
      return () => {
        isCancelled = true;
        clearWatchdog();
        el.removeEventListener("loadedmetadata", clearWatchdog);
        el.removeEventListener("loadeddata", clearWatchdog);
        el.removeEventListener("playing", clearWatchdog);
      };
    }

    const startHlsPlayback = () => {
      if (isCancelled || !videoRef.current) return;
      startWatchdog();

      if (window.Hls && window.Hls.isSupported()) {
        const CustomLoader = createQmhMultiRouteLoader(window.Hls);
        const hls = new window.Hls({
          enableWorker: false,
          lowLatencyMode: false,
          fLoader: CustomLoader,
          manifestLoadingTimeOut: 10000,
          manifestLoadingMaxRetry: 2,
          levelLoadingTimeOut: 10000,
          levelLoadingMaxRetry: 2,
          fragLoadingTimeOut: 15000,
          fragLoadingMaxRetry: 2,
          xhrSetup: (xhr) => {
            xhr.withCredentials = false;
          }
        });
        hlsRef.current = hls;

        hls.loadSource(resolvedStreamUrl);
        hls.attachMedia(el);

        hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
          if (isCancelled) return;
          clearWatchdog();
          el.play().catch(() => {});
        });

        hls.on(window.Hls.Events.ERROR, (_, data) => {
          if (isCancelled) return;
          if (data.fatal) {
            if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR) {
              hls.recoverMediaError();
              return;
            }
            const errCode = data.response?.code
              ? `(${data.response.code})`
              : "";
            const errMsg = `${data.type}: ${data.details} ${errCode}`.trim();
            try {
              hls.destroy();
            } catch (_) {}
            hlsRef.current = null;
            switchNextServer(errMsg);
          }
        });
      } else if (el.canPlayType("application/vnd.apple.mpegurl")) {
        el.src = resolvedStreamUrl;
        el.load();
        el.play().catch(() => {});
      }
    };

    if (typeof window !== "undefined" && window.Hls) {
      startHlsPlayback();
    } else if (typeof document !== "undefined") {
      const existingScript = document.querySelector('script[src*="hls."]');
      if (existingScript) {
        existingScript.addEventListener("load", startHlsPlayback, {
          once: true
        });
      } else {
        const script = document.createElement("script");
        script.src =
          "https://cdn.jsdelivr.net/npm/hls.js@1.5.15/dist/hls.min.js";
        script.async = true;
        script.onload = startHlsPlayback;
        script.onerror = startHlsPlayback;
        document.head.appendChild(script);
      }
    }

    return () => {
      isCancelled = true;
      clearWatchdog();
      el.removeEventListener("loadedmetadata", clearWatchdog);
      el.removeEventListener("loadeddata", clearWatchdog);
      el.removeEventListener("playing", clearWatchdog);
      if (hlsRef.current) {
        try {
          hlsRef.current.destroy();
        } catch (_) {}
        hlsRef.current = null;
      }
    };
  }, [activeUrl, activeType]);

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
            poster={poster || video?.thumbnail}
            controls
            autoPlay
            playsInline
            referrerPolicy="no-referrer"
            onError={() => {
              if (!hlsRef.current) {
                switchNextServer("Video Element Error");
              }
            }}
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
              onClick={() => switchNextServer("Đổi thủ công")}
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
