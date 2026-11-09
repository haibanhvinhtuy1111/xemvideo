"use client";
import { useEffect, useRef, useState } from "react";

export default function Player({ servers = [] }) {
  const [idx, setIdx] = useState(0);
  const videoRef = useRef(null);
  const s = servers[idx];

  useEffect(() => {
    if (!s || s.type === "iframe") return;
    const video = videoRef.current;
    if (!video) return;
    let hls;
    if (s.type === "hls") {
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = s.url;
      } else {
        import("hls.js").then(({ default: Hls }) => {
          if (!Hls.isSupported()) return;
          hls = new Hls();
          hls.loadSource(s.url);
          hls.attachMedia(video);
        });
      }
    } else {
      video.src = s.url;
    }
    return () => { if (hls) hls.destroy(); video.removeAttribute("src"); video.load(); };
  }, [s]);

  if (!s) return <p className="text-zinc-400">Chưa có luồng phát.</p>;
  return (
    <div>
      <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
        {s.type === "iframe"
          ? <iframe key={s.url} src={s.url} className="h-full w-full" allowFullScreen allow="autoplay; encrypted-media; picture-in-picture" />
          : <video ref={videoRef} controls playsInline className="h-full w-full" />}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {servers.map((sv, i) => (
          <button key={i} onClick={() => setIdx(i)}
            className={`rounded-md px-3 py-1.5 text-sm ${i === idx ? "bg-rose-600" : "bg-zinc-800 hover:bg-zinc-700"}`}>
            {sv.name || `Server ${i + 1}`}
          </button>
        ))}
      </div>
    </div>
  );
}
