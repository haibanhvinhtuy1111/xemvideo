"use client";

import Link from "next/link";

function encodeSafeWatchSlug(rawSlug = "") {
  const clean = String(rawSlug || "").replace(/^\/+|\/+$/g, "");
  // Mã hóa dấu "/" thành "__slash__" để route [slug] đơn của Next.js luôn nhận đủ 100%
  return encodeURIComponent(clean.replace(/\//g, "__slash__"));
}

export default function VideoCard({ video, item }) {
  const v = video || item || {};
  const slug = v.slug || v.id || "";
  const title = v.title || slug;
  const thumb =
    v.thumbnail ||
    v.thumb ||
    v.poster ||
    v.image ||
    "https://placehold.co/600x340/1e293b/94a3b8?text=Video";

  const views = v.views ?? "0";
  const comments = v.comments ?? "0";
  const likes = v.likes ?? "0";

  return (
    <Link
      href={`/watch/${encodeSafeWatchSlug(slug)}`}
      className="group flex flex-col overflow-hidden rounded-2xl bg-surface border border-border transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/20"
    >
      {/* KHUNG ẢNH THUMBNAIL */}
      <div className="relative aspect-video w-full overflow-hidden bg-sub">
        <img
          src={thumb}
          alt={title}
          loading="lazy"
          onError={(e) => {
            e.currentTarget.src =
              "https://placehold.co/600x340/1e293b/94a3b8?text=Video";
          }}
          className="h-full w-full object-cover object-center transition-transform duration-500 ease-out group-hover:scale-105"
        />

        {/* Gradient mờ đè lên ảnh (Giữ nguyên màu đen để chữ/icon màu trắng luôn nổi bật trên mọi nền) */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-60 transition-opacity group-hover:opacity-80" />

        {/* Nút Play (Primary Color) */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-all duration-300 group-hover:opacity-100">
          <div className="flex h-11 w-11 transform scale-90 items-center justify-center rounded-full bg-primary/90 text-primary-foreground shadow-md backdrop-blur-sm transition-transform group-hover:scale-100">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-5 w-5 ml-0.5"
            >
              <path
                fillRule="evenodd"
                d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z"
                clipRule="evenodd"
              />
            </svg>
          </div>
        </div>

        {/* Badge Thành viên (Success Color) */}
        {slug.startsWith("bai-viet/") && (
          <span className="absolute left-2 top-2 rounded-md bg-success/90 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow">
            Thành viên
          </span>
        )}

        {/* Badge Thời lượng */}
        {v.duration && (
          <span className="absolute bottom-2 right-2 rounded-md bg-black/75 px-1.5 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm shadow-sm">
            {v.duration}
          </span>
        )}
      </div>

      {/* KHUNG NỘI DUNG THÔNG TIN */}
      <div className="flex flex-1 flex-col justify-between bg-surface p-3.5">
        <h3
          title={title}
          className="line-clamp-2 text-[13.5px] font-medium leading-relaxed text-textMain transition-colors group-hover:text-primary"
        >
          {title}
        </h3>

        {/* Khối thống kê */}
        <div className="mt-3 flex items-center gap-4 border-t border-border pt-2.5 text-[11.5px] text-textSub">
          <span className="inline-flex items-center gap-1.5" title="Lượt xem">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-3.5 w-3.5 opacity-75"
            >
              <path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
              <path
                fillRule="evenodd"
                d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
                clipRule="evenodd"
              />
            </svg>
            <span>{views}</span>
          </span>

          <span className="inline-flex items-center gap-1" title="Bình luận">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-3.5 w-3.5 opacity-75"
            >
              <path
                fillRule="evenodd"
                d="M10 2c-2.236 0-4.43.18-6.57.524C1.993 2.755 1 4.014 1 5.426v5.148c0 1.413.993 2.67 2.43 2.902.848.137 1.705.248 2.57.331v3.443a.75.75 0 001.28.53l3.58-3.579a.78.78 0 01.527-.224 41.202 41.202 0 005.183-.5c1.437-.232 2.43-1.49 2.43-2.903V5.426c0-1.413-.993-2.67-2.43-2.902A41.289 41.289 0 0010 2zm0 7a1 1 0 100-2 1 1 0 000 2zM8 8a1 1 0 11-2 0 1 1 0 012 0zm5 1a1 1 0 100-2 1 1 0 000 2z"
                clipRule="evenodd"
              />
            </svg>
            <span>{comments}</span>
          </span>

          <span className="inline-flex items-center gap-1" title="Lượt thích">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-3.5 w-3.5 opacity-75"
            >
              <path d="M1 8.25a1.25 1.25 0 112.5 0v7.5a1.25 1.25 0 11-2.5 0v-7.5zM11 3V1.7c0-.268.14-.526.395-.607A2 2 0 0114 3c0 .995-.182 1.948-.514 2.826-.204.54.166 1.174.744 1.174h2.52c1.243 0 2.261 1.01 2.146 2.247a23.864 23.864 0 01-1.341 5.974C17.153 16.323 16.072 17 14.9 17h-3.192a3 3 0 01-1.341-.317l-2.734-1.366A3 3 0 006.292 15H5V8h.963c.685 0 1.258-.483 1.612-1.068a4.011 4.011 0 012.166-1.73c.432-.143.853-.386 1.011-.814.16-.432.248-.9.248-1.388z" />
            </svg>
            <span>{likes}</span>
          </span>
        </div>
      </div>
    </Link>
  );
}
