"use client";

import { useEffect, useRef, useState } from "react";

// Hàm tự động bóc bỏ Fake Header (PNG/JPG/GIF/junk bytes) nếu segment .ts bị ngụy trang
function cleanTsSegmentBuffer(buf, isEncrypted = false) {
  if (!buf || isEncrypted || buf.byteLength < 564) return buf;
  const view = new Uint8Array(buf);
  // Nếu đã bắt đầu chuẩn bằng MPEG-TS sync byte 0x47 mỗi 188 bytes thì giữ nguyên
  if (view[0] === 0x47 && view[188] === 0x47 && view[376] === 0x47) {
    return buf;
  }
  // Nếu là fMP4 (ftyp / moof / styp) thì giữ nguyên
  const boxName = String.fromCharCode(view[4], view[5], view[6], view[7]);
  if (
    boxName === "ftyp" ||
    boxName === "styp" ||
    boxName === "moof" ||
    boxName === "sidx"
  ) {
    return buf;
  }
  // Quét tìm vị trí bắt đầu thực sự của luồng MPEG-TS (3 gói 188-byte liên tiếp có byte đầu là 0x47)
  const maxScan = Math.min(view.length - 376, 4096);
  for (let i = 1; i < maxScan; i++) {
    if (
      view[i] === 0x47 &&
      view[i + 188] === 0x47 &&
      view[i + 376] === 0x47
    ) {
      return buf.slice(i);
    }
  }
  return buf;
}

