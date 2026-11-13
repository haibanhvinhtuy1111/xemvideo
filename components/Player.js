"use client";

import { useEffect, useRef, useState } from "react";

// Helper tạo Loader chuẩn cho Hls.js v1.5.15 (Kế thừa đầy đủ this.stats và context của DefaultLoader)
function createHybridFetchLoader(HlsClass) {
  const DefaultLoader = HlsClass.DefaultConfig.loader;

  return class HybridFetchLoader extends DefaultLoader {
    constructor(config) {
      super(config);
      this.abortFlag = false;
      this.abortController = null;
    }

    destroy() {
      this.abortFlag = true;
      if (this.abortController) {
        try {
          this.abortController.abort();
        } catch (_) {}
      }
      super.destroy();
    }

    abort() {
      this.abortFlag = true;
      if (this.abortController) {
        try {
          this.abortController.abort();
        } catch (_) {}
      }
      super.abort();
    }

    load(context, config, callbacks) {
      const rawUrl = context.url || "";
      const isBinary = context.responseType === "arraybuffer";

      // Nếu là file .m3u8 (manifest / level), dùng DefaultLoader chuẩn của Hls.js
      if (!isBinary) {
        super.load(context, config, callbacks);
        return;
      }

      // Bóc URL thật nếu đang nằm trong /api/videos?rawProxy=1&url=...
      let targetUrl = rawUrl;
      if (rawUrl.includes("/api/videos?") && rawUrl.includes("url=")) {
        try {
          const parsed = new URL(rawUrl, window.location.origin);
          const inner = parsed.searchParams.get("url");
          if (inner && /^https?:\/\//i.test(inner)) {
            targetUrl = inner;
          }
        } catch (_) {}
      }

      const isKey =
        targetUrl.includes("video-hls-key") ||
        targetUrl.includes(".key") ||
        rawUrl.includes("isKey=1") ||
        Boolean(context.decryptdata && !context.frag);

      const proxyEndpoint = `${
        window.location.origin
      }/api/videos?rawProxy=1&proxySegments=1${
        isKey ? "&isKey=1" : ""
      }&url=${encodeURIComponent(targetUrl)}&referer=${encodeURIComponent(
        "https://qmhv3.top/"
      )}`;

      const startTime = performance.now();
      this.stats.loading.start = startTime;
      this.abortFlag = false;
      this.abortController = new AbortController();
      const signal = this.abortController.signal;

      const fetchWithTimeoutClient = async (u, opts = {}, ms = 4500) => {
        const timer = setTimeout(() => {
          try {
            if (!signal.aborted) this.abortController.abort();
          } catch (_) {}
        }, ms);
        try {
          const r = await fetch(u, { ...opts, signal });
          if (!r.ok && r.status !== 206) {
            throw new Error(`HTTP_${r.status}`);
          }
          const buf = await r.arrayBuffer();
          if (!buf || buf.byteLength === 0) {
            throw new Error("EMPTY");
          }
          // Nếu là Key AES-128, đảm bảo đúng 16 bytes (không nhận nhầm trang HTML lỗi)
          if (isKey && buf.byteLength !== 16) {
            throw new Error(`BAD_KEY_LEN_${buf.byteLength}`);
          }
          return buf;
        } finally {
          clearTimeout(timer);
        }
      };

      const runLoad = async () => {
        // BƯỚC 1: Luôn thử gọi trực tiếp từ trình duyệt của người dùng với referrerPolicy: "no-referrer" trước!
        // (Vì ở Ảnh 3, trình duyệt của bạn gọi trực tiếp tới api.qmhv3.top/api/v1/upload/video-hls-key đã thành công ngay lập tức!)
        try {
          const directBuf = await fetchWithTimeoutClient(
            targetUrl,
            {
              referrerPolicy: "no-referrer",
              mode: "cors",
              credentials: "omit",
              cache: "no-store"
            },
            4000
          );
          return directBuf;
        } catch (_) {}

        // BƯỚC 2: Thử gọi trực tiếp có Referer mặc định (nếu CDN cho phép CORS *)
        try {
          const normalBuf = await fetchWithTimeoutClient(
            targetUrl,
            {
              mode: "cors",
              credentials: "omit",
              cache: "no-store"
            },
            3500
          );
          return normalBuf;
        } catch (_) {}

        // BƯỚC 3: Nếu server1.streamcap.store chặn CORS trên trình duyệt, lấy qua Proxy của Server (/api/videos?rawProxy=1)
        const proxyRes = await fetch(proxyEndpoint, { cache: "no-store" });
        if (!proxyRes.ok && proxyRes.status !== 206) {
          throw new Error(`PROXY_HTTP_${proxyRes.status}`);
        }
        const proxyBuf = await proxyRes.arrayBuffer();
        if (!proxyBuf || proxyBuf.byteLength === 0) {
          throw new Error("PROXY_EMPTY");
        }
        if (isKey && proxyBuf.byteLength !== 16) {
          throw new Error(`PROXY_BAD_KEY_${proxyBuf.byteLength}`);
        }
        return proxyBuf;
      };

      runLoad()
        .then((buf) => {
          if (this.abortFlag) return;
          const now = performance.now();
          this.stats.loading.first = now;
          this.stats.loading.end = now;
          this.stats.loaded = buf.byteLength;
          this.stats.total = buf.byteLength;

          callbacks.onSuccess(
            { url: targetUrl, data: buf },
            this.stats,
            context,
            null
          );
        })
        .catch((err) => {
          if (this.abortFlag) return;
          callbacks.onError(
            { code: 403, text: err?.message || "load_failed" },
            context,
            null,
            this.stats
          );
        });
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
  const [liveDiagnostic, setLiveDiagnostic] = useState("");
  const [m3u8Sample, setM3u8Sample] = useState("");

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
    setLiveDiagnostic("");
    setM3u8Sample("");
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
    if (!showDebug || !activeUrl || activeType !== "hls") return;
    let mounted = true;
    const checkUrl =
      activeUrl.startsWith("/") && typeof window !== "undefined"
        ? `${window.location.origin}${activeUrl}`
        : activeUrl;

    fetch(checkUrl, { cache: "no-store" })
      .then((r) => r.text())
      .then((txt) => {
        if (mounted && txt) {
          setM3u8Sample(txt.split(/\r?\n/).slice(0, 14).join("\n"));
        }
      })
      .catch((e) => {
        if (mounted) setM3u8Sample(`Lỗi đọc M3U8: ${e.message}`);
      });

    return () => {
      mounted = false;
    };
  }, [showDebug, activeUrl, activeType]);

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
        if (!isCancelled && el && el.readyState < 2 && el.currentTime === 0) {
          switchNextServer("Quá 20s chưa giải mã được khung hình");
        }
      }, 20000);
    };

    const tryAutoPlaySmart = () => {
      if (!el || isCancelled) return;
      const playPromise = el.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {
          if (!isCancelled && el) {
            el.muted = true;
            el.play().catch(() => {});
          }
        });
      }
    };

    el.addEventListener("loadeddata", clearWatchdog);
    el.addEventListener("canplay", clearWatchdog);
    el.addEventListener("playing", clearWatchdog);

    const resolvedStreamUrl =
      activeUrl.startsWith("/") && typeof window !== "undefined"
        ? `${window.location.origin}${activeUrl}`
        : activeUrl;

    if (!isHlsStream) {
      startWatchdog();
      el.src = resolvedStreamUrl;
      tryAutoPlaySmart();
      return () => {
        isCancelled = true;
        clearWatchdog();
        el.removeEventListener("loadeddata", clearWatchdog);
        el.removeEventListener("canplay", clearWatchdog);
        el.removeEventListener("playing", clearWatchdog);
      };
    }

    const startHlsPlayback = () => {
      if (isCancelled || !videoRef.current) return;
      startWatchdog();

      if (window.Hls && window.Hls.isSupported()) {
        const HybridLoader = createHybridFetchLoader(window.Hls);
        const hls = new window.Hls({
          // Tắt enableWorker để HybridLoader chạy trên main thread và chia sẻ phiên mạng trực tiếp của trình duyệt
          enableWorker: false,
          lowLatencyMode: false,
          loader: HybridLoader,
          fLoader: HybridLoader,
          manifestLoadingTimeOut: 15000,
          manifestLoadingMaxRetry: 2,
          levelLoadingTimeOut: 15000,
          levelLoadingMaxRetry: 2,
          fragLoadingTimeOut: 20000,
          fragLoadingMaxRetry: 3,
          keyLoadingTimeOut: 12000,
          keyLoadingMaxRetry: 2,
          xhrSetup: (xhr) => {
            xhr.withCredentials = false;
          }
        });
        hlsRef.current = hls;

        hls.loadSource(resolvedStreamUrl);
        hls.attachMedia(el);

        hls.on(window.Hls.Events.MANIFEST_PARSED, (_, data) => {
          if (isCancelled) return;
          setLiveDiagnostic(
            `Manifest OK (${data.levels?.length || 1} levels) -> Đang tải Key/Frag...`
          );
          tryAutoPlaySmart();
        });

        hls.on(window.Hls.Events.KEY_LOADED, () => {
          if (isCancelled) return;
          setLiveDiagnostic("Key AES-128 (16 bytes) OK! -> Đang tải Frag #0...");
        });

        hls.on(window.Hls.Events.FRAG_LOADED, (_, data) => {
          if (isCancelled) return;
          clearWatchdog();
          setLiveDiagnostic(
            `Frag #${data.frag?.sn ?? 0} OK (${
              data.frag?.stats?.loaded || 0
            } bytes) -> Đang giải mã video...`
          );
        });

        hls.on(window.Hls.Events.FRAG_PARSED, () => {
          if (isCancelled) return;
          clearWatchdog();
          setLiveDiagnostic("Đang phát video thành công!");
        });

        hls.on(window.Hls.Events.ERROR, (_, data) => {
          if (isCancelled) return;
          const failedUrl =
            data.frag?.url ||
            data.context?.url ||
            data.networkDetails?.responseURL ||
            "";
          const shortUrl = failedUrl ? ` [${failedUrl.slice(0, 80)}]` : "";
          const errText = data.response?.text
            ? ` (${data.response.text})`
            : data.response?.code
            ? ` (${data.response.code})`
            : "";
          const detailMsg = `${data.type}: ${data.details}${errText}${shortUrl}`.trim();
          setLiveDiagnostic(`Lỗi: ${detailMsg}`);

          if (data.fatal) {
            if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR) {
              hls.recoverMediaError();
              return;
            }
            try {
              hls.destroy();
            } catch (_) {}
            hlsRef.current = null;
            switchNextServer(detailMsg);
          }
        });
      } else if (el.canPlayType("application/vnd.apple.mpegurl")) {
        el.src = resolvedStreamUrl;
        el.load();
        tryAutoPlaySmart();
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
      el.removeEventListener("loadeddata", clearWatchdog);
      el.removeEventListener("canplay", clearWatchdog);
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
            referrerPolicy="no-referrer"
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
          {liveDiagnostic && (
            <p className="break-all text-amber-300">
              Tiến trình HLS: {liveDiagnostic}
            </p>
          )}
          {playerErrorLog && (
            <p className="break-all text-hot">
              Trạng thái luồng trước: {playerErrorLog}
            </p>
          )}
          {m3u8Sample && (
            <pre className="mt-1.5 break-all whitespace-pre-wrap rounded-lg border border-border bg-black/60 p-2 text-[11px] text-slate-300">
              Nội dung M3U8:{"\n"}
              {m3u8Sample}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
