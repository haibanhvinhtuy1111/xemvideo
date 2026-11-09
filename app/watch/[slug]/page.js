"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

export default function WatchPage() {
  const params = useParams();
  const router = useRouter();
  const rawSlug = Array.isArray(params?.slug) ? params.slug[0] : params?.slug;

  const [video, setVideo] = useState(null);
  const [activeSource, setActiveSource] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!rawSlug) return;
    let isMounted = true;

    async function loadVideo() {
      setLoading(true);
      try {
        // Lấy domain người dùng đã lưu ở nút "Nguồn" (nếu có)
        const savedDomain =
          typeof window !== "undefined"
            ? localStorage.getItem("sourceDomain") ||
              localStorage.getItem("domain") ||
              ""
            : "";

        const query = new URLSearchParams({ slug: rawSlug });
        if (savedDomain) query.set("domain", savedDomain);

        const res = await fetch(`/api/videos?${query.toString()}`, {
          cache: "no-store"
        });
        const data = await res.json();

        if (!isMounted) return;

        if (res.ok && data && !data.error) {
          setVideo(data);
          // Ưu tiên lấy từ mảng sources, nếu không có thì dựng từ url/embedUrl/videoUrl
          if (Array.isArray(data.sources) && data.sources.length > 0) {
            setActiveSource(data.sources[0]);
          } else {
            const fallbackUrl =
              data.videoUrl || data.hlsUrl || data.mp4Url || data.embedUrl || data.iframe || data.url || data.src || "";
            if (fallbackUrl) {
              const isDirect =
                fallbackUrl.includes(".m3u8") || fallbackUrl.includes(".mp4");
              setActiveSource({
                label: "Server #1",
                url: fallbackUrl,
                type: isDirect
                  ? fallbackUrl.includes(".m3u8")
                    ? "hls"
                    : "mp4"
                  : "iframe"
              });
            } else {
              setActiveSource(null);
            }
          }
        } else {
          setVideo(null);
          setActiveSource(null);
        }
      } catch (err) {
        if (isMounted) {
          setVideo(null);
          setActiveSource(null);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadVideo();
    return () => {
      isMounted = false;
    };
  }, [rawSlug]);

  const sources = video?.sources || [];

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <button
          onClick={() => router.back()}
          className="text-sm text-zinc-400 hover:text-white mb-4 inline-flex items-center gap-1"
        >
          ← Quay lại
        </button>

        {loading ? (
          <div className="aspect-video w-full bg-zinc-900 animate-pulse rounded-xl flex items-center justify-center text-zinc-500">
            Đang tải luồng phát...
          </div>
        ) : (
          <>
            <h1 className="text-xl md:text-2xl font-bold mb-4">
              {video?.title || rawSlug}
            </h1>

            {activeSource?.url ? (
              <div className="space-y-4">
                <div className="relative aspect-video w-full bg-black rounded-xl overflow-hidden border border-zinc-800">
                  {activeSource.type === "iframe" ? (
                    <iframe
                      key={activeSource.url}
                      src={activeSource.url}
                      className="w-full h-full border-0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                      allowFullScreen
                      referrerPolicy="origin"
                    />
                  ) : (
                    <video
                      key={activeSource.url}
                      src={activeSource.url}
                      poster={video?.thumbnail}
                      controls
                      autoPlay
                      playsInline
                      className="w-full h-full object-contain"
                    />
                  )}
                </div>

                {sources.length > 1 && (
                  <div className="flex flex-wrap gap-2">
                    {sources.map((s, idx) => (
                      <button
                        key={idx}
                        onClick={() => setActiveSource(s)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                          activeSource?.url === s.url
                            ? "bg-rose-600 text-white"
                            : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                        }`}
                      >
                        {s.label || `Server #${idx + 1}`}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-6 rounded-xl bg-zinc-900/60 border border-zinc-800 text-zinc-400">
                Chưa có luồng phát.
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
