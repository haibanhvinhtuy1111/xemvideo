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
  "fonts.gstatic.com"
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

// Tải HTML có hỗ trợ Proxy vượt Cloudflare nếu IP Vercel bị chặn (403/503)
async function fetchHtmlWithFallback(targetUrl, headers) {
  let status = 0;
  // 1. Thử tải trực tiếp
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

  // 2. Fallback qua Proxy nếu Cloudflare chặn IP của Vercel
  const proxies = [
    (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
    (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`
  ];

  for (const buildProxy of proxies) {
    try {
      const proxyUrl = buildProxy(targetUrl);
      const res = await fetchWithTimeout(proxyUrl, {}, 8000);
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

function unpackPacker(html = "") {
  let unpacked = "";
  const packerRegex =
    /eval\(function\(p,a,c,k,e,[dr]\)\{[\s\S]*?\}\s*\(\s*(['"])([\s\S]*?)\1\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(['"])([\s\S]*?)\5\.split\(['"]\|['"]\)/gi;
  let m;
  while ((m = packerRegex.exec(html)) !== null) {
    try {
      let p = m[2];
      const a = parseInt(m[3], 10);
      let c = parseInt(m[4], 10);
      const k = m[6].split("|");
      const encodeBase = (num) => {
        const chars =
          "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
        return (
          (num < a ? "" : encodeBase(Math.floor(num / a))) +
          (num % a > 35 ? String.fromCharCode((num % a) + 29) : chars[num % a])
        );
      };
      while (c--) {
        if (k[c]) {
          p = p.replace(new RegExp("\\b" + encodeBase(c) + "\\b", "g"), k[c]);
        }
      }
      unpacked += "\n" + p;
    } catch (_) {}
  }
  return unpacked;
}

function normalizeUrl(raw = "", baseDomain = "") {
  if (!raw) return "";
  let u = raw
    .trim()
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&")
    .replace(/^['"]+|['"]+$/g, "");
  if (u.startsWith("//")) u = `https:${u}`;
  else if (u.startsWith("/") && baseDomain) u = `${baseDomain}${u}`;
  if (!u.startsWith("http")) return "";
  if (
    u.includes("about:blank") ||
    u.startsWith("javascript:") ||
    u.startsWith("data:")
  ) {
    return "";
  }
  const lower = u.toLowerCase();
  if (IGNORE_DOMAINS.some((d) => lower.includes(d))) return "";
  return u;
}

// Chỉ lọc bỏ file ảnh, font, giao diện tĩnh (KHÔNG chặn .php, .html)
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

function extractMedia(html = "", baseDomain = "") {
  if (!html) return { streams: [], iframes: [] };

  let buffer = html
    .replace(/\\\//g, "/")
    .replace(/\\x([0-9A-Fa-f]{2})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    )
    .replace(/\\u0026/gi, "&")
    .replace(/\\u003c/gi, "<")
    .replace(/\\u003e/gi, ">")
    .replace(/\\u0022/gi, '"')
    .replace(/\\u0027/gi, "'")
    .replace(/&amp;/g, "&");

  buffer += "\n" + unpackPacker(buffer);

  // Giải mã mọi chuỗi Base64 tiềm năng trong mã nguồn
  const b64Regex = /["']([A-Za-z0-9+/=]{24,})["']/g;
  let b64Match;
  while ((b64Match = b64Regex.exec(buffer)) !== null) {
    const candidate = b64Match[1];
    if (candidate.includes("http") || candidate.includes("/")) continue;
    try {
      const decoded = Buffer.from(candidate, "base64").toString("utf-8");
      if (
        decoded.includes("http") ||
        decoded.includes("<iframe") ||
        decoded.includes(".m3u8") ||
        decoded.includes(".mp4")
      ) {
        buffer += "\n" + decoded;
      }
    } catch (_) {}
  }

  const streams = new Set();
  const iframes = new Set();

  const addCandidate = (rawUrl, isFromIframeTag = false) => {
    const u = normalizeUrl(rawUrl, baseDomain);
    if (!u || isStaticAsset(u)) return;
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

    // Nếu lấy trực tiếp từ thẻ <iframe> thì nhận luôn
    if (isFromIframeTag) {
      if (!lower.includes("/wp-admin/") && !lower.includes("/wp-login")) {
        iframes.add(u);
      }
      return;
    }

    // Nếu lấy từ biến JS / thuộc tính data-* thì kiểm tra từ khóa player
    if (
      /(?:embed|\/e\/|\/v\/|\/play|player|stream|video\.g\?token=|hydrax|abyss|dood|ok\.ru|helvid|vhstream|goostream|69vn|viet69.*\/(?:embed|play|v))/i.test(
        lower
      )
    ) {
      iframes.add(u);
    }
  };

  // 1. Quét tất cả thẻ <iframe> (hỗ trợ cả thuộc tính có ngoặc kép lẫn không ngoặc kép do nén HTML)
  const iframeTags = buffer.match(/<iframe\b[^>]*>/gi) || [];
  const iframeAttrs = [
    "data-litespeed-src",
    "data-lazy-src",
    "data-wpfc-original-src",
    "data-src",
    "data-original",
    "src"
  ];
  for (const tag of iframeTags) {
    for (const attr of iframeAttrs) {
      const attrMatch = tag.match(
        new RegExp(`\\b${attr}\\s*=\\s*(?:["']([^"']+)["']|([^\\s>"']+))`, "i")
      );
      const val = attrMatch ? attrMatch[1] || attrMatch[2] : "";
      if (val) {
        addCandidate(val, true);
      }
    }
  }

  // 2. Quét thuộc tính data-* trên các thẻ div/player
  const dataAttrRegex =
    /(?:data-video|data-embed|data-iframe|data-player|data-stream|data-file|data-url|data-link|data-src|data-lazy-src|data-litespeed-src)\s*=\s*["'](https?:\/\/[^"'\s<>]+|\/\/[^"'\s<>]+)["']/gi;
  let match;
  while ((match = dataAttrRegex.exec(buffer)) !== null) {
    addCandidate(match[1], false);
  }

  // 3. Quét thẻ <meta> chứa luồng video
  const metaRegex =
    /<meta[^>]+(?:property|name|itemprop)\s*=\s*["'](?:og:video(?::url|:secure_url)?|twitter:player|embedUrl|contentUrl)["'][^>]+content\s*=\s*["']([^"']+)["']/gi;
  while ((match = metaRegex.exec(buffer)) !== null) {
    addCandidate(match[1], true);
  }

  // 4. Quét biến cấu hình JS (file, src, embed_url, video_url, sources...)
  const jsConfigRegex =
    /(?:["']?(?:file|source|src|url|embed_url|embedUrl|contentUrl|video_url|videoUrl|stream_url|iframe_url|hls|mp4)["']?)\s*:\s*["'](https?:\/\/[^"'\s<>]+|\/\/[^"'\s<>]+)["']/gi;
  while ((match = jsConfigRegex.exec(buffer)) !== null) {
    addCandidate(match[1], false);
  }

  // 5. Quét trực tiếp mọi đường dẫn .m3u8 và .mp4
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
    /\bpostid-(\d+)\b/i,
    /\bpost-(\d+)\b/i,
    /\bdata-post(?:-id)?=["']?(\d+)/i,
    /\bdata-id=["']?(\d+)/i,
    /["']post_id["']\s*:\s*["']?(\d+)/i,
    /\?p=(\d+)/i
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

  const rawDomain = (sp.get("domain") || DEFAULT_DOMAIN).trim();
  const baseDomain = (
    rawDomain.startsWith("http") ? rawDomain : `https://${rawDomain}`
  ).replace(/\/+$/, "");
  const baseHost = new URL(baseDomain).hostname.replace(/^www\./, "");
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
      let postLink = `${baseDomain}/${cleanSlug}/`;
      let foundPost = false;
      const allStreams = [];
      const allIframes = [];
      const debugInfo = { baseDomain, wpStatus: 0, htmlVia: "none" };

      // BƯỚC 1: Lấy qua WordPress REST API
      try {
        const wpRes = await fetchWithTimeout(
          `${baseDomain}/wp-json/wp/v2/posts?slug=${encodeURIComponent(cleanSlug)}&_embed`,
          { headers: reqHeaders }
        );
        debugInfo.wpStatus = wpRes.status;
        if (wpRes.ok) {
          const posts = await wpRes.json();
          if (Array.isArray(posts) && posts.length > 0) {
            foundPost = true;
            const p = posts[0];
            postId = p.id;
            if (p.link) postLink = p.link;
            title = cleanText(p.title?.rendered || cleanSlug);
            thumbnail =
              p._embedded?.["wp:featuredmedia"]?.[0]?.source_url ||
              p.yoast_head_json?.og_image?.[0]?.url ||
              "";
            const media = extractMedia(JSON.stringify(p), baseDomain);
            allStreams.push(...media.streams);
            allIframes.push(...media.iframes);
          }
        }
      } catch (e) {
        debugInfo.wpError = e.message;
      }

      // BƯỚC 2: Tải trang HTML bài viết (tự động dùng Proxy nếu Cloudflare chặn IP Vercel)
      const { html: pageHtml, via, status: htmlStatus } =
        await fetchHtmlWithFallback(postLink, reqHeaders);
      debugInfo.htmlVia = via;
      debugInfo.htmlStatus = htmlStatus;
      debugInfo.htmlLength = pageHtml.length;

      if (pageHtml) {
        foundPost = true;
        if (!postId) postId = extractWpPostId(pageHtml);

        const titleMatch =
          pageHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) ||
          pageHtml.match(/<title>([\s\S]*?)<\/title>/i);
        if (titleMatch && title === cleanSlug) {
          title = cleanText(titleMatch[1]).replace(/\s*[-|–]\s*Viet69.*$/i, "");
        }
        if (!thumbnail) {
          const ogImg = pageHtml.match(
            /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i
          );
          if (ogImg) thumbnail = ogImg[1];
        }
        const media = extractMedia(pageHtml, baseDomain);
        allStreams.push(...media.streams);
        allIframes.push(...media.iframes);
      }

      // BƯỚC 3: Gọi AJAX Player của WordPress nếu vẫn chưa thấy stream
      if (postId && allStreams.length === 0 && allIframes.length === 0) {
        const ajaxActions = [
          `action=doo_player_ajax&post=${postId}&nume=1&type=movie`,
          `action=halim_ajax_player&post_id=${postId}&episode=1&server=1`,
          `action=get_player&id=${postId}`,
          `action=wp_script_get_player&post_id=${postId}`
        ];
        for (const body of ajaxActions) {
          if (allStreams.length > 0 || allIframes.length > 0) break;
          try {
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
              5000
            );
            if (ajaxRes.ok) {
              const ajaxText = await ajaxRes.text();
              const media = extractMedia(ajaxText, baseDomain);
              allStreams.push(...media.streams);
              allIframes.push(...media.iframes);
            }
          } catch (_) {}
        }
      }

      // BƯỚC 4: Quét xuyên vào Iframe đầu tiên để tìm link .m3u8/.mp4 trực tiếp
      if (allStreams.length === 0 && allIframes.length > 0) {
        try {
          const firstIframe = allIframes[0];
          const embedRes = await fetchWithTimeout(
            firstIframe,
            {
              headers: {
                ...BROWSER_HEADERS,
                Referer: postLink
              }
            },
            5000
          );
          if (embedRes.ok) {
            const embedHtml = await embedRes.text();
            const embedOrigin = new URL(firstIframe).origin;
            const nestedMedia = extractMedia(embedHtml, embedOrigin);
            allStreams.push(...nestedMedia.streams);
            allIframes.push(...nestedMedia.iframes);
          }
        } catch (_) {}
      }

      const streams = [...new Set(allStreams)];
      const iframes = [...new Set(allIframes)];

      if (!foundPost && streams.length === 0 && iframes.length === 0) {
        return NextResponse.json(
          { error: "not_found", _debug: debugInfo },
          { status: 404, headers: CORS }
        );
      }

      const primaryUrl = streams[0] || iframes[0] || "";
      const primaryType = streams[0]
        ? streams[0].includes(".m3u8")
          ? "hls"
          : "mp4"
        : "iframe";

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
          ],
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

        if (parsedUrl.hostname.replace(/^www\./, "") !== baseHost) continue;

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
