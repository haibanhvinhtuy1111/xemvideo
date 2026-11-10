"use client";

import { useEffect, useState } from "react";
import VideoCard from "@/components/VideoCard";
import { getSource } from "@/config/site";

// Danh sách thẻ danh mục chính giống hệt thanh menu Viet69
const MAIN_CATEGORIES = [
  { name: "Tất cả mới", slug: "all" },
  { name: "Phim sex Việt mới", slug: "phim-sex-viet-moi" },
  {
    name: "Video của thành viên",
    slug: "video-cua-thanh-vien",
    badge: "MỚI"
  },
  { name: "Phim sex sinh viên", slug: "phim-sex-sinh-vien" },
  { name: "Teen", slug: "teen" },
  { name: "Check hàng", slug: "check-hang" },
  { name: "Camera", slug: "camera" },
  { name: "BDSM", slug: "bdsm" },
  { name: "Máy bay bà già", slug: "may-bay-ba-gia" }
];

// Các thẻ phổ biến trong menu mở rộng "..."
const EXTRA_TAGS = [
  { name: "Clip sex", slug: "tag/clip-sex" },
  { name: "Bú cu", slug: "tag/bu-cu" },
  { name: "Bướm non", slug: "tag/buom-non" },
  { name: "Bướm hồng", slug: "tag/buom-hong" },
  { name: "Bướm múp", slug: "tag/buom-mup" },
  { name: "Vú to", slug: "tag/vu-to" },
  { name: "Chân dài", slug: "tag/chan-dai" },
  { name: "Chơi tập thể", slug: "tag/choi-tap-the" },
  { name: "Ngoại tình", slug: "tag/ngoai-tinh" },
  { name: "Lộ clip", slug: "tag/lo-clip" }
];

