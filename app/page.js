"use client";

import { useEffect, useRef, useState } from "react";
import VideoCard from "@/components/VideoCard";
import { getSource } from "@/config/site";

const MAIN_CATEGORIES = [
  { name: "Tất cả", slug: "all" },
  { name: "Phim Việt mới", slug: "phim-sex-viet-moi" },
  {
    name: "Video thành viên",
    slug: "video-cua-thanh-vien",
    badge: "Mới"
  },
  { name: "Sinh viên", slug: "phim-sex-sinh-vien" },
  { name: "Teen", slug: "teen" },
  { name: "Check hàng", slug: "check-hang" },
  { name: "Camera", slug: "camera" },
  { name: "BDSM", slug: "bdsm" },
  { name: "Máy bay", slug: "may-bay-ba-gia" }
];

const EXTRA_TAGS = [
  { name: "Clip hot", slug: "tag/clip-sex" },
  { name: "Bú cu", slug: "tag/bu-cu" },
  { name: "Bướm non", slug: "tag/buom-non" },
  { name: "Bướm hồng", slug: "tag/buom-hong" },
  { name: "Bướm múp", slug: "tag/buom-mup" },
  { name: "Vú to", slug: "tag/vu-to" },
  { name: "Chân dài", slug: "tag/chan-dai" },
  { name: "Tập thể", slug: "tag/choi-tap-the" },
  { name: "Ngoại tình", slug: "tag/ngoai-tinh" },
  { name: "Lộ clip", slug: "tag/lo-clip" }
];

const SORT_OPTIONS = [
  { id: "latest", label: "Mới nhất" },
  { id: "views", label: "Lượt xem" },
  { id: "likes", label: "Lượt thích" },
  { id: "comments", label: "Bình luận" }
];

function buildPagination(currentPage, totalPages) {
  const pages = new Set();
  const startNear = Math.max(1, currentPage - 2);
  const endNear = Math.min(totalPages, Math.max(5, currentPage + 2));
  for (let p = startNear; p <= endNear; p++) {
    pages.add(p);
  }

  const baseTen = Math.floor(currentPage / 10) * 10;
  for (let step = 1; step <= 3; step++) {
    const milestone = baseTen + step * 10;
    if (milestone > endNear && milestone <= totalPages) {
      pages.add(milestone);
    }
  }

  const sorted = [...pages].sort((a, b) => a - b);
  const result = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) {
      result.push("...");
    }
    result.push(sorted[i]);
  }
  if (sorted.length > 0 && sorted[sorted.length - 1] < totalPages) {
    result.push("...");
  }
  return result;
}

