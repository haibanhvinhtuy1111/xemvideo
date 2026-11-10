import { NextResponse } from "next/server";
import data from "@/data/videos.json";
import { siteConfig } from "@/config/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  let cookies = "";
  try {
    const res = await fetchWithTimeout(targetUrl, { headers }, 7000);
    status = res.status;
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) {
      cookies = setCookie
        .split(/,(?=\s*[a-zA-Z0-9_-]+=)/)
        .map((c) => c.split(";")[0].trim())
        .join("; ");
    }
    if (res.ok) {
      const text = await res.text();
      if (text && text.length > 500 && !text.includes("Just a moment...")) {
        return { html: text, via: "direct", status, cookies };
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
          return { html: text, via: "proxy", status: res.status, cookies: "" };
        }
      }
    } catch (_) {}
  }

  return { html: "", via: "failed", status, cookies: "" };
}

function decodeBase64Safe(str = "") {
  try {
    const cleaned = String(str).trim().replace(/\s+/g, "");
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

function normalizeUrl(raw = "", baseDomain = "") {
  if (!raw) return "";
  let u = String(raw)
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
  if (isStaticAsset(u)) return "";
  return u;
}

// 1. Lấy danh sách các nút Server (.video2-btn) và khung .movieLoader của Viet69
function extractViet69Servers(html = "") {
  const servers = [];
  const seen = new Set();

  // Quét các nút <button class="video2-btn" data-type="..." data-video="...">
  const btnRegex =
    /<button[^>]*class=["'][^"']*video2-btn[^"']*["'][^>]*>([\s\S]*?)<\/button>/gi;
  let m;
  while ((m = btnRegex.exec(html)) !== null) {
    const tag = m[0];
    const label = cleanText(m[1]) || `Server #${servers.length + 1}`;
    const typeMatch = tag.match(/\bdata-type=["']([^"']+)["']/i);
    const videoMatch = tag.match(/\bdata-(?:video|movie)=["']([^"']+)["']/i);
    if (videoMatch && videoMatch[1]) {
      const movieId = videoMatch[1].trim();
      const dataType = typeMatch ? typeMatch[1].trim() : "1";
      const key = `${movieId}_${dataType}`;
      if (!seen.has(key)) {
        seen.add(key);
        servers.push({
          label,
          movieId,
          dataType,
          index: 1
        });
      }
    }
  }

  // Quét thêm thẻ .movieLoader nếu bài viết không hiển thị nút bấm chuyển server
  const loaderRegex =
    /<div[^>]*class=["'][^"']*movieLoader\b[^"']*["'][^>]*>/gi;
  let idx = 1;
  while ((m = loaderRegex.exec(html)) !== null) {
    const tag = m[0];
    if (tag.includes("movieLoader-server")) continue;
    const typeMatch = tag.match(/\bdata-type=["']([^"']+)["']/i);
    const videoMatch = tag.match(/\bdata-(?:movie|video)=["']([^"']+)["']/i);
    if (videoMatch && videoMatch[1]) {
      const movieId = videoMatch[1].trim();
      const dataType = typeMatch ? typeMatch[1].trim() : "1";
      const key = `${movieId}_${dataType}`;
      if (!seen.has(key)) {
        seen.add(key);
        servers.push({
          label: `Server #${servers.length + 1}`,
          movieId,
          dataType,
          index: idx
        });
      }
      idx++;
    }
  }

  return servers;
}

// 2. Bóc tách link phát từ kết quả HTML trả về của /get.video.php hoặc /get.xvideo.php
function parseGetVideoHtml(ajaxHtml = "", baseDomain = "") {
  if (!ajaxHtml) return [];
  let buffer = String(ajaxHtml)
    .replace(/\\\//g, "/")
    .replace(/\\u0026/gi, "&")
    .replace(/&amp;/g, "&")
    .trim();

  // Giải mã nếu phản hồi có chứa chuỗi Base64
  const b64Regex = /([A-Za-z0-9+/]{24,}={0,2})/g;
  let bm;
  while ((bm = b64Regex.exec(buffer)) !== null) {
    const decoded = decodeBase64Safe(bm[1]);
    if (decoded && /https?:\/\/|<iframe|\.m3u8|\.mp4/i.test(decoded)) {
      buffer += "\n" + decoded;
    }
  }

  const results = [];
  const seen = new Set();

  const addUrl = (raw, forcedType = "") => {
    const u = normalizeUrl(raw, baseDomain);
    if (!u || seen.has(u)) return;
    seen.add(u);
    const lower = u.toLowerCase();
    const isHls = lower.includes(".m3u8");
    const isMp4 =
      lower.includes(".mp4") ||
      lower.includes(".webm") ||
      lower.includes(".mov");
    const type =
      forcedType || (isHls ? "hls" : isMp4 ? "mp4" : "iframe");
    results.push({ url: u, type });
  };

  // Nếu phản hồi là một URL thuần túy
  if (/^https?:\/\/[^\s"'<>]+$/i.test(buffer)) {
    addUrl(buffer);
    return results;
  }

  // Quét các thẻ <iframe>, <video>, <source>, <embed> trong kết quả trả về
  const tagRegex = /<(iframe|video|source|embed|object)\b[^>]*>/gi;
  const attrs = [
    "data-litespeed-src",
    "data-lazy-src",
    "data-src",
    "data-url",
    "src",
    "data"
  ];
  let m;
  while ((m = tagRegex.exec(buffer)) !== null) {
    const tagName = m[1].toLowerCase();
    const tag = m[0];
    for (const attr of attrs) {
      const am = tag.match(
        new RegExp(`\\b${attr}\\s*=\\s*(?:["']([^"']+)["']|([^\\s>"']+))`, "i")
      );
      const val = am ? am[1] || am[2] : "";
      if (val) {
        addUrl(val, tagName === "iframe" ? "iframe" : "");
      }
    }
  }

  // Quét các thuộc tính cấu hình JS (file, source, src, url, embed_url, hls, mp4)
  const jsFieldRegex =
    /(?:["']?(?:file|source|src|url|embed_url|embedUrl|video_url|stream_url|hls|mp4)["']?)\s*:\s*["'](https?:\/\/[^"'\s<>]+|\/\/[^"'\s<>]+)["']/gi;
  while ((m = jsFieldRegex.exec(buffer)) !== null) {
    addUrl(m[1]);
  }

  // Quét trực tiếp link .m3u8 / .mp4
  (
    buffer.match(
      /https?:\/\/[^\s"'<>\\]+?\.(?:m3u8|mp4)(?:\?[^\s"'<>\\]*)?/gi
    ) || []
  ).forEach((u) => addUrl(u));

  // Nếu chưa thấy, lấy bất kỳ URL http(s) nào xuất hiện trong phản hồi của get.video.php
  if (results.length === 0) {
    const anyUrls = buffer.match(/https?:\/\/[^\s"'<>\\]+/gi) || [];
    for (const u of anyUrls) {
      addUrl(u);
    }
  }

  return results;
}

// 3. Gọi trực tiếp POST /get.video.php (hoặc /get.xvideo.php khi type == 10) giống hệt playCoverVideo
async function fetchViet69PlayerUrl({
  baseDomain,
  postLink,
  srv,
  reqHeaders,
  cookies
}) {
  const endpoint =
    String(srv.dataType) === "10" ? "/get.xvideo.php" : "/get.video.php";
  const targetUrl = `${baseDomain}${endpoint}`;
  const body = `movie_id=${srv.movieId}&type=${srv.dataType}&index=${srv.index || 1}`;

  const ajaxHeaders = {
    ...reqHeaders,
    Origin: baseDomain,
    Referer: postLink,
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    "X-Requested-With": "XMLHttpRequest",
    ...(cookies ? { Cookie: cookies } : {})
  };

  try {
    const res = await fetchWithTimeout(
      targetUrl,
      {
        method: "POST",
        headers: ajaxHeaders,
        body
      },
      6000
    );

    const text = await res.text();
    const parsed = parseGetVideoHtml(text, baseDomain);
    if (parsed.length > 0) {
      return { items: parsed, rawResponse: text.slice(0, 500) };
    }

    // Nếu POST trả về rỗng, thử gọi GET kèm query string phòng trường hợp cấu hình server đổi
    const getRes = await fetchWithTimeout(
      `${targetUrl}?${body}`,
      {
        method: "GET",
        headers: ajaxHeaders
      },
      5000
    );
    const getText = await getRes.text();
    const getParsed = parseGetVideoHtml(getText, baseDomain);
    return {
      items: getParsed,
      rawResponse: (text || getText).slice(0, 500)
    };
  } catch (err) {
    return { items: [], rawResponse: `Error: ${err.message}` };
  }
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
      const postLink = `${baseDomain}/${cleanSlug}/`;
      const allStreams = [];
      const allIframes = [];
      const customSources = [];
      const debugInfo = { baseDomain, wpStatus: 0, htmlVia: "none" };

      const { html: pageHtml, via, status: htmlStatus, cookies } =
        await fetchHtmlWithFallback(postLink, reqHeaders);
      debugInfo.htmlVia = via;
      debugInfo.htmlStatus = htmlStatus;
      debugInfo.htmlLength = pageHtml.length;

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

        // 1. Lấy danh sách các nút Server (.video2-btn / .movieLoader)
        const servers = extractViet69Servers(pageHtml);
        debugInfo.servers = servers;

        // 2. Gọi song song POST /get.video.php (hoặc /get.xvideo.php) cho tất cả các Server
        if (servers.length > 0) {
          const ajaxResults = await Promise.all(
            servers.map((srv) =>
              fetchViet69PlayerUrl({
                baseDomain,
                postLink,
                srv,
                reqHeaders,
                cookies
              })
            )
          );

          const rawSnippets = [];
          ajaxResults.forEach((res, idx) => {
            const srv = servers[idx];
            if (res.rawResponse) {
              rawSnippets.push(`[${srv.label}]: ${res.rawResponse}`);
            }
            for (const mediaItem of res.items) {
              customSources.push({
                label: srv.label,
                name: srv.label,
                url: mediaItem.url,
                src: mediaItem.url,
                type: mediaItem.type
              });
              if (mediaItem.type === "iframe") {
                allIframes.push(mediaItem.url);
              } else {
                allStreams.push(mediaItem.url);
              }
            }
          });

          if (rawSnippets.length > 0) {
            debugInfo.playerSnippet = rawSnippets.join("\n\n");
          }
        }

        // 3. Nếu bài viết nhúng trực tiếp video không qua nút .video2-btn
        if (customSources.length === 0) {
          const directParsed = parseGetVideoHtml(pageHtml, baseDomain).filter(
            (x) =>
              !x.url.includes(baseHost) && !x.url.includes("viet69")
          );
          directParsed.forEach((item, i) => {
            customSources.push({
              label: `Server #${i + 1}`,
              name: `Server #${i + 1}`,
              url: item.url,
              src: item.url,
              type: item.type
            });
            if (item.type === "iframe") allIframes.push(item.url);
            else allStreams.push(item.url);
          });
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
          videoUrl: streams[0] || primaryUrl,
          hlsUrl: streams.find((s) => s.includes(".m3u8")) || "",
          mp4Url: streams.find((s) => s.includes(".mp4")) || "",
          embedUrl: iframes[0] || "",
          iframe: iframes[0] || "",
          type: primaryType,
          videoType: primaryType,
          streams,
          iframes,
          sources: customSources,
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
