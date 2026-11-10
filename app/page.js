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

const STATE_STORAGE_KEY = "videosite_browse_state_v1";
const CACHE_STORAGE_KEY = "videosite_list_cache_v1";
const SCROLL_STORAGE_KEY = "videosite_scroll_y_v1";

function buildPagination(currentPage, totalPages) {
  if (totalPages <= 1) return [1];

  // Nếu tổng số trang <= 6 thì hiện đủ 1..totalPages
  if (totalPages <= 6) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages = new Set();

  // Luôn giữ trang đầu và trang hiện tại +- 1 (hoặc 1..4 nếu đang ở đầu)
  pages.add(1);
  const startNear = Math.max(1, currentPage - 1);
  const endNear = Math.min(
    totalPages,
    currentPage <= 2 ? 4 : currentPage + 1
  );
  for (let p = startNear; p <= endNear; p++) {
    pages.add(p);
  }

  // Chỉ thêm tối đa 2 mốc nhảy chẵn chục nếu tổng số trang lớn (> 20)
  if (totalPages > 20) {
    const baseTen = Math.floor(currentPage / 10) * 10;
    for (let step = 1; step <= 2; step++) {
      const milestone = baseTen + step * 10;
      if (milestone > endNear + 1 && milestone < totalPages) {
        pages.add(milestone);
      }
    }
  } else {
    // Với các mục vừa phải (7 - 20 trang như Video thành viên), chỉ gắn thêm trang cuối
    pages.add(totalPages);
  }

  const sorted = [...pages].sort((a, b) => a - b);
  const result = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) {
      result.push("...");
    }
    result.push(sorted[i]);
  }
  if (sorted[sorted.length - 1] < totalPages) {
    result.push("...");
  }
  return result;
}

// Đọc trạng thái đang duyệt từ URL hoặc sessionStorage
function getInitialBrowseState() {
  if (typeof window === "undefined") {
    return { category: "all", page: 1, sortBy: "latest", q: "" };
  }
  try {
    const sp = new URLSearchParams(window.location.search);
    const hasUrlParams =
      sp.has("page") || sp.has("category") || sp.has("sort") || sp.has("q");

    if (hasUrlParams) {
      return {
        category: sp.get("category") || "all",
        page: Math.max(1, parseInt(sp.get("page") || "1", 10) || 1),
        sortBy: sp.get("sort") || "latest",
        q: sp.get("q") || ""
      };
    }

    const saved = sessionStorage.getItem(STATE_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        category: parsed.category || "all",
        page: Math.max(1, parseInt(parsed.page || "1", 10) || 1),
        sortBy: parsed.sortBy || "latest",
        q: parsed.q || ""
      };
    }
  } catch (_) {}

  return { category: "all", page: 1, sortBy: "latest", q: "" };
}