export default function HomePage() {
  const [items, setItems] = useState([]);
  const [category, setCategory] = useState("all");
  const [sortBy, setSortBy] = useState("latest");
  const [sortOpen, setSortOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [dynamicCats, setDynamicCats] = useState([]);
  const [showMoreTags, setShowMoreTags] = useState(false);
  const [jumpPageInput, setJumpPageInput] = useState("");
  const [loading, setLoading] = useState(true);

  const sortDropdownRef = useRef(null);

  // Đóng menu Sắp xếp khi bấm ra ngoài
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        sortDropdownRef.current &&
        !sortDropdownRef.current.contains(e.target)
      ) {
        setSortOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadList() {
      setLoading(true);
      try {
        const savedSource = typeof getSource === "function" ? getSource() : "";
        const params = new URLSearchParams({
          category,
          page: String(page),
          sort: sortBy
        });
        if (q) params.set("q", q);
        if (savedSource) params.set("domain", savedSource);

        const res = await fetch(`/api/videos?${params.toString()}`, {
          cache: "no-store"
        });
        const data = await res.json();

        if (!isMounted) return;

        setItems(Array.isArray(data?.items) ? data.items : []);
        setTotalPages(Math.max(1, Number(data?.totalPages) || 1));
        if (Array.isArray(data?.categories) && data.categories.length > 0) {
          setDynamicCats(data.categories);
        }
      } catch (_) {
        if (isMounted) setItems([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadList();
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    return () => {
      isMounted = false;
    };
  }, [category, q, page, sortBy]);

  const handleSelectCategory = (slug) => {
    setCategory(slug);
    setQ("");
    setSearchInput("");
    setPage(1);
    setShowMoreTags(false);
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setQ(searchInput.trim());
    setPage(1);
  };

  const handleJumpPage = (e) => {
    e.preventDefault();
    const target = parseInt(jumpPageInput, 10);
    if (!isNaN(target) && target >= 1 && target <= totalPages) {
      setPage(target);
      setJumpPageInput("");
    }
  };

  const mainSlugs = new Set(MAIN_CATEGORIES.map((c) => c.slug));
  const mergedExtraTags = [...EXTRA_TAGS];
  for (const dc of dynamicCats) {
    const cleanDc = dc.slug.replace(/^category\//, "");
    if (
      !mainSlugs.has(cleanDc) &&
      !mergedExtraTags.some((t) => t.slug === dc.slug)
    ) {
      mergedExtraTags.push(dc);
    }
  }

  const pageTokens = buildPagination(page, totalPages);
  const currentSortLabel =
    SORT_OPTIONS.find((o) => o.id === sortBy)?.label || "Mới nhất";

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-100">
      {/* Thanh điều hướng & Tìm kiếm nhẹ nhàng, tinh gọn */}
      <div className="sticky top-0 z-20 border-b border-slate-800/80 bg-[#0f172a]/85 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 py-3.5 space-y-3">
          {/* Ô tìm kiếm bo tròn thanh lịch */}
          <form
            onSubmit={handleSearchSubmit}
            className="flex items-center max-w-lg mx-auto rounded-full border border-slate-700/80 bg-slate-900/90 px-4 py-1.5 focus-within:border-indigo-400/80 focus-within:ring-2 focus-within:ring-indigo-500/15 transition-all"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-4 h-4 text-slate-400 mr-2.5 shrink-0"
            >
              <path
                fillRule="evenodd"
                d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
                clipRule="evenodd"
              />
            </svg>
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Tìm kiếm video..."
              className="w-full bg-transparent text-sm text-slate-100 placeholder-slate-400 outline-none"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput("");
                  if (q) {
                    setQ("");
                    setPage(1);
                  }
                }}
                className="px-2 text-slate-400 hover:text-slate-200 text-xs"
              >
                ✕
              </button>
            )}
            <button
              type="submit"
              className="ml-1 rounded-full bg-indigo-500/20 hover:bg-indigo-500 text-indigo-300 hover:text-white px-3.5 py-1 text-xs font-medium transition-colors shrink-0"
            >
              Tìm
            </button>
          </form>

          {/* Danh mục dạng Pill mềm mại */}
          <nav className="flex items-center justify-center flex-wrap gap-1.5 pt-0.5">
            {MAIN_CATEGORIES.map((cat) => {
              const isActive = !q && category === cat.slug;
              return (
                <button
                  key={cat.slug}
                  type="button"
                  onClick={() => handleSelectCategory(cat.slug)}
                  className={`px-3.5 py-1.5 rounded-full text-xs md:text-[13px] font-medium transition-all flex items-center gap-1.5 ${
                    isActive
                      ? "bg-indigo-500 text-white shadow-sm shadow-indigo-500/30"
                      : "bg-slate-800/60 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-700/40"
                  }`}
                >
                  <span>{cat.name}</span>
                  {cat.badge && (
                    <span
                      className={`rounded-full px-1.5 py-0.2 text-[10px] font-semibold ${
                        isActive
                          ? "bg-white/20 text-white"
                          : "bg-emerald-500/15 text-emerald-300"
                      }`}
                    >
                      {cat.badge}
                    </span>
                  )}
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => setShowMoreTags(!showMoreTags)}
              title="Xem thêm thẻ"
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                showMoreTags
                  ? "bg-indigo-500/20 border-indigo-500/40 text-indigo-300"
                  : "bg-slate-800/60 border-slate-700/40 text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              •••
            </button>
          </nav>

          {/* Khung mở rộng các thẻ Tags */}
          {showMoreTags && (
            <div className="pt-2.5 pb-1 border-t border-slate-800/80 flex flex-wrap items-center justify-center gap-1.5">
              {mergedExtraTags.map((tag) => {
                const isActive = !q && category === tag.slug;
                return (
                  <button
                    key={tag.slug}
                    type="button"
                    onClick={() => handleSelectCategory(tag.slug)}
                    className={`px-2.5 py-1 rounded-full text-xs transition ${
                      isActive
                        ? "bg-indigo-500 text-white font-medium"
                        : "bg-slate-800/50 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                    }`}
                  >
                    #{tag.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Khu vực nội dung chính */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Thanh tiêu đề danh mục + Bộ lọc "Sắp xếp theo" */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="inline-block w-1.5 h-5 rounded-full bg-indigo-400" />
            <h2 className="text-base md:text-lg font-semibold text-slate-100">
              {q
                ? `Kết quả tìm kiếm: "${q}"`
                : MAIN_CATEGORIES.find((c) => c.slug === category)?.name ||
                  mergedExtraTags.find((t) => t.slug === category)?.name ||
                  "Danh sách Video"}
            </h2>
            <span className="text-xs text-slate-400 font-normal ml-1">
              (Trang {page.toLocaleString("en-US")}/
              {totalPages.toLocaleString("en-US")})
            </span>
          </div>

          {/* Menu thả xuống: Sắp xếp theo Mới nhất / Lượt xem / Lượt thích / Bình luận */}
          <div className="relative" ref={sortDropdownRef}>
            <button
              type="button"
              onClick={() => setSortOpen(!sortOpen)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-800/70 hover:bg-slate-800 border border-slate-700/60 px-3.5 py-2 text-xs md:text-sm text-slate-300 transition"
            >
              <span className="text-slate-400">Sắp xếp theo</span>
              <span className="font-semibold text-white">
                {currentSortLabel}
              </span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
                  sortOpen ? "rotate-180" : ""
                }`}
              >
                <path
                  fillRule="evenodd"
                  d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                  clipRule="evenodd"
                />
              </svg>
            </button>

            {sortOpen && (
              <div className="absolute right-0 mt-2 w-44 rounded-xl bg-[#1e293b] border border-slate-700/80 py-1.5 shadow-xl shadow-black/40 z-30">
                {SORT_OPTIONS.map((opt) => {
                  const active = sortBy === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setSortBy(opt.id);
                        setSortOpen(false);
                        setPage(1);
                      }}
                      className={`w-full text-left px-4 py-2 text-sm transition-colors flex items-center justify-between ${
                        active
                          ? "text-indigo-400 font-semibold bg-indigo-500/10"
                          : "text-slate-200 hover:bg-slate-800/80 hover:text-white"
                      }`}
                    >
                      <span>{opt.label}</span>
                      {active && (
                        <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Lưới hiển thị Video */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="rounded-2xl bg-slate-800/35 border border-slate-800/70 overflow-hidden animate-pulse"
              >
                <div className="aspect-video w-full bg-slate-800/70" />
                <div className="p-3.5 space-y-2.5">
                  <div className="h-3.5 bg-slate-800 rounded w-11/12" />
                  <div className="h-3.5 bg-slate-800 rounded w-2/3" />
                  <div className="pt-2 flex gap-4">
                    <div className="h-3 bg-slate-800 rounded w-12" />
                    <div className="h-3 bg-slate-800 rounded w-8" />
                    <div className="h-3 bg-slate-800 rounded w-8" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-12 text-center space-y-3">
            <p className="text-slate-400 text-sm">
              Không tìm thấy video nào trong mục này.
            </p>
            <button
              type="button"
              onClick={() => handleSelectCategory("all")}
              className="px-4 py-2 rounded-full bg-indigo-500 text-white text-xs font-medium hover:bg-indigo-400 transition"
            >
              Về trang tất cả
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {items.map((item, idx) => (
              <VideoCard key={item.slug || item.id || idx} video={item} />
            ))}
          </div>
        )}

        {/* Thanh phân trang hài hòa, dễ bấm */}
        {!loading && items.length > 0 && totalPages > 1 && (
          <div className="mt-12 pt-6 border-t border-slate-800/80 flex flex-col items-center gap-4">
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              <span className="px-3 py-1.5 rounded-lg bg-slate-800/70 border border-slate-700/60 text-xs font-medium text-slate-300">
                Page {page.toLocaleString("en-US")} of{" "}
                {totalPages.toLocaleString("en-US")}
              </span>

              {page > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => setPage(1)}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 text-xs font-medium text-slate-200 transition"
                  >
                    « First
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage(Math.max(1, page - 1))}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 text-xs font-medium text-slate-200 transition"
                  >
                    «
                  </button>
                </>
              )}

              {pageTokens.map((tok, idx) =>
                tok === "..." ? (
                  <span
                    key={`dots-${idx}`}
                    className="px-2 py-1.5 text-xs text-slate-500 select-none"
                  >
                    ...
                  </span>
                ) : (
                  <button
                    key={tok}
                    type="button"
                    onClick={() => setPage(tok)}
                    className={`min-w-[34px] px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition ${
                      page === tok
                        ? "bg-indigo-500 border-indigo-400 text-white shadow-sm shadow-indigo-500/30"
                        : "bg-slate-800/80 hover:bg-slate-700 border-slate-700/60 text-slate-200"
                    }`}
                  >
                    {tok.toLocaleString("en-US")}
                  </button>
                )
              )}

              {page < totalPages && (
                <>
                  <button
                    type="button"
                    onClick={() => setPage(Math.min(totalPages, page + 1))}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 text-xs font-medium text-slate-200 transition"
                  >
                    »
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage(totalPages)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 text-xs font-medium text-slate-200 transition"
                  >
                    Last »
                  </button>
                </>
              )}
            </div>

            <form
              onSubmit={handleJumpPage}
              className="flex items-center gap-2 text-xs text-slate-400"
            >
              <span>Đi tới trang:</span>
              <input
                type="number"
                min={1}
                max={totalPages}
                value={jumpPageInput}
                onChange={(e) => setJumpPageInput(e.target.value)}
                placeholder={`1 - ${totalPages}`}
                className="w-24 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-slate-100 outline-none focus:border-indigo-400"
              />
              <button
                type="submit"
                className="rounded-lg bg-slate-800 hover:bg-indigo-500 px-3 py-1 text-xs font-medium text-slate-200 hover:text-white transition"
              >
                Đi
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
