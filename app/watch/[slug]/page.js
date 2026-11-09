"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Player from "@/components/Player";
import SourceSettings from "@/components/SourceSettings";

function getSavedDomain() {
  if (typeof window === "undefined") return "";
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (/domain|source|url/i.test(key || "")) {
        const val = localStorage.getItem(key);
        if (val && /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+/i.test(val.trim())) {
          return val.trim();
        }
      }
    }
  } catch (_) {}
  return "";
}

export default function WatchPage() {
  const params = useParams();
  const router = useRouter();
  const rawSlug = Array.isArray(params?.slug) ? params.slug[0] : params?.slug;

  const [video, setVideo] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!rawSlug) return;
    let isMounted = true;

    async function loadVideo() {
      setLoading(true);
      try {
        const savedDomain = getSavedDomain();
        const query = new URLSearchParams({ slug: rawSlug });
        if (savedDomain) query.set("domain", savedDomain);

        const res = await fetch(`/api/videos?${query.toString()}`, {
          cache: "no-store"
        });
        const data = await res.json();
        if (isMounted) setVideo(data);
      } catch (_) {
        if (isMounted) setVideo(null);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadVideo();
    return () => {
      isMounted = false;
    };
  }, [rawSlug]);

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-4 py-3 flex items-center justify-between max-w-6xl mx-auto">
        <a href="/" className="text-rose-600 font-bold text-lg">
          VideoSite
        </a>
        <SourceSettings />
      </header>

      <div className="max-w-4xl mx-auto p-4 md:p-8">
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
            <Player video={video} />
          </>
        )}
      </div>
    </main>
  );
}
