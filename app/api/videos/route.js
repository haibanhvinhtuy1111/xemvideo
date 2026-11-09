import { NextResponse } from "next/server";
import data from "@/data/videos.json";
import { siteConfig } from "@/config/site";

const CORS = { "Access-Control-Allow-Origin": "*" };

// Thay `data` bằng database / nguồn riêng của bạn, giữ nguyên định dạng trả về.
export async function GET(req) {
  const sp = req.nextUrl.searchParams;
  const slug = sp.get("slug");
  if (slug) {
    const v = data.find((x) => x.slug === slug);
    return NextResponse.json(v || { error: "not_found" }, { status: v ? 200 : 404, headers: CORS });
  }
  const category = sp.get("category") || "all";
  const q = (sp.get("q") || "").trim().toLowerCase();
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
  const filtered = data.filter(
    (v) => (category === "all" || v.category === category) && (!q || v.title.toLowerCase().includes(q))
  );
  const per = siteConfig.perPage;
  const totalPages = Math.max(1, Math.ceil(filtered.length / per));
  const items = filtered.slice((page - 1) * per, page * per);
  return NextResponse.json({ items, page, totalPages, total: filtered.length }, { headers: CORS });
}
