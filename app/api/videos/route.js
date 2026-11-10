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

const IGNORE_DOMAINS = [
  "googletagmanager.com",
  "googlesyndication.com",
  "google-analytics.com",
  "doubleclick.net",
  "facebook.com",
  "twitter.com",
  "schema.org",
  "w3.org",
  "wordpress.org",
  "gravatar.com",
  "cloudflare.com",
  "jsdelivr.net",
  "cdnjs.cloudflare.com",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "jquery.com"
];

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
  let status = 0;
  try {
    const res = await fetchWithTimeout(targetUrl, { headers }, 7000);
    status = res.status;
    if (res.ok) {
      const text = await res.text();
      if (text && text.length > 500 && !text.includes("Just a moment...")) {
        return { html: text, via: "direct", status };
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
        if (text && text.length > 500 && !text.includes("Just a moment...")) {
          return { html: text, via: "proxy", status: res.status };
        }
      }
    } catch (_) {}
  }

  return { html: "", via: "failed", status };
}

function decodeBase64Safe(str = "") {
  try {
    const cleaned = str.trim().replace(/\s+/g, "");
    const decoded = Buffer.from(cleaned, "base64").toString("utf-8").trim();
    if (decoded && !/[\x00-\x08\x0E-\x1F]/.test(decoded)) {
      return decoded;
    }
  } catch (_) {}
  return "";
}

function isStaticAsset(url = "") {
  const clean = url.split("?")[0].toLowerCase();
  if (
    clean.endsWith(".m3u8") ||
    clean.endsWith(".mp4") ||
    clean.endsWith(".webm") ||
    clean.endsWith(".mov")
  ) {
    return false;
  }
  return /\.(?:jpg|jpeg|png|webp|gif|svg|ico|css|js|woff2?|ttf|eot|xml)$/i.test(
    clean
  );
}

// Chặn các link bài viết/menu nội bộ của hệ thống viet69 để không bị nhúng nhầm trang 404
function isViet69PageLink(url = "", baseHost = "") {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    if (host === baseHost || host.includes("viet69")) {
      return !/(?:embed|player|ajax|\.m3u8|\.mp4)/i.test(u.pathname + u.search);
    }
  } catch (_) {}
  return false;
}

function normalizeUrl(raw = "", baseDomain = "", baseHost = "") {
  if (!raw) return "";
  let u = raw
    .trim()
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&")
    .replace(/^['"]+|['"]+$/g, "");
  if (u.startsWith("//")) u = `https:${u}`;
  else if (u.startsWith("/") && baseDomain) u = `${baseDomain}${u}`;
  if (!/^https?:\/\//i.test(u)) return "";
  if (
    u.includes("about:blank") ||
    u.startsWith("javascript:") ||
    u.startsWith("data:")
  ) {
    return "";
  }
  const lower = u.toLowerCase();
  if (IGNORE_DOMAINS.some((d) => lower.includes(d))) return "";
  if (isStaticAsset(u) || isViet69PageLink(u, baseHost)) return "";
  return u;
}

// Bóc tách danh sách các nút <button class="video2-btn" data-type="..." data-video="...">
function extractViet69Buttons(html = "") {
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
      const rawVideo = videoMatch[1].trim();
      const decodedVideo = decodeBase64Safe(rawVideo) || rawVideo;
      servers.push({
        label,
        dataType: typeMatch ? typeMatch[1].trim() : "",
        rawVideo,
        decodedVideo
      });
    }
  }
  return servers;
}

// Quét toàn bộ script (kể cả LiteSpeed Base64 và file .js ngoài) để tìm hàm xử lý video2-btn
async function findVideo2Script(html = "", baseDomain = "", reqHeaders = {}) {
  const inlineChunks = [];
  const externalUrls = [];

  const scriptTagRegex = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = scriptTagRegex.exec(html)) !== null) {
    const attrs = m[1] || "";
    const body = m[2] || "";

    // Kiểm tra script mã hóa Base64 của LiteSpeed (data:text/javascript;base64,...)
    const b64SrcMatch = attrs.match(
      /(?:data-src|src)\s*=\s*["']data:text\/javascript;base64,([^"']+)["']/i
    );
    if (b64SrcMatch && b64SrcMatch[1]) {
      const decodedJs = decodeBase64Safe(b64SrcMatch[1]);
      if (decodedJs) inlineChunks.push(decodedJs);
      continue;
    }

    // Kiểm tra script file .js bên ngoài
    const srcMatch = attrs.match(/(?:data-src|src)\s*=\s*["']([^"']+)["']/i);
    if (srcMatch && srcMatch[1]) {
      let sUrl = srcMatch[1].trim();
      if (sUrl.startsWith("//")) sUrl = `https:${sUrl}`;
      else if (sUrl.startsWith("/")) sUrl = `${baseDomain}${sUrl}`;
      if (
        sUrl.startsWith("http") &&
        !IGNORE_DOMAINS.some((d) => sUrl.includes(d)) &&
        !sUrl.includes("jquery.min.js")
      ) {
        externalUrls.push(sUrl);
      }
    }

    if (body.trim()) {
      inlineChunks.push(body);
    }
  }

  for (const chunk of inlineChunks) {
    if (chunk.includes("video2-btn") || chunk.includes("data-video")) {
      return chunk;
    }
  }

  // Tải song song tối đa 6 file JS của theme/LiteSpeed để tìm đoạn xử lý video2-btn
  const results = await Promise.allSettled(
    externalUrls.slice(0, 6).map(async (u) => {
      const r = await fetchWithTimeout(u, { headers: reqHeaders }, 4500);
      return r.ok ? await r.text() : "";
    })
  );

  for (const res of results) {
    if (
      res.status === "fulfilled" &&
      res.value &&
      (res.value.includes("video2-btn") || res.value.includes("data-video"))
    ) {
      return res.value;
    }
  }

  return "";
}

