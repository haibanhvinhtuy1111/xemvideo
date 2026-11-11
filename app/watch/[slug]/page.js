"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Player from "@/components/Player";
import VideoCard from "@/components/VideoCard";
import { getSource } from "@/config/site";

const STATE_STORAGE_KEY = "videosite_browse_state_v1";

function decodeSlugParam(raw = "") {
  let s = String(raw || "");
  try {
    for (let i = 0; i < 3; i++) {
      if (!s.includes("%")) break;
      const dec = decodeURIComponent(s);
      if (dec === s) break;
      s = dec;
    }
  } catch (_) {}
  return s
    .replace(/__slash__/g, "/")
    .replace(/^\/+|\/+$/g, "");
}

function getBackListUrl(isMemberPost = false, isQmhPost = false) {
  const defaultFallback = isQmhPost
    ? "/?category=qmh-movie"
    : isMemberPost
    ? "/?category=video-cua-thanh-vien"
    : "/";

  if (typeof window === "undefined") return defaultFallback;
  try {
    const raw = sessionStorage.getItem(STATE_STORAGE_KEY);
    if (raw) {
      const st = JSON.parse(raw);
      const sp = new URLSearchParams();
      if (st.category && st.category !== "all") sp.set("category", st.category);
      if (st.page && Number(st.page) > 1) sp.set("page", String(st.page));
      if (st.sortBy && st.sortBy !== "latest") sp.set("sort", st.sortBy);
      if (st.q) sp.set("q", st.q);
      const qs = sp.toString();
      return qs ? `/?${qs}` : "/";
    }
  } catch (_) {}
  return defaultFallback;
}

export default function WatchPage() {
  const params = useParams();
  const router = useRouter();
  const rawParam = Array.isArray(params?.slug)
    ? params.slug.join("/")
    : params?.slug || "";
  const cleanSlug = decodeSlugParam(rawParam);

  const isQmhVideo = cleanSlug.startsWith("qmh__");
  const isMemberVideo = cleanSlug.startsWith("bai-viet/");

  const [video, setVideo] = useState(null);
  const [related, setRelated] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!cleanSlug) return;
    let isMounted = true;

    async function loadData() {
      setLoading(true);
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      try {
        const savedSource = typeof getSource === "function" ? getSource() : "";

        let currentCat = isQmhVideo
          ? "qmh-movie"
          : isMemberVideo
          ? "video-cua-thanh-vien"
          : "all";
        let currentPage = "1";

        try {
          const savedState = JSON.parse(
            sessionStorage.getItem(STATE_STORAGE_KEY) || "{}"
          );
          const savedCat = savedState.category || "all";

          if (isQmhVideo) {
            currentCat = "qmh-movie";
            if (savedCat === "qmh-movie" && savedState.page) {
              currentPage = String(savedState.page);
            }
          } else if (isMemberVideo) {
            currentCat = "video-cua-thanh-vien";
            if (
              (savedCat === "video-cua-thanh-vien" ||
                savedCat === "bai-viet") &&
              savedState.page
            ) {
              currentPage = String(savedState.page);
            }
          } else if (
            savedCat !== "qmh-movie" &&
            savedCat !== "video-cua-thanh-vien" &&
            savedCat !== "bai-viet"
          ) {
            currentCat = savedCat;
            if (savedState.page) {
              currentPage = String(savedState.page);
            }
          }
        } catch (_) {}

        const query = new URLSearchParams({ slug: cleanSlug });
        if (savedSource) query.set("domain", savedSource);

        const listQuery = new URLSearchParams({
          category: currentCat,
          page: currentPage
        });
        if (savedSource) listQuery.set("domain", savedSource);

        const [videoRes, listRes] = await Promise.all([
          fetch(`/api/videos?${query.toString()}`, { cache: "no-store" }),
          fetch(`/api/videos?${listQuery.toString()}`, { cache: "no-store" })
        ]);

        const videoData = await videoRes.json();
        const listData = await listRes.json();

        if (!isMounted) return;

        setVideo(videoData);
        if (Array.isArray(listData?.items)) {
          setRelated(
            listData.items
              .filter((x) => decodeSlugParam(x.slug) !== cleanSlug)
              .slice(0, 8)
          );
        }
      } catch (_) {
        if (isMounted) setVideo(null);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadData();
    return () => {
      isMounted = false;
    };
  }, [cleanSlug, isQmhVideo, isMemberVideo]);

  const handleBackToList = () => {
    const targetUrl = getBackListUrl(isMemberVideo, isQmhVideo);
    router.push(targetUrl);
  };

  const tags = Array.isArray(video?.tags) ? video.tags : [];

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-6 py-4 sm:py-6 text-slate-100 space-y-8">
      <div>
        <button
          type="button"
          onClick={handleBackToList}
          className="inline-flex items-center gap-1.5 rounded-full bg-slate-800/70 hover:bg-slate-800 border border-slate-700/60 px-3.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white mb-3.5 transition"
        >
          <span>←</span>
          <span>Quay lại danh sách</span>
        </button>

        {loading ? (
          <div className="space-y-4">
            <div className="aspect-video w-full bg-slate-800/60 animate-pulse rounded-xl sm:rounded-2xl flex items-center justify-center text-sm text-slate-400">
              Đang tải luồng phát...
            </div>
            <div className="h-6 bg-slate-800/60 rounded-lg w-3/4 animate-pulse" />
          </div>
        ) : (
          <div className="space-y-4">
            <Player video={video} />

            <div className="pt-1 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {isQmhVideo && (
                  <span className="rounded-md bg-indigo-500/20 border border-indigo-500/30 px-2 py-0.5 text-xs font-semibold text-indigo-300">
                    Phim QMH
                  </span>
                )}
                {isMemberVideo && (
                  <span className="rounded-md bg-emerald-500/20 border border-emerald-500/30 px-2 py-0.5 text-xs font-semibold text-emerald-300">
                    Video thành viên
                  </span>
                )}
                <h1 className="text-base sm:text-xl md:text-2xl font-semibold leading-snug text-slate-100">
                  {video?.title || cleanSlug.replace(/^qmh__/, "")}
                </h1>
              </div>

              {tags.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-xs text-slate-400 mr-1">Thẻ:</span>
                  {tags.map((t) => (
                    <Link
                      key={t.slug}
                      href={`/?category=${encodeURIComponent(t.slug)}&page=1`}
                      className="px-2.5 py-1 rounded-full bg-slate-800/70 hover:bg-indigo-500 border border-slate-700/50 text-xs text-slate-300 hover:text-white transition"
                    >
                      #{t.name}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {related.length > 0 && (
        <div className="pt-6 border-t border-slate-800/80 space-y-4">
          <div className="flex items-center gap-2">
            <span className="inline-block w-1.5 h-5 rounded-full bg-indigo-400" />
            <h2 className="text-base sm:text-lg font-semibold text-slate-100">
              {isQmhVideo
                ? "Phim QMH đề xuất"
                : isMemberVideo
                ? "Video thành viên khác"
                : "Video cùng trang đề xuất"}
            </h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
            {related.map((item, idx) => (
              <VideoCard key={item.slug || idx} video={item} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
