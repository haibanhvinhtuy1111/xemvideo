"use client";

import { useEffect, useRef, useState } from "react";
import VideoCard from "@/components/VideoCard";
import { getSource } from "@/config/site";

const MAIN_CATEGORIES = [
  { name: "Tất cả", slug: "all" },
  { name: "Phim QMH", slug: "qmh-movie", badge: "Hot" },
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
const CACHE_STORAGE_KEY = "videosite_list_cache_v6";
const SCROLL_STORAGE_KEY = "videosite_scroll_y_v1";

function buildPagination(currentPage, totalPages) {
  if (totalPages <= 1) return [1];

  if (totalPages <= 6) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages = new Set();
  pages.add(1);

  const startNear = Math.max(1, currentPage - 1);
  const endNear = Math.min(
    totalPages,
    currentPage <= 2 ? 4 : currentPage + 1
  );
  for (let p = startNear; p <= endNear; p++) {
    pages.add(p);
  }

  if (totalPages > 20) {
    const baseTen = Math.floor(currentPage / 10) * 10;
    for (let step = 1; step <= 2; step++) {
      const milestone = baseTen + step * 10;
      if (milestone > endNear + 1 && milestone < totalPages) {
        pages.add(milestone);
      }
    }
  } else {
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

// Hàm dự phòng gọi trực tiếp API qmhv3.top từ trình duyệt người dùng nếu IP Vercel bị chặn
async function fetchQmhClientSideFallback(page = 1, q = "") {
  const endpoints = [
    `https://qmhv3.top/api/videos?category=movie&page=${page}${q ? `&q=${encodeURIComponent(q)}` : ""}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://qmhv3.top/api/videos?category=movie&page=${page}`)}`
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;
      const json = await res.json();
      const rawList = Array.isArray(json?.items)
        ? json.items
        : Array.isArray(json?.data)
        ? json.data
        : [];
      if (rawList.length > 0) {
        const mapped = rawList.map((item) => {
          const rawSlug = String(item.slug || item.id || "").replace(
            /^\/+|\/+$/g,
            ""
          );
          const fullSlug = rawSlug.startsWith("qmh__")
            ? rawSlug
            : `qmh__${rawSlug}`;
          let thumb =
            item.thumbnail ||
            item.thumb ||
            item.poster ||
            item.image ||
            "https://placehold.co/600x340/1e293b/94a3b8?text=QMH";
          if (thumb.startsWith("/") && !thumb.startsWith("//")) {
            thumb = `https://qmhv3.top${thumb}`;
          }
          return {
            ...item,
            id: fullSlug,
            slug: fullSlug,
            category: "qmh-movie",
            thumbnail: thumb,
            thumb,
            poster: thumb,
            image: thumb
          };
        });
        return {
          items: mapped,
          totalPages: Math.max(1, Number(json?.totalPages) || page + 5)
        };
      }
    } catch (_) {}
  }
  return null;
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
  const [listDebug, setListDebug] = useState(null);
  const [sortOpen, setSortOpen] = useState(false);
  const [showMoreTags, setShowMoreTags] = useState(false);
  const [jumpPageInput, setJumpPageInput] = useState("");
  const [loading, setLoading] = useState(true);

  const sortDropdownRef = useRef(null);
  const shouldScrollTopRef = useRef(false);
  const pendingRestoreScrollRef = useRef(false);

  useEffect(() => {
    const init = getInitialBrowseState();
    setCategory(init.category);
    setPage(init.page);
    setSortBy(init.sortBy);
    setQ(init.q);
    setSearchInput(init.q);
    pendingRestoreScrollRef.current = true;
    setReady(true);

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
    if (!ready) return;
    let isMounted = true;

    const savedSource = typeof getSource === "function" ? getSource() : "";
    const stateObj = { category, page, sortBy, q, domain: savedSource };
    const cacheKey = JSON.stringify(stateObj);

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
      try {
        const rawCache = sessionStorage.getItem(CACHE_STORAGE_KEY);
        if (rawCache) {
          const parsedCache = JSON.parse(rawCache);
          if (
            parsedCache.key === cacheKey &&
            Array.isArray(parsedCache.items) &&
            parsedCache.items.length > 0 &&
            Date.now() - (parsedCache.ts || 0) < 5 * 60 * 1000
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
      setListDebug(null);
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

        let loadedItems = Array.isArray(data?.items) ? data.items : [];
        let loadedTotalPages = Math.max(1, Number(data?.totalPages) || 1);
        const loadedCats = Array.isArray(data?.categories)
          ? data.categories
          : [];

        if (data?._debug) {
          setListDebug(data._debug);
        }

        // Nếu đang ở tab Phim QMH mà server Vercel bị chặn trả về rỗng, thử gọi trực tiếp từ trình duyệt
        if (category === "qmh-movie" && loadedItems.length === 0) {
          const clientFallback = await fetchQmhClientSideFallback(page, q);
          if (clientFallback && clientFallback.items.length > 0) {
            loadedItems = clientFallback.items;
            loadedTotalPages = clientFallback.totalPages;
          }
        }

        setItems(loadedItems);
        setTotalPages(loadedTotalPages);
        if (loadedCats.length > 0) {
          setDynamicCats(loadedCats);
        }

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
      sessionStorage.removeItem(CACHE_STORAGE_KEY);
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
    <div className="min-h-screen bg-background text-textMain">
      {/* Thanh điều hướng dính (Sticky) */}
      <div className="sticky top-0 z-20 border-b border-border bg-surface/90 backdrop-blur-md">
        <div className="mx-auto max-w-6xl space-y-2.5 px-3 py-2.5 sm:px-4 sm:py-3.5">
          {/* Ô tìm kiếm */}
          <form
            onSubmit={handleSearchSubmit}
            className="mx-auto flex max-w-lg items-center rounded-full border border-border bg-sub px-3.5 py-1.5 transition-all focus-within:border-primary focus-within:ring-1 focus-within:ring-primary"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="mr-2 h-4 w-4 shrink-0 text-textSub"
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
              className="w-full bg-transparent text-base text-textMain placeholder:text-textSub outline-none sm:text-sm"
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
                className="px-2 text-xs text-textSub transition-colors hover:text-textMain"
              >
                ✕
              </button>
            )}
            <button
              type="submit"
              className="ml-1 shrink-0 rounded-full bg-primary-light px-3.5 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
            >
              Tìm
            </button>
          </form>

          {/* Thanh danh mục vuốt ngang trên mobile */}
          <nav className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:flex-wrap sm:justify-center sm:pb-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {MAIN_CATEGORIES.map((cat) => {
              const isActive = !q && category === cat.slug;
              return (
                <button
                  key={cat.slug}
                  type="button"
                  onClick={() => handleSelectCategory(cat.slug)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all sm:text-[13px] ${
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm shadow-primary/25"
                      : "border border-border bg-sub text-textMain hover:border-primary/40 hover:bg-surface"
                  }`}
                >
                  <span>{cat.name}</span>
                  {cat.badge && (
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${
                        isActive
                          ? "bg-black/20 text-primary-foreground"
                          : "bg-hot-bg text-hot"
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
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${
                showMoreTags
                  ? "border-primary/40 bg-primary-light text-primary"
                  : "border-border bg-sub text-textSub hover:bg-surface hover:text-textMain"
              }`}
            >
              •••
            </button>
          </nav>

          {showMoreTags && (
            <div className="flex max-h-40 flex-wrap items-center justify-center gap-1.5 overflow-y-auto border-t border-border pb-1 pt-2">
              {mergedExtraTags.map((tag) => {
                const isActive = !q && category === tag.slug;
                return (
                  <button
                    key={tag.slug}
                    type="button"
                    onClick={() => handleSelectCategory(tag.slug)}
                    className={`rounded-full px-2.5 py-1 text-xs transition ${
                      isActive
                        ? "bg-primary font-medium text-primary-foreground"
                        : "border border-border bg-sub text-textSub hover:bg-surface hover:text-textMain"
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
      <div className="mx-auto max-w-6xl px-3 py-4 sm:px-4 sm:py-6">
        <div className="mb-4 flex items-center justify-between gap-2 sm:mb-6">
          <div className="flex min-w-0 items-center gap-2">
            <span className="inline-block h-5 w-1.5 shrink-0 rounded-full bg-primary" />
            <h2 className="truncate text-sm font-semibold text-textMain sm:text-lg">
              {q
                ? `Tìm kiếm: "${q}"`
                : MAIN_CATEGORIES.find((c) => c.slug === category)?.name ||
                  mergedExtraTags.find((t) => t.slug === category)?.name ||
                  category.replace(/^tag\/|^category\//, "#")}
            </h2>
            <span className="shrink-0 text-[11px] text-textSub sm:text-xs">
              (Trang {page}/{totalPages})
            </span>
          </div>

          {/* Menu Sắp xếp theo */}
          <div className="relative shrink-0" ref={sortDropdownRef}>
            <button
              type="button"
              onClick={() => setSortOpen(!sortOpen)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-2.5 py-1.5 text-xs text-textSub transition hover:bg-sub sm:px-3.5 sm:py-2"
            >
              <span className="hidden text-textSub sm:inline">
                Sắp xếp theo
              </span>
              <span className="font-semibold text-textMain">
                {currentSortLabel}
              </span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className={`h-3.5 w-3.5 text-textSub transition-transform duration-200 ${
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
              <div className="absolute right-0 z-30 mt-1.5 w-40 rounded-xl border border-border bg-surface py-1.5 shadow-xl">
                {SORT_OPTIONS.map((opt) => {
                  const active = sortBy === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        shouldScrollTopRef.current = true;
                        try {
                          sessionStorage.removeItem(CACHE_STORAGE_KEY);
                        } catch (_) {}
                        setSortBy(opt.id);
                        setSortOpen(false);
                        setPage(1);
                      }}
                      className={`flex w-full items-center justify-between px-3.5 py-2 text-left text-xs transition-colors sm:text-sm ${
                        active
                          ? "bg-primary-light font-semibold text-primary"
                          : "text-textMain hover:bg-sub"
                      }`}
                    >
                      <span>{opt.label}</span>
                      {active && (
                        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse overflow-hidden rounded-2xl border border-border bg-surface"
              >
                <div className="aspect-video w-full bg-sub" />
                <div className="space-y-2 p-2.5 sm:p-3.5">
                  <div className="h-3 w-11/12 rounded bg-sub" />
                  <div className="h-3 w-2/3 rounded bg-sub" />
                </div>
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="space-y-3 rounded-2xl border border-border bg-surface p-10 text-center shadow-sm">
            <p className="text-sm text-textSub">
              Không tìm thấy video nào trong mục này.
            </p>
            <button
              type="button"
              onClick={() => handleSelectCategory("all")}
              className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary-hover"
            >
              Về trang tất cả
            </button>
            {listDebug && (
              <pre className="mt-4 max-h-48 overflow-auto rounded-lg bg-black/50 p-3 text-left font-mono text-[11px] text-slate-400 whitespace-pre-wrap">
                {JSON.stringify(listDebug, null, 2)}
              </pre>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
            {items.map((item, idx) => (
              <VideoCard key={item.slug || item.id || idx} video={item} />
            ))}
          </div>
        )}

        {/* Thanh phân trang rút gọn chuẩn */}
        {!loading && items.length > 0 && totalPages > 1 && (
          <div className="mt-10 flex flex-col items-center gap-4 border-t border-border pt-6">
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              <span className="rounded-lg border border-border bg-sub px-2.5 py-1.5 text-xs font-medium text-textSub">
                Page {page.toLocaleString("en-US")} of{" "}
                {totalPages.toLocaleString("en-US")}
              </span>

              {page > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => changePage(1)}
                    className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-textMain transition hover:bg-sub"
                  >
                    « First
                  </button>
                  <button
                    type="button"
                    onClick={() => changePage(page - 1)}
                    className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-textMain transition hover:bg-sub"
                  >
                    «
                  </button>
                </>
              )}

              {pageTokens.map((tok, idx) =>
                tok === "..." ? (
                  <span
                    key={`dots-${idx}`}
                    className="select-none px-1.5 py-1.5 text-xs text-textSub"
                  >
                    ...
                  </span>
                ) : (
                  <button
                    key={tok}
                    type="button"
                    onClick={() => changePage(tok)}
                    className={`min-w-[34px] rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                      page === tok
                        ? "border-primary bg-primary text-primary-foreground shadow-sm shadow-primary/25"
                        : "border-border bg-surface text-textMain hover:bg-sub"
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
                    className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-textMain transition hover:bg-sub"
                  >
                    »
                  </button>
                  <button
                    type="button"
                    onClick={() => changePage(totalPages)}
                    className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-textMain transition hover:bg-sub"
                  >
                    Last »
                  </button>
                </>
              )}
            </div>

            <form
              onSubmit={handleJumpPage}
              className="flex items-center gap-2 text-xs text-textSub"
            >
              <span>Đi tới trang:</span>
              <input
                type="number"
                min={1}
                max={totalPages}
                value={jumpPageInput}
                onChange={(e) => setJumpPageInput(e.target.value)}
                placeholder={`1 - ${totalPages}`}
                className="w-24 rounded-lg border border-border bg-sub px-2.5 py-1 text-base text-textMain placeholder:text-textSub outline-none focus:border-primary sm:text-xs"
              />
              <button
                type="submit"
                className="rounded-lg border border-border bg-surface px-3.5 py-1.5 text-xs font-medium text-textMain transition hover:border-primary hover:bg-primary hover:text-primary-foreground sm:py-1"
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