export default function HomePage() {
  const [ready, setReady] = useState(false);
  const [category, setCategory] = useState("all");
  const [sortBy, setSortBy] = useState("latest");
  const [q, setQ] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);

  const [items, setItems] = useState([]);
  const [totalPages, setTotalPages] = useState(1);
  const [dynamicCats, setDynamicCats] = useState([]);
  const [sortOpen, setSortOpen] = useState(false);
  const [showMoreTags, setShowMoreTags] = useState(false);
  const [jumpPageInput, setJumpPageInput] = useState("");
  const [loading, setLoading] = useState(true);

  const sortDropdownRef = useRef(null);
  const shouldScrollTopRef = useRef(false);
  const pendingRestoreScrollRef = useRef(false);

  // 1. Khôi phục đúng Trang, Danh mục, Tìm kiếm khi vừa mở hoặc bấm Quay lại
  useEffect(() => {
    const init = getInitialBrowseState();
    setCategory(init.category);
    setPage(init.page);
    setSortBy(init.sortBy);
    setQ(init.q);
    setSearchInput(init.q);
    pendingRestoreScrollRef.current = true;
    setReady(true);

    // Lắng nghe nút Back / Forward của trình duyệt
    const handlePopState = () => {
      const st = getInitialBrowseState();
      setCategory(st.category);
      setPage(st.page);
      setSortBy(st.sortBy);
      setQ(st.q);
      setSearchInput(st.q);
      pendingRestoreScrollRef.current = true;
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // 2. Lưu vị trí cuộn chuột liên tục để khi bấm vào video rồi quay lại đứng đúng chỗ cũ
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onScroll = () => {
      if (!loading && window.scrollY > 0) {
        try {
          sessionStorage.setItem(SCROLL_STORAGE_KEY, String(window.scrollY));
        } catch (_) {}
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [loading]);

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

  // 3. Đồng bộ trạng thái vào URL & sessionStorage + Tải danh sách video (có Cache tức thì)
  useEffect(() => {
    if (!ready) return;
    let isMounted = true;

    const savedSource = typeof getSource === "function" ? getSource() : "";
    const stateObj = { category, page, sortBy, q, domain: savedSource };
    const cacheKey = JSON.stringify(stateObj);

    // Cập nhật thanh địa chỉ URL và sessionStorage để giữ nguyên trang khi F5 hoặc Back
    try {
      sessionStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(stateObj));
      const urlParams = new URLSearchParams();
      if (category && category !== "all") urlParams.set("category", category);
      if (page > 1) urlParams.set("page", String(page));
      if (sortBy && sortBy !== "latest") urlParams.set("sort", sortBy);
      if (q) urlParams.set("q", q);

      const newQuery = urlParams.toString();
      const targetUrl = newQuery ? `/?${newQuery}` : "/";
      if (window.location.pathname + window.location.search !== targetUrl) {
        window.history.replaceState(null, "", targetUrl);
      }
    } catch (_) {}

    async function loadList() {
      // Kiểm tra nếu vừa bấm Quay lại và trang này đã có trong Cache -> Hiển thị tức thì không cần xoay tải lại
      try {
        const rawCache = sessionStorage.getItem(CACHE_STORAGE_KEY);
        if (rawCache) {
          const parsedCache = JSON.parse(rawCache);
          if (
            parsedCache.key === cacheKey &&
            Array.isArray(parsedCache.items) &&
            parsedCache.items.length > 0 &&
            Date.now() - (parsedCache.ts || 0) < 10 * 60 * 1000
          ) {
            setItems(parsedCache.items);
            setTotalPages(parsedCache.totalPages || 1);
            if (Array.isArray(parsedCache.categories)) {
              setDynamicCats(parsedCache.categories);
            }
            setLoading(false);

            if (pendingRestoreScrollRef.current) {
              pendingRestoreScrollRef.current = false;
              const savedY = parseInt(
                sessionStorage.getItem(SCROLL_STORAGE_KEY) || "0",
                10
              );
              if (savedY > 0) {
                setTimeout(() => {
                  window.scrollTo({ top: savedY, behavior: "instant" });
                }, 30);
              }
            }
            return;
          }
        }
      } catch (_) {}

      setLoading(true);
      if (shouldScrollTopRef.current) {
        shouldScrollTopRef.current = false;
        window.scrollTo({ top: 0, behavior: "smooth" });
      }

      try {
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

        const loadedItems = Array.isArray(data?.items) ? data.items : [];
        const loadedTotalPages = Math.max(1, Number(data?.totalPages) || 1);
        const loadedCats = Array.isArray(data?.categories)
          ? data.categories
          : [];

        setItems(loadedItems);
        setTotalPages(loadedTotalPages);
        if (loadedCats.length > 0) {
          setDynamicCats(loadedCats);
        }

        // Lưu kết quả vào sessionStorage để khi bấm Quay lại từ trang xem video hiện ra ngay lập tức
        if (loadedItems.length > 0) {
          try {
            sessionStorage.setItem(
              CACHE_STORAGE_KEY,
              JSON.stringify({
                key: cacheKey,
                items: loadedItems,
                totalPages: loadedTotalPages,
                categories: loadedCats,
                ts: Date.now()
              })
            );
          } catch (_) {}
        }
      } catch (_) {
        if (isMounted) setItems([]);
      } finally {
        if (isMounted) {
          setLoading(false);
          if (pendingRestoreScrollRef.current) {
            pendingRestoreScrollRef.current = false;
            const savedY = parseInt(
              sessionStorage.getItem(SCROLL_STORAGE_KEY) || "0",
              10
            );
            if (savedY > 0) {
              setTimeout(() => {
                window.scrollTo({ top: savedY, behavior: "instant" });
              }, 50);
            }
          }
        }
      }
    }

    loadList();
    return () => {
      isMounted = false;
    };
  }, [ready, category, q, page, sortBy]);

  const changePage = (newPage) => {
    const target = Math.max(1, Math.min(totalPages, Number(newPage) || 1));
    if (target === page) return;
    shouldScrollTopRef.current = true;
    pendingRestoreScrollRef.current = false;
    try {
      sessionStorage.setItem(SCROLL_STORAGE_KEY, "0");
    } catch (_) {}
    setPage(target);
  };

  const handleSelectCategory = (slug) => {
    shouldScrollTopRef.current = true;
    pendingRestoreScrollRef.current = false;
    try {
      sessionStorage.setItem(SCROLL_STORAGE_KEY, "0");
    } catch (_) {}
    setCategory(slug);
    setQ("");
    setSearchInput("");
    setPage(1);
    setShowMoreTags(false);
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    shouldScrollTopRef.current = true;
    pendingRestoreScrollRef.current = false;
    try {
      sessionStorage.setItem(SCROLL_STORAGE_KEY, "0");
    } catch (_) {}
    setQ(searchInput.trim());
    setPage(1);
  };

  const handleJumpPage = (e) => {
    e.preventDefault();
    const target = parseInt(jumpPageInput, 10);
    if (!isNaN(target) && target >= 1 && target <= totalPages) {
      changePage(target);
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
      {/* Thanh điều hướng dính (Sticky) */}
      <div className="sticky top-0 z-20 border-b border-slate-800/80 bg-[#0f172a]/90 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-2.5 sm:py-3.5 space-y-2.5">
          {/* Ô tìm kiếm */}
          <form
            onSubmit={handleSearchSubmit}
            className="flex items-center max-w-lg mx-auto rounded-full border border-slate-700/80 bg-slate-900/90 px-3.5 py-1.5 focus-within:border-indigo-400/80 transition-all"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-4 h-4 text-slate-400 mr-2 shrink-0"
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
              className="w-full bg-transparent text-base sm:text-sm text-slate-100 placeholder-slate-400 outline-none"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput("");
                  if (q) {
                    shouldScrollTopRef.current = true;
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

          {/* Thanh danh mục vuốt ngang trên mobile */}
          <nav className="flex items-center sm:justify-center overflow-x-auto sm:flex-wrap gap-1.5 pb-1 sm:pb-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {MAIN_CATEGORIES.map((cat) => {
              const isActive = !q && category === cat.slug;
              return (
                <button
                  key={cat.slug}
                  type="button"
                  onClick={() => handleSelectCategory(cat.slug)}
                  className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs sm:text-[13px] font-medium transition-all flex items-center gap-1.5 ${
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
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                showMoreTags
                  ? "bg-indigo-500/20 border-indigo-500/40 text-indigo-300"
                  : "bg-slate-800/60 border-slate-700/40 text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              •••
            </button>
          </nav>

          {showMoreTags && (
            <div className="pt-2 pb-1 border-t border-slate-800/80 flex flex-wrap items-center justify-center gap-1.5 max-h-40 overflow-y-auto">
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

      {/* Khu vực danh sách Video */}
      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
        <div className="mb-4 sm:mb-6 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="inline-block w-1.5 h-5 rounded-full bg-indigo-400 shrink-0" />
            <h2 className="text-sm sm:text-lg font-semibold text-slate-100 truncate">
              {q
                ? `Tìm kiếm: "${q}"`
                : MAIN_CATEGORIES.find((c) => c.slug === category)?.name ||
                  mergedExtraTags.find((t) => t.slug === category)?.name ||
                  category.replace(/^tag\/|^category\//, "#")}
            </h2>
            <span className="text-[11px] sm:text-xs text-slate-400 shrink-0">
              (Trang {page}/{totalPages})
            </span>
          </div>

          {/* Menu Sắp xếp theo */}
          <div className="relative shrink-0" ref={sortDropdownRef}>
            <button
              type="button"
              onClick={() => setSortOpen(!sortOpen)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-800/70 hover:bg-slate-800 border border-slate-700/60 px-2.5 sm:px-3.5 py-1.5 sm:py-2 text-xs text-slate-300 transition"
            >
              <span className="text-slate-400 hidden sm:inline">
                Sắp xếp theo
              </span>
              <span className="font-semibold text-white">
                {currentSortLabel}
              </span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${
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
              <div className="absolute right-0 mt-1.5 w-40 rounded-xl bg-[#1e293b] border border-slate-700/80 py-1.5 shadow-xl shadow-black/40 z-30">
                {SORT_OPTIONS.map((opt) => {
                  const active = sortBy === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        shouldScrollTopRef.current = true;
                        setSortBy(opt.id);
                        setSortOpen(false);
                        setPage(1);
                      }}
                      className={`w-full text-left px-3.5 py-2 text-xs sm:text-sm transition-colors flex items-center justify-between ${
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

        {/* Lưới Video */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="rounded-2xl bg-slate-800/35 border border-slate-800/70 overflow-hidden animate-pulse"
              >
                <div className="aspect-video w-full bg-slate-800/70" />
                <div className="p-2.5 sm:p-3.5 space-y-2">
                  <div className="h-3 bg-slate-800 rounded w-11/12" />
                  <div className="h-3 bg-slate-800 rounded w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-10 text-center space-y-3">
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
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
            {items.map((item, idx) => (
              <VideoCard key={item.slug || item.id || idx} video={item} />
            ))}
          </div>
        )}

        {/* Thanh phân trang */}
        {!loading && items.length > 0 && totalPages > 1 && (
          <div className="mt-10 pt-6 border-t border-slate-800/80 flex flex-col items-center gap-4">
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              <span className="px-2.5 py-1.5 rounded-lg bg-slate-800/70 border border-slate-700/60 text-xs font-medium text-slate-300">
                Page {page.toLocaleString("en-US")} of{" "}
                {totalPages.toLocaleString("en-US")}
              </span>

              {page > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => changePage(1)}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 text-xs font-medium text-slate-200 transition"
                  >
                    « First
                  </button>
                  <button
                    type="button"
                    onClick={() => changePage(page - 1)}
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
                    className="px-1.5 py-1.5 text-xs text-slate-500 select-none"
                  >
                    ...
                  </span>
                ) : (
                  <button
                    key={tok}
                    type="button"
                    onClick={() => changePage(tok)}
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
                    onClick={() => changePage(page + 1)}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 text-xs font-medium text-slate-200 transition"
                  >
                    »
                  </button>
                  <button
                    type="button"
                    onClick={() => changePage(totalPages)}
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
                className="w-24 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-base sm:text-xs text-slate-100 outline-none focus:border-indigo-400"
              />
              <button
                type="submit"
                className="rounded-lg bg-slate-800 hover:bg-indigo-500 px-3.5 py-1.5 sm:py-1 text-xs font-medium text-slate-200 hover:text-white transition"
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