// Hàm tính toán dãy nút phân trang kiểu WP-PageNavi: 1 2 3 4 5 ... 10 20 30 ... » Last »
function buildPagination(currentPage, totalPages) {
  const pages = new Set();

  // Các trang lân cận trang hiện tại (tối소 1..5 khi ở trang 1)
  const startNear = Math.max(1, currentPage - 2);
  const endNear = Math.min(totalPages, Math.max(5, currentPage + 2));
  for (let p = startNear; p <= endNear; p++) {
    pages.add(p);
  }

  // Các mốc nhảy chẵn chục (+10, +20, +30 hoặc 10, 20, 30) giống WP-PageNavi
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
  const [searchInput, setSearchInput] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [dynamicCats, setDynamicCats] = useState([]);
  const [showMoreTags, setShowMoreTags] = useState(false);
  const [jumpPageInput, setJumpPageInput] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadList() {
      setLoading(true);
      try {
        const savedSource = typeof getSource === "function" ? getSource() : "";
        const params = new URLSearchParams({
          category,
          page: String(page)
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
  }, [category, q, page]);

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

  // Gộp danh sách thẻ mở rộng từ trang nguồn và bộ thẻ chuẩn
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

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Thanh Tìm kiếm & Menu Danh mục kiểu Viet69 */}
      <div className="border-b border-zinc-800/80 bg-zinc-900/90 backdrop-blur sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 py-3 space-y-3">
          {/* Ô Tìm kiếm */}
          <form
            onSubmit={handleSearchSubmit}
            className="flex items-center max-w-xl mx-auto rounded-lg overflow-hidden border border-zinc-700 bg-zinc-950 focus-within:border-rose-500 transition-colors"
          >
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Tìm kiếm video..."
              className="w-full bg-transparent px-4 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none"
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
                className="px-2 text-zinc-500 hover:text-zinc-300 text-xs"
              >
                ✕
              </button>
            )}
            <button
              type="submit"
              className="bg-zinc-800 hover:bg-rose-600 text-zinc-200 hover:text-white px-4 py-2 text-sm font-medium transition-colors flex items-center gap-1.5"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-4 h-4"
              >
                <path
                  fillRule="evenodd"
                  d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
                  clipRule="evenodd"
                />
              </svg>
              <span>Tìm</span>
            </button>
          </form>

          {/* Hàng thẻ Danh mục chính */}
          <nav className="flex items-center justify-center flex-wrap gap-x-1 gap-y-2 pt-1">
            {MAIN_CATEGORIES.map((cat) => {
              const isActive = !q && category === cat.slug;
              return (
                <button
                  key={cat.slug}
                  type="button"
                  onClick={() => handleSelectCategory(cat.slug)}
                  className={`relative px-3 py-1.5 rounded-lg text-xs md:text-sm font-semibold transition-all ${
                    isActive
                      ? "bg-rose-600 text-white shadow-md shadow-rose-600/30"
                      : "text-zinc-200 hover:text-white hover:bg-zinc-800"
                  }`}
                >
                  {cat.name}
                  {cat.badge && (
                    <span className=" -top-2 -right-1 ml-1.5 inline-block rounded bg-red-600 px-1.5 py-0.2 text-[9px] font-extrabold uppercase leading-tight text-white shadow">
                      {cat.badge}
                    </span>
                  )}
                </button>
              );
            })}

            {/* Nút "..." mở rộng thêm các thẻ Tags */}
            <button
              type="button"
              onClick={() => setShowMoreTags(!showMoreTags)}
              title="Xem thêm thẻ & danh mục"
              className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${
                showMoreTags
                  ? "bg-zinc-700 text-white"
                  : "text-zinc-300 hover:text-white hover:bg-zinc-800"
              }`}
            >
              •••
            </button>
          </nav>

          {/* Khung mở rộng khi bấm nút "..." */}
          {showMoreTags && (
            <div className="pt-2 pb-1 border-t border-zinc-800 flex flex-wrap items-center justify-center gap-1.5">
              {mergedExtraTags.map((tag) => {
                const isActive = !q && category === tag.slug;
                return (
                  <button
                    key={tag.slug}
                    type="button"
                    onClick={() => handleSelectCategory(tag.slug)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${
                      isActive
                        ? "bg-rose-600 text-white"
                        : "bg-zinc-800/80 text-zinc-300 hover:bg-zinc-700 hover:text-white"
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

      {/* Nội dung danh sách Video */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Tiêu đề trạng thái lọc hiện tại */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base md:text-lg font-bold text-zinc-100 flex items-center gap-2">
            <span className="inline-block w-1.5 h-5 rounded-full bg-rose-600" />
            {q
              ? `Kết quả tìm kiếm: "${q}"`
              : MAIN_CATEGORIES.find((c) => c.slug === category)?.name ||
                mergedExtraTags.find((t) => t.slug === category)?.name ||
                "Danh sách Video"}
          </h2>
          <span className="text-xs text-zinc-400">
            Trang {page.toLocaleString("en-US")} /{" "}
            {totalPages.toLocaleString("en-US")}
          </span>
        </div>

        {/* Lưới thẻ Video */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="rounded-xl bg-zinc-900/60 border border-zinc-800/60 overflow-hidden animate-pulse"
              >
                <div className="aspect-video w-full bg-zinc-800/80" />
                <div className="p-3 space-y-2">
                  <div className="h-3.5 bg-zinc-800 rounded w-11/12" />
                  <div className="h-3.5 bg-zinc-800 rounded w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-12 text-center space-y-3">
            <p className="text-zinc-400 text-sm">
              Không tìm thấy video nào trong mục này.
            </p>
            <button
              type="button"
              onClick={() => handleSelectCategory("all")}
              className="px-4 py-2 rounded-lg bg-rose-600 text-white text-xs font-semibold hover:bg-rose-500 transition"
            >
              Quay lại trang chủ
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {items.map((item, idx) => (
              <VideoCard key={item.slug || item.id || idx} video={item} />
            ))}
          </div>
        )}

        {/* Thanh phân trang chuẩn WP-PageNavi (Page 1 of 1,050 | 1 2 3 4 5 ... 10 20 30 ... » Last ») */}
        {!loading && items.length > 0 && totalPages > 1 && (
          <div className="mt-10 pt-6 border-t border-zinc-800/80 flex flex-col items-center gap-4">
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              {/* Nhãn Page X of 1,050 */}
              <span className="px-3 py-1.5 rounded bg-zinc-800/90 border border-zinc-700/80 text-xs font-semibold text-zinc-200">
                Page {page.toLocaleString("en-US")} of{" "}
                {totalPages.toLocaleString("en-US")}
              </span>

              {/* Nút « First & ‹ Prev khi ở trang > 1 */}
              {page > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => setPage(1)}
                    className="px-2.5 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/70 text-xs font-semibold text-zinc-200 transition"
                  >
                    « First
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage(Math.max(1, page - 1))}
                    className="px-2.5 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/70 text-xs font-semibold text-zinc-200 transition"
                  >
                    «
                  </button>
                </>
              )}

              {/* Các nút số trang & mốc 10, 20, 30 */}
              {pageTokens.map((tok, idx) =>
                tok === "..." ? (
                  <span
                    key={`dots-${idx}`}
                    className="px-2.5 py-1.5 rounded bg-zinc-900 border border-zinc-800 text-xs text-zinc-400 select-none"
                  >
                    ...
                  </span>
                ) : (
                  <button
                    key={tok}
                    type="button"
                    onClick={() => setPage(tok)}
                    className={`min-w-[34px] px-2.5 py-1.5 rounded text-xs font-bold border transition ${
                      page === tok
                        ? "bg-rose-600 border-rose-500 text-white shadow-md shadow-rose-600/20"
                        : "bg-zinc-800 hover:bg-zinc-700 border-zinc-700/70 text-zinc-200"
                    }`}
                  >
                    {tok.toLocaleString("en-US")}
                  </button>
                )
              )}

              {/* Nút » (Next) và Last » */}
              {page < totalPages && (
                <>
                  <button
                    type="button"
                    onClick={() => setPage(Math.min(totalPages, page + 1))}
                    className="px-2.5 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/70 text-xs font-semibold text-zinc-200 transition"
                  >
                    »
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage(totalPages)}
                    className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/70 text-xs font-semibold text-zinc-200 transition"
                  >
                    Last »
                  </button>
                </>
              )}
            </div>

            {/* Ô nhảy nhanh đến trang bất kỳ (1 - 1,050) */}
            <form
              onSubmit={handleJumpPage}
              className="flex items-center gap-2 text-xs text-zinc-400"
            >
              <span>Đi tới trang:</span>
              <input
                type="number"
                min={1}
                max={totalPages}
                value={jumpPageInput}
                onChange={(e) => setJumpPageInput(e.target.value)}
                placeholder={`1 - ${totalPages}`}
                className="w-24 rounded border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-100 outline-none focus:border-rose-500"
              />
              <button
                type="submit"
                className="rounded bg-zinc-800 hover:bg-rose-600 px-3 py-1 text-xs font-medium text-zinc-200 hover:text-white transition"
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
