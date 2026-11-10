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

function getBackListUrl(isMemberPost = false) {
  if (typeof window === "undefined") {
    return isMemberPost ? "/?category=video-cua-thanh-vien" : "/";
  }
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
  return isMemberPost ? "/?category=video-cua-thanh-vien" : "/";
}

export default function WatchPage() {
  const params = useParams();
  const router = useRouter();
  const rawParam = Array.isArray(params?.slug)
    ? params.slug.join("/")
    : params?.slug || "";
  const cleanSlug = decodeSlugParam(rawParam);
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

        // Phân tách tuyệt đối danh sách đề xuất giữa bài Thành viên và bài của Web
        let currentCat = isMemberVideo ? "video-cua-thanh-vien" : "all";
        let currentPage = "1";

        try {
          const savedState = JSON.parse(
            sessionStorage.getItem(STATE_STORAGE_KEY) || "{}"
          );
          const savedCat = savedState.category || "all";
          const isSavedMemberCat =
            savedCat === "video-cua-thanh-vien" || savedCat === "bai-viet";

          if (isMemberVideo) {
            currentCat = "video-cua-thanh-vien";
            if (isSavedMemberCat && savedState.page) {
              currentPage = String(savedState.page);
            }
          } else {
            if (!isSavedMemberCat) {
              currentCat = savedCat;
              if (savedState.page) {
                currentPage = String(savedState.page);
              }
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
              .filter((x) => {
                const itemSlug = decodeSlugParam(x.slug);
                if (itemSlug === cleanSlug) return false;
                const itemIsMember = itemSlug.startsWith("bai-viet/");
                return isMemberVideo ? itemIsMember : !itemIsMember;
              })
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
  }, [cleanSlug, isMemberVideo]);

  const handleBackToList = () => {
    const targetUrl = getBackListUrl(isMemberVideo);
    router.push(targetUrl);
  };

  const tags = Array.isArray(video?.tags) ? video.tags : [];

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-3 py-4 text-textMain sm:px-6 sm:py-6">
      <div>
        <button
          type="button"
          onClick={handleBackToList}
          className="mb-3.5 inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs font-medium text-textSub shadow-sm transition hover:border-primary/40 hover:bg-sub hover:text-textMain"
        >
          <span>←</span>
          <span>Quay lại danh sách</span>
        </button>

        {loading ? (
          <div className="space-y-4">
            <div className="flex aspect-video w-full animate-pulse items-center justify-center rounded-xl border border-border bg-sub text-sm text-textSub sm:rounded-2xl">
              Đang tải luồng phát...
            </div>
            <div className="h-6 w-3/4 animate-pulse rounded-lg bg-sub" />
          </div>
        ) : (
          <div className="space-y-4">
            <Player video={video} />

            <div className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
              <div className="flex flex-wrap items-center gap-2">
                {isMemberVideo && (
                  <span className="rounded-md border border-success/30 bg-primary-light px-2 py-0.5 text-xs font-semibold text-success">
                    Video thành viên
                  </span>
                )}
                <h1 className="text-base font-semibold leading-snug text-textMain sm:text-xl md:text-2xl">
                  {video?.title || cleanSlug}
                </h1>
              </div>

              {tags.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
                  <span className="mr-1 text-xs font-medium text-textSub">
                    Thẻ:
                  </span>
                  {tags.map((t) => (
                    <Link
                      key={t.slug}
                      href={`/?category=${encodeURIComponent(t.slug)}&page=1`}
                      className="rounded-full border border-border bg-sub px-2.5 py-1 text-xs text-textSub transition hover:border-primary hover:bg-primary hover:text-primary-foreground"
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
        <div className="space-y-4 border-t border-border pt-6">
          <div className="flex items-center gap-2">
            <span className="inline-block h-5 w-1.5 rounded-full bg-primary" />
            <h2 className="text-base font-semibold text-textMain sm:text-lg">
              {isMemberVideo
                ? "Video thành viên khác"
                : "Video cùng trang đề xuất"}
            </h2>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
            {related.map((item, idx) => (
              <VideoCard key={item.slug || idx} video={item} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
