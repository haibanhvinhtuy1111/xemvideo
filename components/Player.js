"use client";

import { useEffect, useRef, useState } from "react";

export default function Player({ video, src, url, type, poster, sources: propSources }) {
  const videoRef = useRef(null);

  // Gom tất cả nguồn phát từ props hoặc từ object video
  const rawSources =
    propSources ||
    video?.sources ||
    [];

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

  const [activeIdx, setActiveIdx] = useState(0);
  const current = normalizedSources[activeIdx] || normalizedSources[0] || null;
  const activeUrl = current?.url || current?.src || "";
  const activeType =
    current?.type ||
    (activeUrl.includes(".m3u8")
      ? "hls"
      : activeUrl.includes(".mp4")
      ? "mp4"
      : "iframe");

  useEffect(() => {
    setActiveIdx(0);
  }, [video?.slug, fallbackUrl]);

  // Tự động nạp hls.js khi gặp luồng .m3u8 trên Chrome / Brave / Edge
  useEffect(() => {
    if (!activeUrl || activeType === "iframe" || !videoRef.current) return;
    const el = videoRef.current;

    if (!activeUrl.includes(".m3u8")) {
      el.src = activeUrl;
      return;
    }

    if (el.canPlayType("application/vnd.apple.mpegurl")) {
      el.src = activeUrl;
      return;
    }

    let hlsInstance = null;
    const initHls = () => {
      if (window.Hls && window.Hls.isSupported()) {
        hlsInstance = new window.Hls();
        hlsInstance.loadSource(activeUrl);
        hlsInstance.attachMedia(el);
      } else {
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
  }, [activeUrl, activeType]);

  if (!activeUrl) {
    return (
      <div className="p-6 rounded-xl bg-zinc-900/60 border border-zinc-800 text-zinc-400 space-y-2">
        <p>Chưa có luồng phát.</p>
        {video?._debug && (
          <div className="text-xs text-zinc-500 font-mono space-y-1 pt-2 border-t border-zinc-800">
            <p>
              Domain: {video._debug.baseDomain} | WP: {video._debug.wpStatus} | HTML: {video._debug.htmlVia} ({video._debug.htmlLength || 0} bytes)
            </p>
            {video._debug.playerSnippet && (
              <pre className="p-2 bg-black/50 rounded overflow-x-auto text-[11px] text-zinc-400">
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
            className="w-full h-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="no-referrer-when-downgrade"
          />
        ) : (
          <video
            ref={videoRef}
            key={activeUrl}
            poster={poster || video?.thumbnail}
            controls
            autoPlay
            playsInline
            className="w-full h-full object-contain"
          />
        )}
      </div>

      {normalizedSources.length > 1 && (
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
      )}
    </div>
  );
}
