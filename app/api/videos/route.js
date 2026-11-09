import { NextResponse } from "next/server";
import data from "@/data/videos.json";
import { siteConfig } from "@/config/site";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

const DEFAULT_DOMAIN =
  process.env.SOURCE_DOMAIN || siteConfig?.sourceDomain || "https://viet69.be";

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml,application/json;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7"
};

const FALLBACK_THUMB = "https://placehold.co/600x340/18181b/e11d48?text=Video";

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

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      cache: "no-store"
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchHtmlWithFallback(targetUrl, headers) {
  try {
    const res = await fetchWithTimeout(targetUrl, { headers }, 7000);
    if (res.ok) {
      const text = await res.text();
      if (text && text.length > 500 && !text.includes("Just a moment...")) {
        return text;
      }
    }
  } catch (_) {}

  const proxies = [
    (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
    (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`
  ];

  for (const buildProxy of proxies) {
    try {
      const res = await fetchWithTimeout(buildProxy(targetUrl), {}, 8000);
      if (res.ok) {
        const text = await res.text();
        if (text && text.length > 500) return text;
      }
    } catch (_) {}
  }
  return "";
}

// Bóc tách nút video2-btn của Viet69
function extractViet69Servers(html = "") {
  const servers = [];
  const btnRegex =
    /<button[^>]*class=["'][^"']*video2-btn[^"']*["'][^>]*>([\s\S]*?)<\/button>/gi;
  let m;
  while ((m = btnRegex.exec(html)) !== null) {
    const tag = m[0];
    const label = cleanText(m[1]) || `Server #${servers.length + 1}`;
    const typeMatch = tag.match(/\bdata-type=["']([^"']+)["']/i);
    const videoMatch = tag.match(/\bdata-video=["']([^"']+)["']/i);
    if (videoMatch && videoMatch[1]) {
      servers.push({
        label,
        dataType: typeMatch ? typeMatch[1].trim() : "1",
        dataVideo: videoMatch[1].trim()
      });
    }
  }
  return servers;
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
      return NextResponse.json(v || { error: "not_found" }, {
        status: v ? 200 : 404,
        headers: CORS
      });
    }
    const filtered = data.filter(
      (v) => !q || v.title.toLowerCase().includes(q.toLowerCase())
    );
    const totalPages = Math.max(1, Math.ceil(filtered.length / per));
    const items = filtered.slice((page - 1) * per, page * per);
    return NextResponse.json(
      { items, page, totalPages, total: filtered.length },
      { headers: CORS }
    );
  }

  const rawDomain = (sp.get("domain") || DEFAULT_DOMAIN).trim();
  const baseDomain = (
    rawDomain.startsWith("http`") ? rawDomain : `https://${rawDomain}`
  ).replace(/\/+$/, "");
  const reqHeaders = { ...BROWSER_HEADERS, Referer: `${baseDomain}/` };

  if (slug) {
    const cleanSlug = slug.replace(/^\/+|\/+$/g, "");
    const localVideo = data.find(
      (x) => x.slug === cleanSlug || x.slug === slug
    );
    if (localVideo) {
      return NextResponse.json(localVideo, { status: 200, headers: CORS });
    }

    try {
      let title = cleanSlug;
      let thumbnail = "";
      const postLink = `${baseDomain}/${cleanSlug}/`;
      const allStreams = [];
      const allIframes = [];
      const customSources = [];

      const pageHtml = await fetchHtmlWithFallback(postLink, reqHeaders);
      if (pageHtml) {
        const titleMatch =
          pageHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) ||
          pageHtml.match(/<title>([\s\S]*?)<\/title>/i);
        if (titleMatch) {
          title = cleanText(titleMatch[1]).replace(/\s*[-|–]\s*Viet69.*$/i, "");
        }
        const ogImg = pageHtml.match(
          /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i
        );
        if (ogImg) thumbnail = ogImg[1];

        // Lấy danh sách các nút Server
        const servers = extractViet69Servers(pageHtml);

        // Gửi yêu cầu AJAX chuẩn của theme Viet69 tới admin-ajax.php để lấy iframe thật
        for (const srv of servers) {
          const ajaxActions = [
            "doo_player_ajax",
            "halim_ajax_player",
            "video2_ajax",
            "get_player"
          ];

          let resolved = false;
          for (const action of ajaxActions) {
            try {
              const body = new URLSearchParams({
                action: action,
                type: srv.dataType,
                video: srv.dataVideo
              }).toString();

              const ajaxRes = await fetchWithTimeout(
                `${baseDomain}/wp-admin/admin-ajax.php`,
                {
                  method: "POST",
                  headers: {
                    ...reqHeaders,
                    "Content-Type":
                      "application/x-www-form-urlencoded; charset=UTF-8",
                    "X-Requested-With": "XMLHttpRequest"
                  },
                  body
                },
                4000
              );

              if (ajaxRes.ok) {
                const text = (await ajaxRes.text()).trim();
                // Nếu kết quả trả về chứa thẻ iframe hoặc link nhúng
                if (text && text.length > 5 && text !== "0" && text !== "-1") {
                  const urlMatch =
                    text.match(/src=["'](https?:\/\/[^"']+)["']/i) ||
                    text.match(/(https?:\/\/[^\s"'<>]+)/i);
                  const iframeUrl = urlMatch ? urlMatch[1] : "";
                  if (iframeUrl && !iframeUrl.includes("admin-ajax.php")) {
                    resolved = true;
                    allIframes.push(iframeUrl);
                    customSources.push({
                      label: srv.label,
                      name: srv.label,
                      url: iframeUrl,
                      src: iframeUrl,
                      type: "iframe"
                    });
                    break;
                  }
                }
              }
            } catch (_) {}
          }

          // Nếu AJAX không bắt được, thử dựng link nhúng mặc định theo cấu trúc phổ biến của Viet69
          if (!resolved) {
            const fallbackEmbed = `https://emb.cd-vs.com/embed/${srv.dataVideo}`;
            allIframes.push(fallbackEmbed);
            customSources.push({
              label: srv.label,
              name: srv.label,
              url: fallbackEmbed,
              src: fallbackEmbed,
              type: "iframe"
            });
          }
        }
      }

      const streams = [...new Set(allStreams)];
      const iframes = [...new Set(allIframes)];
      const primaryUrl = streams[0] || iframes[0] || "";
      const primaryType = streams[0] ? "hls" : "iframe";

      const finalSources =
        customSources.length > 0
          ? customSources
          : [
              ...iframes.map((u, i) => ({
                label: `Server #${i + 1}`,
                name: `Server #${i + 1}`,
                url: u,
                src: u,
                type: "iframe"
              }))
            ];

      return NextResponse.json(
        {
          id: cleanSlug,
          slug: cleanSlug,
          title,
          category: "movie",
          thumbnail: thumbnail || FALLBACK_THUMB,
          postLink,
          url: primaryUrl,
          src: primaryUrl,
          videoUrl: primaryUrl,
          embedUrl: iframes[0] || "",
          iframe: iframes[0] || "",
          type: primaryType,
          videoType: primaryType,
          streams,
          iframes,
          sources: finalSources
        },
        { status: 200, headers: CORS }
      );
    } catch (err) {
      return NextResponse.json(
        { error: "not_found", message: err.message },
        { status: 404, headers: CORS }
      );
    }
  }

  // DANH SÁCH VIDEO THEO TRANG
  try {
    const pagePath = page > 1 ? `/page/${page}/` : "/";
    const htmlUrl = q
      ? `${baseDomain}${pagePath}?s=${encodeURIComponent(q)}`
      : `${baseDomain}${pagePath}`;

    const html = await fetchHtmlWithFallback(htmlUrl, reqHeaders);
    if (html) {
      const items = [];
      const seen = new Set();
      const articleBlocks = html.match(/<article[\s\S]*?<\/article>/gi) || [];
      const blocks =
        articleBlocks.length > 0
          ? articleBlocks
          : html.split(
              /(?=<div[^>]+class=["'][^"']*(?:post-|video-item|clip-item|entry-item|item-video)[^"']*["'])/i
            );

      for (const block of blocks) {
        const linkMatch = block.match(
          /<a[^>]+href=["'](https?:\/\/[^"']+|\/[^"']+)["']/i
        );
        if (!linkMatch) continue;

        let parsedUrl;
        try {
          parsedUrl = new URL(linkMatch[1], baseDomain);
        } catch (_) {
          continue;
        }

        const pathname = parsedUrl.pathname;
        if (
          pathname.includes("/category/") ||
          pathname.includes("/tag/") ||
          pathname.includes("/page/") ||
          pathname.includes("/author/") ||
          pathname.includes("/wp-")
        ) {
          continue;
        }

        const itemSlug = pathname.replace(/^\/+|\/+$/g, "");
        if (!itemSlug || seen.has(itemSlug)) continue;
        seen.add(itemSlug);

        const titleMatch =
          block.match(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/i) ||
          block.match(/title=["']([^"']+)["']/i) ||
          block.match(/alt=["']([^"']+)["']/i);

        const imgMatch = block.match(
          /(?:data-litespeed-src|data-lazy-src|data-original|data-src|src)=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/i
        );
        const thumb = imgMatch ? imgMatch[1] : FALLBACK_THUMB;

        items.push({
          id: itemSlug,
          slug: itemSlug,
          title: titleMatch ? cleanText(titleMatch[1]) : itemSlug,
          category: category === "all" ? "movie" : category,
          thumbnail: thumb,
          thumb,
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
    }
  } catch (_) {}

  const filtered = data.filter(
    (v) =>
      (category === "all" || v.category === category) &&
      (!q || v.title.toLowerCase().includes(q.toLowerCase()))
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / per));
  const items = filtered.slice((page - 1) * per, page * per);
  return NextResponse.json(
    { items, page, totalPages, total: filtered.length },
    { headers: CORS }
  );
}
