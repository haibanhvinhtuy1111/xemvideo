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
    (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
    (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`
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

// Bóc tách chuyên sâu cho Viet69 (RetroTube) & WordPress Video Themes
function extractMedia(html = "", baseDomain = "") {
  if (!html) return { streams: [], iframes: [], playerSnippet: "" };

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

  // Giải mã mọi chuỗi Base64 trong mã nguồn (bao gồm cả data-src/data-link của Server #1, Server #2)
  const b64Regex = /([A-Za-z0-9+/]{28,}={0,2})/g;
  let b64Match;
  while ((b64Match = b64Regex.exec(buffer)) !== null) {
    const candidate = b64Match[1];
    try {
      const decoded = Buffer.from(candidate, "base64").toString("utf-8");
      if (
        /https?:\/\/|<iframe|\.m3u8|\.mp4/i.test(decoded) &&
        !/[\x00-\x08\x0E-\x1F]/.test(decoded)
      ) {
        buffer += "\n" + decoded;
      }
    } catch (_) {}
  }

  const streams = new Set();
  const iframes = new Set();
  const baseHost = baseDomain
    ? new URL(baseDomain).hostname.replace(/^www\./, "")
    : "";

  const isInternalPageLink = (u) => {
    try {
      const uObj = new URL(u);
      const uHost = uObj.hostname.replace(/^www\./, "");
      if (uHost !== baseHost) return false;
      return !/(?:embed|player|play|stream|video|ajax|\?)/i.test(
        uObj.pathname + uObj.search
      );
    } catch (_) {
      return false;
    }
  };

  const addCandidate = (rawUrl, trustAsIframe = false) => {
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

    if (
      lower.includes("/wp-json/") ||
      lower.includes("/wp-admin/") ||
      lower.includes("/wp-login") ||
      lower.includes("/wp-content/themes/") ||
      lower.includes("/wp-content/plugins/") ||
      lower.includes("/wp-includes/") ||
      lower.includes("/feed/") ||
      lower.includes("/category/") ||
      lower.includes("/tag/")
    ) {
      return;
    }

    if (trustAsIframe && !isInternalPageLink(u)) {
      iframes.add(u);
      return;
    }

    if (
      /(?:embed|\/e\/|\/v\/|\/play|player|stream|video|hydrax|abyss|dood|ok\.ru|helvid|vhstream|goostream|blogger\.com|blogspot|clip|watch|token=|id=)/i.test(
        lower
      ) &&
      !isInternalPageLink(u)
    ) {
      iframes.add(u);
    }
  };

  // 1. Khoanh vùng khu vực Player và cụm nút Server #1 / Server #2 của Viet69
  let playerSnippet = "";
  const playerZoneRegex =
    /(?:class=["'][^"']*(?:responsive-player|video-player|player-embed|video-embed|entry-player|server-list|list-server)[^"']*["']|Server\s*#?1)[\s\S]{0,6000}/i;
  const zoneMatch = buffer.match(playerZoneRegex);
  if (zoneMatch) {
    const zoneHtml = zoneMatch[0];
    playerSnippet = zoneHtml.slice(0, 600);
    // Mọi URL nằm trong vùng player/Server #1 đều được ưu tiên nhận làm luồng phát
    const zoneUrls =
      zoneHtml.match(/https?:\/\/[^\s"'<>\\]+|\/\/[^\s"'<>\\]+/gi) || [];
    for (const u of zoneUrls) {
      addCandidate(u, true);
    }
  }

  // 2. Quét tất cả thẻ <iframe>, <embed>, <object>, <source>
  const embedTags =
    buffer.match(/<(?:iframe|embed|object|video|source)\b[^>]*>/gi) || [];
  const attrs = [
    "data-litespeed-src",
    "data-lazy-src",
    "data-wpfc-original-src",
    "data-src",
    "data-original",
    "data-url",
    "data-link",
    "data-embed",
    "src",
    "data"
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

  // 3. Quét tất cả thuộc tính data-* trên các nút chuyển Server (Server #1, Server #2...)
  const dataAttrRegex =
    /\bdata-(?:video|embed|iframe|player|stream|file|url|link|src|lazy-src|litespeed-src|server|hash)\s*=\s*["']([^"']+)["']/gi;
  let match;
  while ((match = dataAttrRegex.exec(buffer)) !== null) {
    addCandidate(match[1], true);
  }

  // 4. Quét sự kiện onclick trên nút Server (ví dụ: onclick="changeServer('https://...')")
  const onclickRegex =
    /onclick\s*=\s*["'][^"']*?(https?:\/\/[^"'\s()]+|\/\/[^"'\s()]+)[^"']*["']/gi;
  while ((match = onclickRegex.exec(buffer)) !== null) {
    addCandidate(match[1], true);
  }

  // 5. Quét thẻ <meta> (og:video, twitter:player, embedUrl, contentUrl)
  const metaRegex =
    /<meta[^>]+(?:property|name|itemprop)\s*=\s*["'](?:og:video(?::url|:secure_url)?|twitter:player|embedUrl|contentUrl)["'][^>]+content\s*=\s*["']([^"']+)["']/gi;
  while ((match = metaRegex.exec(buffer)) !== null) {
    addCandidate(match[1], true);
  }

  // 6. Quét biến JS cấu hình player
  const jsConfigRegex =
    /(?:["']?(?:file|source|src|url|embed_url|embedUrl|contentUrl|video_url|videoUrl|stream_url|iframe_url|hls|mp4|link)["']?)\s*:\s*["'](https?:\/\/[^"'\s<>]+|\/\/[^"'\s<>]+)["']/gi;
  while ((match = jsConfigRegex.exec(buffer)) !== null) {
    addCandidate(match[1], false);
  }

  // 7. Quét trực tiếp mọi link .m3u8 và .mp4
  (
    buffer.match(
      /https?:\/\/[^\s"'<>\\]+?\.(?:m3u8|mp4)(?:\?[^\s"'<>\\]*)?/gi
    ) || []
  ).forEach((u) => addCandidate(u, false));

  return {
    streams: [...streams],
    iframes: [...iframes],
    playerSnippet
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

// Tự động tìm các action AJAX trong mã nguồn trang (phục vụ nút Server #1 / Server #2)
function extractAjaxActions(html = "") {
  const actions = new Set([
    "doo_player_ajax",
    "halim_ajax_player",
    "get_player",
    "load_player"
  ]);
  const regex = /action\s*[:=]\s*["']([a-zA-Z0-9_-]*(?:player|embed|video|server|stream)[a-zA-Z0-9_-]*)["']/gi;
  let m;
  while ((m = regex.exec(html)) !== null) {
    actions.add(m[1]);
  }
  return [...actions];
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

      // 1. Lấy thông tin bài viết từ WordPress REST API
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

      // 2. Tải trang HTML chi tiết để lấy vùng .responsive-player và Server #1 / Server #2
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
        if (media.playerSnippet) {
          debugInfo.playerSnippet = media.playerSnippet;
        }
      }

      // 3. Nếu chưa có luồng, tự động gọi các action AJAX tìm thấy trong trang
      if (postId && allStreams.length === 0 && allIframes.length === 0) {
        const actions = extractAjaxActions(pageHtml);
        for (const act of actions) {
          if (allStreams.length > 0 || allIframes.length > 0) break;
          const body = `action=${act}&post=${postId}&post_id=${postId}&id=${postId}&nume=1&server=1&type=movie`;
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
              4500
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

      // 4. Quét xuyên vào Iframe đầu tiên nếu muốn lấy thêm link .m3u8/.mp4 trực tiếp
      if (allStreams.length === 0 && allIframes.length > 0) {
        try {
          const firstIframe = allIframes[0];
          const embedRes = await fetchWithTimeout(
            firstIframe,
            { headers: { ...BROWSER_HEADERS, Referer: postLink } },
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

  // DANH SÁCH VIDEO THEO TRANG
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
