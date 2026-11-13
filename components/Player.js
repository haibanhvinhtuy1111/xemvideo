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

  // Khi người dùng bật "Chi tiết nguồn", lấy thử 10 dòng đầu của file .m3u8 để hiển thị chẩn đoán
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
          setM3u8Sample(txt.split(/\r?\n/).slice(0, 12).join("\n"));
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
          switchNextServer("Quá 15s chưa giải mã được khung hình");
        }
      }, 15000);
    };

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
        el.removeEventListener("loadeddata", clearWatchdog);
        el.removeEventListener("playing", clearWatchdog);
      };
    }

    const startHlsPlayback = () => {
      if (isCancelled || !videoRef.current) return;
      startWatchdog();

      if (window.Hls && window.Hls.isSupported()) {
        // Dùng XHR Loader mặc định chính chủ của Hls.js để không bị treo this.stats
        const hls = new window.Hls({
          enableWorker: false,
          lowLatencyMode: false,
          manifestLoadingTimeOut: 10000,
          manifestLoadingMaxRetry: 2,
          levelLoadingTimeOut: 10000,
          levelLoadingMaxRetry: 2,
          fragLoadingTimeOut: 12000,
          fragLoadingMaxRetry: 2,
          keyLoadingTimeOut: 8000,
          keyLoadingMaxRetry: 1,
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
          el.play().catch(() => {});
        });

        hls.on(window.Hls.Events.KEY_LOADING, (_, data) => {
          if (isCancelled) return;
          const kUri = data.frag?.decryptdata?.uri || "";
          setLiveDiagnostic(
            `Đang tải Key: ${kUri.startsWith("data:") ? "Base64 Inline Key" : kUri.slice(0, 70)}`
          );
        });

        hls.on(window.Hls.Events.KEY_LOADED, () => {
          if (isCancelled) return;
          setLiveDiagnostic("Key AES-128 OK -> Đang tải Frag #0...");
        });

        hls.on(window.Hls.Events.FRAG_LOADING, (_, data) => {
          if (isCancelled) return;
          if ((data.frag?.sn ?? 0) <= 1) {
            setLiveDiagnostic(
              `Đang tải Frag #${data.frag?.sn ?? 0}: ${(data.frag?.url || "").slice(0, 75)}`
            );
          }
        });

        hls.on(window.Hls.Events.FRAG_LOADED, (_, data) => {
          if (isCancelled) return;
          setLiveDiagnostic(
            `Frag #${data.frag?.sn ?? 0} đã tải (${
              data.frag?.stats?.loaded || 0
            } bytes) -> Đang giải mã...`
          );
        });

        hls.on(window.Hls.Events.FRAG_PARSED, () => {
          if (isCancelled) return;
          clearWatchdog();
          setLiveDiagnostic("Đang phát bình thường!");
        });

        hls.on(window.Hls.Events.ERROR, (_, data) => {
          if (isCancelled) return;
          const failedUrl =
            data.frag?.url ||
            data.context?.url ||
            data.networkDetails?.responseURL ||
            "";
          const shortUrl = failedUrl ? ` [${failedUrl.slice(0, 80)}]` : "";
          const errCode = data.response?.code
            ? `(${data.response.code})`
            : "";
          const detailMsg = `${data.type}: ${data.details} ${errCode}${shortUrl}`.trim();
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
