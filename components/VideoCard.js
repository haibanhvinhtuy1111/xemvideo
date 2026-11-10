"use client";

import Link from "next/link";

export default function VideoCard({ video, item }) {
  const v = video || item || {};
  const slug = v.slug || v.id || "";
  const title = v.title || slug;
  const thumb =
    v.thumbnail ||
    v.thumb ||
    v.poster ||
    v.image ||
    "https://placehold.co/600x340/18181b/e11d48?text=Video";

  return (
    <Link
      href={`/watch/${encodeURIComponent(slug)}`}
      className="group flex flex-col overflow-hidden rounded-xl bg-zinc-900/70 border border-zinc-800/80 hover:border-rose-500/60 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-rose-950/20"
    >
      <div className="relative aspect-video w-full overflow-hidden bg-zinc-950">
        <img
          src={thumb}
          alt={title}
          loading="lazy"
          onError={(e) => {
            e.currentTarget.src =
              "https://placehold.co/600x340/18181b/e11d48?text=Video";
          }}
          className="h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-105"
        />

        {/* Lớp phủ градиент & nút Play khi di chuột */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-60 group-hover:opacity-90 transition-opacity" />

        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-600/95 text-white shadow-lg shadow-rose-600/40 transform scale-90 group-hover:scale-100 transition-transform">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-6 h-6 ml-0.5"
            >
              <path
                fillRule="evenodd"
                d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z"
                clipRule="evenodd"
              />
            </svg>
          </div>
        </div>

        {/* Nhãn HD & Thời lượng (nếu có) */}
        <span className="absolute top-2 left-2 rounded bg-rose-600/90 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow">
          HD
        </span>

        {v.duration && (
          <span className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 text-[11px] font-medium text-zinc-200">
            {v.duration}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col justify-between p-3">
        <h3
          title={title}
          className="line-clamp-2 text-sm font-medium leading-snug text-zinc-100 group-hover:text-rose-400 transition-colors"
        >
          {title}
        </h3>

        {v.views && (
          <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-500">
            <span>{v.views}</span>
          </div>
        )}
      </div>
    </Link>
  );
}
