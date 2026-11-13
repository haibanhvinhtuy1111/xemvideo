"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Player from "@/components/Player";
import VideoCard from "@/components/VideoCard";
import { getSource } from "@/config/site";

// Hàm dự phòng bóc tách trực tiếp luồng phát QMH ngay trên trình duyệt nếu IP Vercel bị chặn
async function fetchQmhWatchClientFallback(rawSlug = "") {
  const realSlug = String(rawSlug)
    .replace(/^qmh__/, "")
    .replace(/^\/+|\/+$/g, "");
  const watchUrl = `https://qmhv3.top/watch/${realSlug}`;
  const proxies = [
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(watchUrl)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(watchUrl)}`
  ];

  for (const pUrl of proxies) {
    try {
      const res = await fetch(pUrl, { cache: "no-store" });
      if (!res.ok) continue;
      let text = await res.text();
      if (!text || text.length < 300) continue;

      for (let i = 0; i < 2; i++) {
        text = text.replace(/\\"/g, '"').replace(/\\\//g, "/");
      }

      const m3u8Match = text.match(
        /https?:\/\/[^\s"'<>\\`]+?\.m3u8(?:\?[^\s"'<>\\`]*)?/i
      );
      if (!m3u8Match) continue;

      const streamUrl = m3u8Match[0];
      const titleM =
        text.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) ||
        text.match(/"title"\s*:\s*"([^"]{3,220})"/i);
      const title = titleM
        ? titleM[1].replace(/<[^>]+>/g, "").trim()
        : realSlug.replace(/-/g, " ");

      const proxyFull = `/api/videos?rawProxy=1&proxySegments=1&url=${encodeURIComponent(
        streamUrl
      )}&referer=${encodeURIComponent(watchUrl)}`;
      const playerIframe = `/api/videos?qmhPlayerProxy=1&url=${encodeURIComponent(
        streamUrl
      )}&referer=${encodeURIComponent(watchUrl)}`;

      return {
        id: `qmh__${realSlug}`,
        slug: `qmh__${realSlug}`,
        title,
        category: "qmh-movie",
        postLink: watchUrl,
        url: proxyFull,
        src: proxyFull,
        videoUrl: streamUrl,
        hlsUrl: streamUrl,
        type: "hls",
        sources: [
          {
            label: "Server #1 (VIP)",
            name: "Server #1 (VIP)",
            url: proxyFull,
            src: proxyFull,
            rawUrl: streamUrl,
            type: "hls",
            priority: 1
          },
          {
            label: "Server #1 (Player Dự Phòng)",
            name: "Server #1 (Player Dự Phòng)",
            url: playerIframe,
            src: playerIframe,
            rawUrl: streamUrl,
            type: "iframe",
            priority: 2
          },
          {
            label: "Server #1 (Trực tiếp)",
            name: "Server #1 (Trực tiếp)",
            url: streamUrl,
            src: streamUrl,
            rawUrl: streamUrl,
            type: "hls",
            priority: 3
          }
        ]
      };
    } catch (_) {}
  }
  return null;
}