// Giải mã URL nhúng từ script xử lý video2-btn theo từng data-type
function buildUrlFromHandlerJs(jsText = "", dataType = "", decodedVideo = "", rawVideo = "") {
  if (!jsText) return "";
  const cleanJs = jsText.replace(/\\\//g, "/");

  // 1. Tìm nhánh điều kiện khớp với dataType (ví dụ: type == 25, case 25:, case "25":)
  const escapedType = dataType.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const branchPatterns = [
    new RegExp(
      `(?:case\\s*["']?${escapedType}["']?\\s*:|type\\s*===?\\s*["']?${escapedType}["']?)[\\s\\S]{0,450}`,
      "i"
    ),
    new RegExp(
      `["']?${escapedType}["']?\\s*:\\s*["'](https?:\\/\\/[^"']+)["']`,
      "i"
    )
  ];

  for (const pat of branchPatterns) {
    const bm = cleanJs.match(pat);
    if (bm) {
      const block = bm[0];
      // Tách tiền tố URL (https://...) và hậu tố (nếu có) trong nhánh này
      const urlMatch = block.match(/["'`](https?:\/\/[^"'`\s+$]+)["'`]/i);
      if (urlMatch && urlMatch[1]) {
        const prefix = urlMatch[1];
        const usesRaw = !/atob|base64/i.test(cleanJs);
        const token = usesRaw ? rawVideo : decodedVideo;
        // Kiểm tra xem sau biến có nối thêm đuôi (như .m3u8, .html, /embed) không
        const afterPrefix = block.slice(block.indexOf(prefix) + prefix.length);
        const suffixMatch = afterPrefix.match(/\+\s*["'`](\/[^"'`<>\s]+|\.m3u8[^"'`<>\s]*|\.html[^"'`<>\s]*)["'`]/i);
        const suffix = suffixMatch ? suffixMatch[1] : "";
        return `${prefix}${token}${suffix}`;
      }
    }
  }

  // 2. Nếu trong hàm xử lý video2-btn chỉ có 1 mẫu URL nhúng chung
  const idx = cleanJs.indexOf("video2-btn");
  const windowJs =
    idx !== -1
      ? cleanJs.slice(Math.max(0, idx - 600), idx + 1500)
      : cleanJs.slice(0, 2000);

  const genericUrlMatch = windowJs.match(
    /["'`](https?:\/\/(?![^"'`]*viet69)[^"'`\s+$]+\/(?:embed|e|v|play|player|watch)\/?)["'`]/i
  );
  if (genericUrlMatch && genericUrlMatch[1]) {
    const prefix = genericUrlMatch[1].replace(/\/+$/, "");
    return `${prefix}/${decodedVideo}`;
  }

  return "";
}

function extractMedia(html = "", baseDomain = "", baseHost = "") {
  if (!html) return { streams: [], iframes: [] };

  let buffer = html
    .replace(/\\\//g, "/")
    .replace(/\\u0026/gi, "&")
    .replace(/&amp;/g, "&");

  const streams = new Set();
  const iframes = new Set();

  const addCandidate = (rawUrl, isIframeTag = false) => {
    const u = normalizeUrl(rawUrl, baseDomain, baseHost);
    if (!u) return;
    const lower = u.toLowerCase();

    if (
      lower.includes(".m3u8") ||
      lower.includes(".mp4") ||
      lower.includes(".mov") ||
      lower.includes(".webm")
    ) {
      streams.add(u);
      return;
    }

    if (
      lower.includes("/wp-json/") ||
      lower.includes("/wp-admin/") ||
      lower.includes("/wp-login") ||
      lower.includes("/wp-content/") ||
      lower.includes("/wp-includes/")
    ) {
      return;
    }

    if (
      isIframeTag ||
      /(?:\/embed\/|\/e\/|\/v\/|\/play\/|\/player\/|player\.|embed\.|hydrax|abyss|dood|ok\.ru|helvid|vhstream|goostream|cd-vs)/i.test(
        lower
      )
    ) {
      iframes.add(u);
    }
  };

  const embedTags = buffer.match(/<(?:iframe|embed|source)\b[^>]*>/gi) || [];
  const attrs = [
    "data-litespeed-src",
    "data-lazy-src",
    "data-src",
    "data-url",
    "src"
  ];
  for (const tag of embedTags) {
    for (const attr of attrs) {
      const m = tag.match(
        new RegExp(`\\b${attr}\\s*=\\s*(?:["']([^"']+)["']|([^\\s>"']+))`, "i")
      );
      const val = m ? m[1] || m[2] : "";
      if (val) addCandidate(val, true);
    }
  }

  (
    buffer.match(
      /https?:\/\/[^\s"'<>\\]+?\.(?:m3u8|mp4)(?:\?[^\s"'<>\\]*)?/gi
    ) || []
  ).forEach((u) => addCandidate(u, false));

  return {
    streams: [...streams],
    iframes: [...iframes]
  };
}

function extractWpPostId(html = "") {
  const patterns = [
    /\bdata-pid=["'](\d+)["']/i,
    /\bpostid-(\d+)\b/i,
    /\bpost-(\d+)\b/i,
    /\bdata-post(?:-id)?=["']?(\d+)/i
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m && m[1]) return m[1];
  }
  return null;
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

  // Chuẩn hóa baseDomain an toàn, không bao giờ gây lỗi Invalid URL
  let baseDomain = (sp.get("domain") || DEFAULT_DOMAIN).trim();
  if (!/^https?:\/\//i.test(baseDomain)) {
    baseDomain = `https://${baseDomain}`;
  }
  baseDomain = baseDomain.replace(/\/+$/, "");

  let baseHost = "viet69.be";
  try {
    baseHost = new URL(baseDomain).hostname.replace(/^www\./, "").toLowerCase();
  } catch (_) {
    baseDomain = "https://viet69.be";
  }

  const reqHeaders = { ...BROWSER_HEADERS, Referer: `${baseDomain}/` };

  // =================================================================
  // TRƯỜNG HỢP 1: LẤY CHI TIẾT VIDEO THEO SLUG (?slug=...)
  // =================================================================
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
      let postId = null;
      const postLink = `${baseDomain}/${cleanSlug}/`;
      const allStreams = [];
      const allIframes = [];
      const customSources = [];
      const debugInfo = { baseDomain, wpStatus: 0, htmlVia: "none" };

      const { html: pageHtml, via, status: htmlStatus } =
        await fetchHtmlWithFallback(postLink, reqHeaders);
      debugInfo.htmlVia = via;
      debugInfo.htmlStatus = htmlStatus;
      debugInfo.htmlLength = pageHtml.length;

      if (pageHtml) {
        postId = extractWpPostId(pageHtml);

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

        // 1. Quét media trực tiếp trong trang
        const media = extractMedia(pageHtml, baseDomain, baseHost);
        allStreams.push(...media.streams);
        allIframes.push(...media.iframes);

        // 2. Bóc tách các nút Server (.video2-btn) và tìm script xử lý chúng
        const servers = extractViet69Buttons(pageHtml);
        debugInfo.servers = servers;

        if (servers.length > 0) {
          const handlerJs = await findVideo2Script(
            pageHtml,
            baseDomain,
            reqHeaders
          );

          if (handlerJs) {
            const idx = handlerJs.indexOf("video2-btn");
            debugInfo.playerSnippet =
              idx !== -1
                ? handlerJs.slice(Math.max(0, idx - 200), idx + 800)
                : handlerJs.slice(0, 800);
          } else {
            // Lưu 600 ký tự quanh nút video2-btn để kiểm tra nếu chưa thấy script
            const btnIdx = pageHtml.indexOf("video2-btn");
            if (btnIdx !== -1) {
              debugInfo.playerSnippet = pageHtml.slice(
                Math.max(0, btnIdx - 200),
                btnIdx + 600
              );
            }
          }

          for (const srv of servers) {
            const vid = srv.decodedVideo;

            // Trường hợp 1: Chuỗi sau giải mã Base64 đã là URL hoặc thẻ iframe
            if (
              vid.startsWith("http") ||
              vid.startsWith("//") ||
              vid.includes("<iframe")
            ) {
              const m = extractMedia(vid, baseDomain, baseHost);
              const foundUrl =
                m.streams[0] ||
                m.iframes[0] ||
                (vid.startsWith("http") ? vid : "");
              if (foundUrl) {
                const isStream =
                  foundUrl.includes(".m3u8") || foundUrl.includes(".mp4");
                if (isStream) allStreams.push(foundUrl);
                else allIframes.push(foundUrl);
                customSources.push({
                  label: srv.label,
                  name: srv.label,
                  url: foundUrl,
                  src: foundUrl,
                  type: isStream
                    ? foundUrl.includes(".m3u8")
                      ? "hls"
                      : "mp4"
                    : "iframe"
                });
                continue;
              }
            }

            // Trường hợp 2: Dựng URL từ hàm JS xử lý video2-btn của Viet69
            const builtFromJs = buildUrlFromHandlerJs(
              handlerJs,
              srv.dataType,
              srv.decodedVideo,
              srv.rawVideo
            );
            if (builtFromJs) {
              const isStream =
                builtFromJs.includes(".m3u8") || builtFromJs.includes(".mp4");
              if (isStream) allStreams.push(builtFromJs);
              else allIframes.push(builtFromJs);
              customSources.push({
                label: srv.label,
                name: srv.label,
                url: builtFromJs,
                src: builtFromJs,
                type: isStream
                  ? builtFromJs.includes(".m3u8")
                    ? "hls"
                    : "mp4"
                  : "iframe"
              });
            }
          }
        }
      }

      const streams = [...new Set(allStreams)];
      const iframes = [...new Set(allIframes)];
      const primaryUrl = streams[0] || iframes[0] || "";
      const primaryType = streams[0]
        ? streams[0].includes(".m3u8")
          ? "hls"
          : "mp4"
        : "iframe";

      const finalSources =
        customSources.length > 0
          ? customSources
          : [
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
            ];

      return NextResponse.json(
        {
          id: postId ? String(postId) : cleanSlug,
          slug: cleanSlug,
          title,
          category: "movie",
          thumbnail: thumbnail || FALLBACK_THUMB,
          postLink,
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
          sources: finalSources,
          _debug: debugInfo
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

  // =================================================================
  // TRƯỜNG HỢP 2: LẤY DANH SÁCH VIDEO THEO TRANG
  // =================================================================
  try {
    const wpUrl = `${baseDomain}/wp-json/wp/v2/posts?_embed&page=${page}&per_page=${per}${
      q ? `&search=${encodeURIComponent(q)}` : ""
    }`;
    const wpRes = await fetchWithTimeout(wpUrl, { headers: reqHeaders });

    if (wpRes.ok && (wpRes.headers.get("content-type") || "").includes("json")) {
      const posts = await wpRes.json();
      const totalPages = Math.max(
        1,
        parseInt(wpRes.headers.get("x-wp-totalpages") || "10", 10)
      );
      const total = parseInt(
        wpRes.headers.get("x-wp-total") || String(posts.length * totalPages),
        10
      );

      if (Array.isArray(posts) && posts.length > 0) {
        const items = posts.map((p) => {
          const contentHtml = p.content?.rendered || "";
          const imgMatch = contentHtml.match(
            /(?:data-src|data-original|src)=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/i
          );
          const thumb =
            p._embedded?.["wp:featuredmedia"]?.[0]?.source_url ||
            p.yoast_head_json?.og_image?.[0]?.url ||
            (imgMatch ? imgMatch[1] : FALLBACK_THUMB);

          return {
            id: String(p.id),
            slug: p.slug,
            title: cleanText(p.title?.rendered || p.slug),
            category: category === "all" ? "movie" : category,
            thumbnail: thumb,
            thumb,
            poster: thumb,
            image: thumb
          };
        });

        return NextResponse.json(
          { items, page, totalPages, total },
          { headers: CORS }
        );
      }
    }

    const pagePath = page > 1 ? `/page/${page}/` : "/";
    const htmlUrl = q
      ? `${baseDomain}${pagePath}?s=${encodeURIComponent(q)}`
      : `${baseDomain}${pagePath}`;

    const { html } = await fetchHtmlWithFallback(htmlUrl, reqHeaders);
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

        const linkHost = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
        if (linkHost !== baseHost && !linkHost.includes("viet69")) continue;

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
