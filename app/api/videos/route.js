import { NextResponse } from "next/server";
import data from "@/data/videos.json";
import { siteConfig } from "@/config/site";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

const DEFAULT_DOMAIN = process.env.SOURCE_DOMAIN || siteConfig?.sourceDomain || "https://viet69.be";

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept":
    "text/html,application/xhtml+xml,application/xml,application/json;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7"
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS });
}

function cleanText(str = "") {
  return str
    .replace(/<[^>]+>/g, "")
    .replace(/&#8211;/g, "–")
    .replace(/&#8212;/g, "—")
    .replace(/&#8216;|&#8217;/g, "'")
    .replace(/&#8220;|&#8221;|&quot;/g, '"')
    .replace(/&#038;|&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

// Bóc tách nâng cao: Quét toàn bộ link .m3u8, .mp4, thẻ iframe, video tag và các thuộc tính ẩn chứa link video
advancedExtract: 
function extractMedia(html = "") {
  const unescaped = html.replace(/\\\//g, "/");
  const streams = new Set();
  const iframes = new Set();

  // 1. Quét các thuộc tính chứa link video trực tiếp (data-url, data-src, src trong thẻ video/source)
  const attrRegex = /(?:data-url|data-src|src)=["'](https?:\/\/[^"']+\.(?:m3u8|mp4|mov|webm)[^"']*)["']/gi;
  let match;
  while ((match = attrRegex.exec(unescaped)) !== null) {
    streams.add(match[1]);
  }

  // 2. Giải mã chuỗi Base64 bắt đầu bằng aHR0c (http)
  const b64Regex = /(aHR0c[A-Za-z0-9+/=]{12,})/g;
  let b64Match;
  while ((b64Match = b64Regex.exec(unescaped)) !== null) {
    try {
      const decoded = Buffer.from(b64Match[1], "base64").toString("utf-8").split(/['"\s<>]/)[0];
      if (decoded.startsWith("http")) {
        if (decoded.includes(".m3u8") || decoded.includes(".mp4")) {
          streams.add(decoded);
        } else if (decoded.includes("embed") || decoded.includes("player") || decoded.includes("iframe")) {
          iframes.add(decoded);
        }
      }
    } catch (_) {}
  }

  // 3. Quét link trực tiếp .m3u8 / .mp4 trong toàn bộ mã nguồn
  (unescaped.match(/https?:\/\/[^\s"'<>\\]+?\.m3u8[^\s"'<>\\]*/gi) || []).forEach((u) => streams.add(u));
  (unescaped.match(/https?:\/\/[^\s"'<>\\]+?\.mp4[^\s"'<>\\]*/gi) || []).forEach((u) => streams.add(u));

  // 4. Quét tất cả các thẻ iframe hoặc embed player
  const iframeRegex = /<iframe[^>]+(?:data-litespeed-src|data-lazy-src|data-src|src)=["']([^"']+)["']/gi;
  while ((match = iframeRegex.exec(unescaped)) !== null) {
    let src = match[1].trim();
    if (src.startsWith("//")) src = `https:${src}`;
    if (
      src.startsWith("http") &&
      !src.includes("googletagmanager") &&
      !src.includes("facebook.com") &&
      !src.includes("google.com")
    ) {
      iframes.push ? iframes.add(src) : null;
    }
  }

  return {
    streams: [...streams],
    iframes: [...iframes]
  };
}

export async function GET(req) {
  const sp = req.nextUrl.searchParams;
  const slug = sp.get("slug");
  const category = sp.get("category") || "all";
  const q = (sp.get("q") || "").trim();
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
  const per = siteConfig?.perPage || 12;

  if (category === "demo") {
    if (slug) {
      const v = data.find((x) => x.slug === slug);
      return NextResponse.json(v || { error: "not_found" }, { status: v ? 200 : 404, headers: CORS });
    }
    const filtered = data.filter((v) => !q || v.title.toLowerCase().includes(q.toLowerCase()));
    const totalPages = Math.max(1, Math.ceil(filtered.length / per));
    const items = filtered.slice((page - 1) * per, page * per);
    return NextResponse.json({ items, page, totalPages, total: filtered.length }, { headers: CORS });
  }

  const rawDomain = (sp.get("domain") || DEFAULT_DOMAIN).trim();
  const baseDomain = (rawDomain.startsWith("http") ? rawDomain : `https://${rawDomain}`).replace(/\/+$/, "");
  const reqHeaders = { ...BROWSER_HEADERS, Referer: `${baseDomain}/` };

  // =================================================================
  // TRƯỜNG HỢP 1: LẤY CHI TIẾT VIDEO THEO SLUG (?slug=...)
  // =================================================================
  if (slug) {
    const localVideo = data.find((x) => x.slug === slug);
    if (localVideo) {
      return NextResponse.json(localVideo, { status: 200, headers: CORS });
    }

    try {
      const cleanSlug = slug.replace(/^\/+|\/+$/g, "");
      let title = cleanSlug;
      let thumbnail = "";
      const allStreams = [];
      const allIframes = [];

      // Lấy qua WordPress REST API
      try {
        const wpRes = await fetch(
          `${baseDomain}/wp-json/wp/v2/posts?slug=${encodeURIComponent(cleanSlug)}&_embed`,
          { headers: reqHeaders, cache: "no-store" }
        );
        if (wpRes.ok) {
          const posts = await wpRes.json();
          if (Array.isArray(posts) && posts.length > 0) {
            const p = posts[0];
            title = cleanText(p.title?.rendered || cleanSlug);
            thumbnail = p._embedded?.["wp:featuredmedia"]?.[0]?.source_url || "";
            const media = extractMedia(p.content?.rendered || "");
            allStreams.push(...media.streams);
            allIframes.push(...media.iframes);
          }
        }
      } catch (_) {}

      // Quét trực tiếp trang HTML chi tiết để bắt toàn bộ player nhúng bên ngoài
      try {
        const htmlRes = await fetch(`${baseDomain}/${cleanSlug}/`, {
          headers: reqHeaders,
          cache: "no-store"
        });
        if (htmlRes.ok) {
          const html = await htmlRes.text();
          const titleMatch =
            html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<title>([\s\S]*?)<\/title>/i);
          if (titleMatch && title === cleanSlug) {
            title = cleanText(titleMatch[1]);
          }
          const media = extractMedia(html);
          allStreams.push(...media.streams);
          allIframes.push(...media.iframes);
        }
      } catch (_) {}

      const streams = [...new Set(allStreams)];
      const iframes = [...new Set(allIframes)];
      const primaryUrl = streams[0] || iframes[0] || "";
      const primaryType = streams[0]
        ? streams[0].includes(".m3u8")
          ? "hls"
          : "mp4"
        : "iframe";

      return NextResponse.json(
        {
          id: cleanSlug,
          slug: cleanSlug,
          title,
          category: "movie",
          thumbnail: thumbnail || "https://placehold.co/600x340/18181b/e11d48?text=Video",
          url: primaryUrl,
          src: primaryUrl,
          videoUrl: streams[0] || primaryUrl,
          hlsUrl: streams.find((s) => s.includes(".m3u8")) || "",
          mp4Url: streams.find((s) => s.includes(".mp4")) || "",
          embedUrl: iframes[0] || "",
          iframe: iframes[0] || "",
          type: primaryType,
          videoType: primaryType,
          streams,
          iframes,
          sources: [
            ...streams.map((u, i) => ({
              label: `Direct #${i + 1}`,
              name: `Direct #${i + 1}`,
              url: u,
              src: u,
              type: u.includes(".m3u8") ? "hls" : "mp4"
            })),
            ...iframes.map((u, i) => ({
              label: `Server #${i + 1}`,
              name: `Server #${i + 1}`,
              url: u,
              src: u,
              type: "iframe"
            }))
          ]
        },
        { status: 200, headers: CORS }
      );
    } catch (err) {
      return NextResponse.json({ error: "not_found", message: err.message }, { status: 404, headers: CORS });
    }
  }

  // =================================================================
  // TRƯỜNG HỢP 2: LẤY DANH SÁCH VIDEO THEO TRANG
  // =================================================================
  try {
    const wpUrl = `${baseDomain}/wp-json/wp/v2/posts?_embed&page=${page}&per_page=${per}${
      q ? `&search=${encodeURIComponent(q)}` : ""
    }`;
    const wpRes = await fetch(wpUrl, { headers: reqHeaders, cache: "no-store" });

    if (wpRes.ok && (wpRes.headers.get("content-type") || "").includes("json")) {
      const posts = await wpRes.json();
      const totalPages = Math.max(1, parseInt(wpRes.headers.get("x-wp-totalpages") || "10", 10));
      const total = parseInt(wpRes.headers.get("x-wp-total") || String(posts.length * totalPages), 10);

      if (Array.isArray(posts) && posts.length > 0) {
        const items = posts.map((p) => {
          const contentHtml = p.content?.rendered || "";
          const imgMatch = contentHtml.match(
            /(?:data-src|data-original|src)=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/i
          );
          const thumb =
            p._embedded?.["wp:featuredmedia"]?.[0]?.source_url ||
            p.yoast_head_json?.og_image?.[0]?.url ||
            (imgMatch ? imgMatch[1] : "https://placehold.co/600x340/18181b/e11d48?text=Video");

          return {
            id: String(p.id),
            slug: p.slug,
            title: cleanText(p.title?.rendered || p.slug),
            category: category === "all" ? "movie" : category,
            thumbnail: thumb,
            thumb: thumb,
            poster: thumb,
            image: thumb
          };
        });

        return NextResponse.json({ items, page, totalPages, total }, { headers: CORS });
      }
    }

    const htmlUrl = q
      ? `${baseDomain}/?s=${encodeURIComponent(q)}`
      : page > 1
      ? `${baseDomain}/page/${page}/`
      : `${baseDomain}/`;

    const htmlRes = await fetch(htmlUrl, { headers: reqHeaders, cache: "no-store" });
    const html = await htmlRes.text();

    const items = [];
    const seen = new Set();
    const blockRegex =
      /<article[\s\S]*?<\/article>|<div[^>]+class=["'][^"']*(?:post|video-item|item|clip|entry)[^"']*["'][\s\S]*?<\/div>/gi;
    const blocks = html.match(blockRegex) || [];

    for (const block of blocks) {
      const linkMatch = block.match(/href=["'](https?:\/\/[^"']+)["']/i);
      if (!linkMatch) continue;

      const fullUrl = linkMatch[1];
      if (
        fullUrl.includes("/category/") ||
        fullUrl.includes("/tag/") ||
        fullUrl.includes("/page/") ||
        fullUrl.includes("/author/")
      ) {
        continue;
      }

      const itemSlug = fullUrl.replace(baseDomain, "").replace(/^\/+|\/+$/g, "");
      if (!itemSlug || seen.has(itemSlug)) continue;
      seen.add(itemSlug);

      const titleMatch =
        block.match(/title=["']([^"']+)["']/i) ||
        block.match(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/i) ||
        block.match(/alt=["']([^"']+)["']/i);

      const imgMatch = block.match(
        /(?:data-litespeed-src|data-lazy-src|data-original|data-src|src)=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/i
      );
      const thumb = imgMatch ? imgMatch[1] : "https://placehold.co/600x340/18181b/e11d48?text=Video";

      items.push({
        id: itemSlug,
        slug: itemSlug,
        title: titleMatch ? cleanText(titleMatch[1]) : itemSlug,
        category: category === "all" ? "movie" : category,
        thumbnail: thumb,
        thumb: thumb,
        poster: thumb,
        image: thumb
      });
    }

    if (items.length > 0) {
      return NextResponse.json(
        { items, page, totalPages: page + 5, total: items.length * 10 },
        { headers: CORS }
      );
    }
  } catch (_) {}

  const filtered = data.filter(
    (v) => (category === "all" || v.category === category) && (!q || v.title.toLowerCase().includes(q.toLowerCase()))
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / per));
  const items = filtered.slice((page - 1) * per, page * per);
  return NextResponse.json({ items, page, totalPages, total: filtered.length }, { headers: CORS });
}
