export const siteConfig = {
  name: "VideoSite",
  perPage: 12,
  storageKey: "video_source_domain",
  defaultSource: (process.env.NEXT_PUBLIC_SOURCE_DOMAIN || "").replace(/\/$/, ""),
  categories: [
    { value: "all", label: "Tất cả" },
    { value: "movie", label: "Phim" },
    { value: "clip", label: "Clip" },
    { value: "demo", label: "Demo" },
  ],
};

// Chỉ chạy ở client: ưu tiên giá trị lưu trong localStorage, sau đó tới biến môi trường.
export function getSource() {
  if (typeof window === "undefined") return siteConfig.defaultSource;
  try {
    const saved = localStorage.getItem(siteConfig.storageKey);
    if (saved !== null) return saved;
  } catch {}
  return siteConfig.defaultSource;
}

export function saveSource(value) {
  const v = (value || "").trim().replace(/\/$/, "");
  if (v && !/^https?:\/\//i.test(v)) throw new Error("Domain phải bắt đầu bằng http:// hoặc https://");
  localStorage.setItem(siteConfig.storageKey, v);
  return v;
}