// Custom Loader toàn diện cho Hls.js: Bắt cả Key (AES-128), Playlist (.m3u8) và Fragment (.ts)
function createUniversalHlsLoader(HlsClass, postReferer = "https://qmhv3.top/") {
  const DefaultLoader = HlsClass.DefaultConfig.loader;

  return class UniversalHlsLoader {
    constructor(config) {
      this.inner = new DefaultLoader(config);
      this.aborted = false;
      this.controller =
        typeof AbortController !== "undefined" ? new AbortController() : null;
    }

    destroy() {
      this.aborted = true;
      if (this.controller) {
        try {
          this.controller.abort();
        } catch (_) {}
      }
      if (this.inner) this.inner.destroy();
    }

    abort() {
      this.aborted = true;
      if (this.controller) {
        try {
          this.controller.abort();
        } catch (_) {}
      }
      if (this.inner) this.inner.abort();
    }

    load(context, config, callbacks) {
      const url = context.url || "";
      const isBinary = context.responseType === "arraybuffer";

      // Nếu là file .m3u8 (manifest / level) mà chưa đi qua rawProxy thì chuyển qua rawProxy
      if (!isBinary) {
        if (
          url.startsWith("http") &&
          !url.includes(window.location.host) &&
          (url.includes(".m3u8") || url.includes("qmhv3.top"))
        ) {
          context.url = `${
            window.location.origin
          }/api/videos?rawProxy=1&url=${encodeURIComponent(
            url
          )}&referer=${encodeURIComponent(postReferer)}`;
        }
        this.inner.load(context, config, callbacks);
        return;
      }

      // Bóc URL gốc nếu đang nằm trong /api/videos?rawProxy=1&url=...
      let rawRemoteUrl = url;
      let customRef = postReferer;
      if (url.includes("/api/videos?") && url.includes("url=")) {
        try {
          const uObj = new URL(url, window.location.origin);
          const extracted = uObj.searchParams.get("url");
          const extractedRef = uObj.searchParams.get("referer");
          if (extracted && /^https?:\/\//i.test(extracted)) {
            rawRemoteUrl = extracted;
          }
          if (extractedRef) {
            customRef = extractedRef;
          }
        } catch (_) {}
      }

      if (isBinary && /^https?:\/\//i.test(rawRemoteUrl)) {
        const startTime = performance.now();
        // Phát hiện chính xác request tải Khóa giải mã AES-128 trong Hls.js
        const isKey =
          context.type === "key" ||
          rawRemoteUrl.includes(".key") ||
          rawRemoteUrl.includes("/key") ||
          url.includes("isKey=1") ||
          Boolean(context.decryptdata) ||
          Boolean(context.frag && context.frag.type === "key");

        const isEncryptedFrag = Boolean(
          !isKey &&
            context.frag &&
            context.frag.decryptdata &&
            context.frag.decryptdata.uri
        );

        const proxyUrl = `${window.location.origin}/api/videos?rawProxy=1${
          isKey ? "&isKey=1" : "&proxySegments=1"
        }&url=${encodeURIComponent(rawRemoteUrl)}&referer=${encodeURIComponent(
          customRef
        )}`;

        const corsEuUrl = `https://cors.eu.org/${rawRemoteUrl}`;
        const codeTabsUrl = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(
          rawRemoteUrl
        )}`;

        const validateArrayBuffer = async (res) => {
          if (!res.ok && res.status !== 206) {
            throw new Error(`HTTP_${res.status}`);
          }
          const buf = await res.arrayBuffer();
          if (!buf || buf.byteLength === 0) {
            throw new Error("EMPTY");
          }
          if (buf.byteLength < 2000 && !isKey) {
            const head = new TextDecoder()
              .decode(buf.slice(0, 15))
              .toLowerCase();
            if (head.startsWith("<!doc") || head.startsWith("<html")) {
              throw new Error("HTML_ERR");
            }
          }
          // Nếu là Key AES-128 thì độ dài chuẩn thường là 16 bytes (tránh nhận trang báo lỗi HTML dài hàng nghìn byte làm Key)
          if (isKey && buf.byteLength > 256) {
            const head = new TextDecoder()
              .decode(buf.slice(0, 15))
              .toLowerCase();
            if (head.startsWith("<!doc") || head.startsWith("<html")) {
              throw new Error("KEY_IS_HTML");
            }
          }
          return isKey ? buf : cleanTsSegmentBuffer(buf, isEncryptedFrag);
        };

        const signal = this.controller ? this.controller.signal : undefined;

        Promise.any([
          fetch(rawRemoteUrl, {
            referrerPolicy: "no-referrer",
            mode: "cors",
            credentials: "omit",
            cache: "no-store",
            signal
          }).then(validateArrayBuffer),
          fetch(proxyUrl, {
            cache: "no-store",
            signal
          }).then(validateArrayBuffer),
          fetch(corsEuUrl, {
            referrerPolicy: "no-referrer",
            mode: "cors",
            credentials: "omit",
            cache: "no-store",
            signal
          }).then(validateArrayBuffer),
          fetch(codeTabsUrl, {
            referrerPolicy: "no-referrer",
            mode: "cors",
            credentials: "omit",
            cache: "no-store",
            signal
          }).then(validateArrayBuffer)
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
              bwEstimate: Math.round(
                (buf.byteLength * 8000) / Math.max(1, now - startTime)
              ),
              loading: { start: startTime, first: now, end: now },
              parsing: { start: now, end: now },
              buffering: { start: now, first: now, end: now }
            };
            callbacks.onSuccess(
              { url: rawRemoteUrl, data: buf },
              stats,
              context,
              null
            );
          })
          .catch((err) => {
            if (this.aborted) return;
            callbacks.onError(
              { code: 403, text: err?.message || "binary_load_failed" },
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
  const [liveDiagnostic, setLiveDiagnostic] = useState("");

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
        const refererToUse = video?.postLink || "https://qmhv3.top/";
        const CustomLoader = createUniversalHlsLoader(window.Hls, refererToUse);
        const hls = new window.Hls({
          enableWorker: false,
          lowLatencyMode: false,
          // QUAN TRỌNG: Gắn vào cả `loader` và `fLoader` để KeyController (tải khóa AES-128) cũng đi qua UniversalHlsLoader!
          loader: CustomLoader,
          fLoader: CustomLoader,
          manifestLoadingTimeOut: 12000,
          manifestLoadingMaxRetry: 2,
          levelLoadingTimeOut: 12000,
          levelLoadingMaxRetry: 2,
          fragLoadingTimeOut: 18000,
          fragLoadingMaxRetry: 2,
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
          el.play().catch(() => {});
        });

        hls.on(window.Hls.Events.KEY_LOADED, () => {
          if (isCancelled) return;
          setLiveDiagnostic("Manifest OK -> Key AES-128 OK -> Đang tải Frag...");
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
          const shortUrl = failedUrl
            ? ` [${failedUrl.slice(0, 85)}]`
            : "";
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
  }, [activeUrl, activeType, video?.postLink]);

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
          {video?._debug?.m3u8Preview && (
            <pre className="break-all whitespace-pre-wrap rounded-lg border border-border bg-surface p-2 text-[11px] text-slate-300">
              M3U8 mẫu:{"\n"}
              {video._debug.m3u8Preview}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