export default function WatchPage() {
  const params = useParams();
  const router = useRouter();

  const rawSlug = Array.isArray(params?.slug)
    ? params.slug.join("/")
    : String(params?.slug || "");

  const decodedSlug = (() => {
    try {
      return decodeURIComponent(rawSlug).replace(/__slash__/g, "/");
    } catch (_) {
      return rawSlug.replace(/__slash__/g, "/");
    }
  })();

  const [video, setVideo] = useState(null);
  const [related, setRelated] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!decodedSlug) return;
    let isMounted = true;
    setLoading(true);
    window.scrollTo({ top: 0, behavior: "smooth" });

    const savedSource = typeof getSource === "function" ? getSource() : "";
    const isQmh = decodedSlug.startsWith("qmh__");

    async function loadVideoDetail() {
      try {
        const query = new URLSearchParams({ slug: decodedSlug });
        if (savedSource) query.set("domain", savedSource);

        const res = await fetch(`/api/videos?${query.toString()}`, {
          cache: "no-store"
        });
        let data = res.ok ? await res.json() : null;

        // Nếu là phim QMH mà server chưa lấy được sources, tự động chạy fallback phía trình duyệt
        if (
          isQmh &&
          (!data || !Array.isArray(data.sources) || data.sources.length === 0)
        ) {
          const fallbackData = await fetchQmhWatchClientFallback(decodedSlug);
          if (fallbackData) {
            data = fallbackData;
          }
        }

        if (!isMounted) return;
        setVideo(data);
      } catch (_) {
        if (!isMounted) return;
        if (isQmh) {
          const fallbackData = await fetchQmhWatchClientFallback(decodedSlug);
          if (isMounted && fallbackData) setVideo(fallbackData);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    async function loadRelatedVideos() {
      try {
        const relCat = isQmh
          ? "qmh-movie"
          : decodedSlug.startsWith("bai-viet/")
          ? "video-cua-thanh-vien"
          : "all";
        const query = new URLSearchParams({ category: relCat, page: "1" });
        if (savedSource) query.set("domain", savedSource);

        const res = await fetch(`/api/videos?${query.toString()}`, {
          cache: "no-store"
        });
        if (!res.ok) return;
        const json = await res.json();
        if (!isMounted) return;
        const list = Array.isArray(json?.items) ? json.items : [];
        setRelated(
          list.filter((item) => item.slug !== decodedSlug).slice(0, 12)
        );
      } catch (_) {}
    }

    loadVideoDetail();
    loadRelatedVideos();

    return () => {
      isMounted = false;
    };
  }, [decodedSlug]);

  const isQmhVideo =
    decodedSlug.startsWith("qmh__") || video?.category === "qmh-movie";

  return (
    <div className="min-h-screen bg-background text-textMain">
      <div className="mx-auto max-w-5xl px-3 py-4 sm:px-4 sm:py-6">
        {/* Nút Quay lại danh sách */}
        <div className="mb-3.5">
          <button
            type="button"
            onClick={() => {
              if (window.history.length > 1) {
                router.back();
              } else {
                router.push(isQmhVideo ? "/?category=qmh-movie" : "/");
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs font-medium text-textMain transition hover:border-primary/40 hover:bg-sub"
          >
            <span>←</span>
            <span>Quay lại danh sách</span>
          </button>
        </div>

        {/* Trình phát Video */}
        {loading ? (
          <div className="space-y-4">
            <div className="aspect-video w-full animate-pulse rounded-xl border border-border bg-surface sm:rounded-2xl" />
            <div className="h-6 w-2/3 animate-pulse rounded bg-surface" />
          </div>
        ) : (
          <div className="space-y-4">
            <Player video={video} />

            {/* Tiêu đề & Nhãn chuyên mục */}
            <div className="space-y-2.5 pt-1">
              <div className="flex flex-wrap items-center gap-2">
                {isQmhVideo ? (
                  <span className="rounded-lg bg-indigo-500/20 px-2.5 py-1 text-xs font-semibold text-indigo-300">
                    Phim QMH
                  </span>
                ) : (
                  <span className="rounded-lg bg-primary-light px-2.5 py-1 text-xs font-semibold text-primary">
                    {decodedSlug.startsWith("bai-viet/")
                      ? "Video thành viên"
                      : "Phim Việt"}
                  </span>
                )}

                <h1 className="text-base font-bold leading-snug text-textMain sm:text-xl">
                  {video?.title || decodedSlug}
                </h1>
              </div>

              {/* Danh sách Tags nếu có */}
              {Array.isArray(video?.tags) && video.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {video.tags.map((t) => (
                    <Link
                      key={t.slug}
                      href={`/?category=${encodeURIComponent(t.slug)}`}
                      className="rounded-full border border-border bg-sub px-2.5 py-1 text-xs text-textSub transition hover:border-primary/40 hover:text-textMain"
                    >
                      #{t.name}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Danh sách Video Đề Xuất */}
        {related.length > 0 && (
          <div className="mt-8 border-t border-border pt-6">
            <div className="mb-4 flex items-center gap-2">
              <span className="inline-block h-5 w-1.5 rounded-full bg-primary" />
              <h2 className="text-sm font-semibold text-textMain sm:text-lg">
                {isQmhVideo ? "Phim QMH đề xuất" : "Video đề xuất"}
              </h2>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
              {related.map((item, idx) => (
                <VideoCard key={item.slug || item.id || idx} video={item} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
