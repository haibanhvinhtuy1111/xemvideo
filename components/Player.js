"use client";

import { useEffect, useRef, useState } from "react";

export default function Player({ video, src, url, type, poster, sources: propSources }) {
  const videoRef = useRef(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [useProxyStream, setUseProxyStream] = useState(false);
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
              (fallbackUrl.includes(".m3u8")
                ? "hls"
                : fallbackUrl.includes(".mp4")
                ? "mp4"
                : "iframe")
          }
        ]
      : [];

  const current = normalizedSources[activeIdx] || normalizedSources[0] || null;
  const rawActiveUrl = current?.url || current?.src || "";
  const activeType =
    current?.type ||
    (rawActiveUrl.includes(".m3u8")
      ? "hls"
      : rawActiveUrl.includes(".mp4")
      ? "mp4"
      : "iframe");

  const activeUrl =
    useProxyStream && current?.proxyUrl ? current.proxyUrl : rawActiveUrl;

  useEffect(() => {
    setActiveIdx(0);
    setUseProxyStream(false);
  }, [video?.slug, fallbackUrl]);

  useEffect(() => {
    setUseProxyStream(false);
  }, [activeIdx]);

  useEffect(() => {
    if (!activeUrl || activeType === "iframe" || !videoRef.current) return;
    const el = videoRef.current;
    const isHlsStream = activeType === "hls" || activeUrl.includes(".m3u8");

    if (!isHlsStream) {
      el.src = activeUrl;
      return;
    }

    let hlsInstance = null;
    const initHls = () => {
      if (window.Hls && window.Hls.isSupported()) {
        hlsInstance = new window.Hls({
          enableWorker: true,
          lowLatencyMode: false
        });
        hlsInstance.loadSource(activeUrl);
        hlsInstance.attachMedia(el);
        hlsInstance.on(window.Hls.Events.ERROR, (_, data) => {
          // Nếu luồng HLS trực tiếp bị chặn CORS/Referer, tự động chuyển sang luồng Proxy
          if (data.fatal && !useProxyStream && current?.proxyUrl) {
            hlsInstance.destroy();
            setUseProxyStream(true);
          }
        });
      } else if (el.canPlayType("application/vnd.apple.mpegurl")) {
        el.src = activeUrl;
      }
    };

    if (window.Hls) {
      initHls();
    } else {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/hls.js@latest";
      script.async = true;
      script.onload = initHls;
      document.head.appendChild(script);
    }

    return () => {
      if (hlsInstance) hlsInstance.destroy();
    };
  }, [activeUrl, activeType, useProxyStream, current]);

  if (!activeUrl) {
    return (
      <div className="p-6 rounded-xl bg-zinc-900/60 border border-zinc-800 text-zinc-400 space-y-2">
        <p>Chưa có luồng phát.</p>
        {video?._debug && (
          <div className="text-xs text-zinc-500 font-mono space-y-1 pt-2 border-t border-zinc-800">
            <p>
              Domain: {video._debug.baseDomain} | HTML: {video._debug.htmlVia} ({video._debug.htmlLength || 0} bytes)
            </p>
            {video._debug.playerSnippet && (
              <pre className="p-2 bg-black/50 rounded overflow-x-auto whitespace-pre-wrap text-[11px] text-zinc-400">
                {video._debug.playerSnippet}
              </pre>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative aspect-video w-full bg-black rounded-xl overflow-hidden border border-zinc-800">
        {activeType === "iframe" ? (
          <iframe
            key={activeUrl}
            src={activeUrl}
            scrolling="no"
            className="w-full h-full border-0 overflow-hidden"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="no-referrer"
          />
        ) : (
          <video
            ref={videoRef}
            key={activeUrl}
            poster={poster || video?.thumbnail}
            controls
            autoPlay
            playsInline
            onError={() => {
              if (!useProxyStream && current?.proxyUrl) {
                setUseProxyStream(true);
              }
            }}
            className="w-full h-full object-contain"
          />
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {normalizedSources.map((s, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setActiveIdx(idx)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                activeIdx === idx
                  ? "bg-rose-600 text-white"
                  : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
              }`}
            >
              {s.label || s.name || `Server #${idx + 1}`}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setShowDebug(!showDebug)}
          className="text-xs text-zinc-500 hover:text-zinc-300 underline"
        >
          {showDebug ? "Ẩn chi tiết nguồn" : "🔍 Xem link nguồn (Debug)"}
        </button>
      </div>

      {showDebug && (
        <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-400 space-y-1 overflow-x-auto">
          <p className="text-zinc-300">
            Đang phát ({activeType}): {activeUrl}
          </p>
          {video?._debug?.playerSnippet && (
            <pre className="p-2 bg-black/60 rounded whitespace-pre-wrap text-[11px]">
              {video._debug.playerSnippet}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
