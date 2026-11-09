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

function decodeBase64Safe(str = "") {
  try {
    const decoded = Buffer.from(str.trim(), "base64").toString("utf-8").trim();
    if (decoded && !/[\x00-\x08\x0E-\x1F]/.test(decoded)) {
      return decoded;
    }
  } catch (_) {}
  return "";
}

// 1. Tách danh sách các nút Server (.video2-btn) của Viet69
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

// 2. Tìm đoạn script xử lý .video2-btn trong trang để lấy tên action AJAX và mẫu URL nhúng
function inspectViet69Script(html = "") {
  const info = {
    ajaxActions: new Set(),
    embedDomains: new Set(),
    scriptSnippet: ""
  };

  // Bắt đoạn script có chứa video2-btn hoặc data-video
  const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = scriptRegex.exec(html)) !== null) {
    const content = m[1];
    if (
      content.includes("video2-btn") ||
      content.includes("data-video") ||
      content.includes("data-type")
    ) {
      info.scriptSnippet = content.trim().slice(0, 900);

      // Tìm mọi action AJAX trong script này
      const actRegex = /action\s*[:=]\s*["']([a-zA-Z0-9_-]+)["']/gi;
      let am;
      while ((am = actRegex.exec(content)) !== null) {
        info.ajaxActions.add(am[1]);
      }

      // Tìm mọi tên miền/đường dẫn nhúng trong script này
      const urlRegex = /https?:\/\/[^\s"'<>\\`]+/gi;
      let um;
      while ((um = urlRegex.exec(content)) !== null) {
        const u = um[0].replace(/\\\//g, "/");
        if (!IGNORE_DOMAINS.some((d) => u.includes(d))) {
          info.embedDomains.add(u);
        }
      }
    }
  }

  // Quét thêm toàn trang tìm action AJAX trong jQuery.post / $.ajax
  const globalActRegex =
    /action\s*:\s*["']([a-zA-Z0-9_-]*(?:video|player|embed|stream|get|load)[a-zA-Z0-9_-]*)["']/gi;
  while ((m = globalActRegex.exec(html)) !== null) {
    info.ajaxActions.add(m[1]);
  }

  return {
    ajaxActions: [...info.ajaxActions],
    embedDomains: [...info.embedDomains],
    scriptSnippet: info.scriptSnippet
  };
}

// 3. Bóc tách URL luồng phát (.m3u8, .mp4, iframe) từ bất kỳ chuỗi HTML/JSON nào
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

  // Giải mã mọi chuỗi Base64 trong văn bản
  const b64Regex = /([A-Za-z0-9+/]{24,}={0,2})/g;
  let b64Match;
  while ((b64Match = b64Regex.exec(buffer)) !== null) {
    const decoded = decodeBase64Safe(b64Match[1]);
    if (decoded && /https?:\/\/|<iframe|\.m3u8|\.mp4/i.test(decoded)) {
      buffer += "\n" + decoded;
    }
  }

  const streams = new Set();
  const iframes = new Set();
  const baseHost = baseDomain
    ? new URL(baseDomain).hostname.replace(/^www\./, "")
    : "";

  const isInternalArticle = (u) => {
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

    if (trustAsIframe && !isInternalArticle(u)) {
      iframes.add(u);
      return;
    }

    if (
      /(?:embed|\/e\/|\/v\/|\/play|player|stream|video|hydrax|abyss|dood|ok\.ru|helvid|vhstream|goostream|cd-vs|blogger\.com|blogspot|clip|watch|token=|id=)/i.test(
        lower
      ) &&
      !isInternalArticle(u)
    ) {
      iframes.add(u);
    }
  };

  // Quét các thẻ <iframe ...>, <embed ...>, <source ...>
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

  // Quét biến JS cấu hình player
  const jsConfigRegex =
    /(?:["']?(?:file|source|src|url|embed_url|embedUrl|contentUrl|video_url|videoUrl|stream_url|iframe_url|hls|mp4|link)["']?)\s*:\s*["'](https?:\/\/[^"'\s<>]+|\/\/[^"'\s<>]+)["']/gi;
  let match;
  while ((match = jsConfigRegex.exec(buffer)) !== null) {
    addCandidate(match[1], true);
  }

  // Quét trực tiếp link .m3u8 và .mp4
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
      const customSources = [];
      const debugInfo = { baseDomain, wpStatus: 0, htmlVia: "none" };

      // 1. Tải trực tiếp trang HTML chi tiết
      const { html: pageHtml, via, status: htmlStatus } =
        await fetchHtmlWithFallback(postLink, reqHeaders);
      debugInfo.htmlVia = via;
      debugInfo.htmlStatus = htmlStatus;
      debugInfo.htmlLength = pageHtml.length;

      if (pageHtml) {
        foundPost = true;
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

        // Quét media có sẵn trong HTML
        const media = extractMedia(pageHtml, baseDomain);
        allStreams.push(...media.streams);
        allIframes.push(...media.iframes);

        // 2. Bóc tách các nút <button class="video2-btn" data-type="..." data-video="...">
        const servers = extractViet69Servers(pageHtml);
        const scriptInfo = inspectViet69Script(pageHtml);
        debugInfo.servers = servers;
        if (scriptInfo.scriptSnippet) {
          debugInfo.playerSnippet = scriptInfo.scriptSnippet;
        }

        // Nếu trang có script nhúng riêng (hoặc file JS ngoài xử lý video2-btn), tải thêm file JS đó để tìm công thức URL
        if (!scriptInfo.scriptSnippet) {
          const jsFiles =
            pageHtml.match(
              /<script[^>]+src=["'](https?:\/\/[^"']+\/wp-content\/themes\/[^"']+\.js[^"']*)["']/gi
            ) || [];
          for (const jsTag of jsFiles.slice(0, 3)) {
            const srcM = jsTag.match(/src=["']([^"']+)["']/i);
            if (!srcM) continue;
            try {
              const jsRes = await fetchWithTimeout(
                srcM[1],
                { headers: reqHeaders },
                4000
              );
              if (jsRes.ok) {
                const jsText = await jsRes.text();
                if (
                  jsText.includes("video2-btn") ||
                  jsText.includes("data-video")
                ) {
                  const idx = jsText.indexOf("video2-btn");
                  debugInfo.playerSnippet = jsText.slice(
                    Math.max(0, idx - 150),
                    idx + 750
                  );
                  const subInfo = inspectViet69Script(
                    `<script>${jsText}</script>`
                  );
                  scriptInfo.ajaxActions.push(...subInfo.ajaxActions);
                  scriptInfo.embedDomains.push(...subInfo.embedDomains);
                  break;
                }
              }
            } catch (_) {}
          }
        }

        // 3. Giải mã từng nút Server #1, Server #2...
        for (const srv of servers) {
          const vid = srv.decodedVideo;
          const rawVid = srv.rawVideo;
          const vType = srv.dataType;

          // 3a. Nếu decodedVideo bản thân nó đã là URL hoặc thẻ <iframe>
          if (vid.startsWith("http") || vid.startsWith("//") || vid.includes("<iframe")) {
            const m = extractMedia(vid, baseDomain);
            m.streams.forEach((u) => {
              allStreams.push(u);
              customSources.push({
                label: srv.label,
                name: srv.label,
                url: u,
                src: u,
                type: u.includes(".m3u8") ? "hls" : "mp4"
              });
            });
            m.iframes.forEach((u) => {
              allIframes.push(u);
              customSources.push({
                label: srv.label,
                name: srv.label,
                url: u,
                src: u,
                type: "iframe"
              });
            });
            if (vid.startsWith("http") && m.streams.length === 0 && m.iframes.length === 0) {
              allIframes.push(vid);
              customSources.push({
                label: srv.label,
                name: srv.label,
                url: vid,
                src: vid,
                type: "iframe"
              });
            }
            continue;
          }

          // 3b. Thử gọi admin-ajax.php với các action tìm thấy trong script (hoặc action chuẩn của Viet69)
          const candidateActions = [
            ...new Set([
              ...scriptInfo.ajaxActions,
              "get_video",
              "load_video",
              "get_player",
              "video2_player",
              "ajax_video",
              "get_embed"
            ])
          ];

          let resolvedByAjax = false;
          for (const act of candidateActions.slice(0, 5)) {
            try {
              const body = new URLSearchParams({
                action: act,
                video: rawVid,
                vid: vid,
                id: vid,
                type: vType,
                post_id: postId || ""
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
                3500
              );

              if (ajaxRes.ok) {
                const ajaxText = (await ajaxRes.text()).trim();
                if (ajaxText && ajaxText !== "0" && ajaxText !== "-1") {
                  const m = extractMedia(ajaxText, baseDomain);
                  if (m.streams.length > 0 || m.iframes.length > 0) {
                    resolvedByAjax = true;
                    m.streams.forEach((u) => {
                      allStreams.push(u);
                      customSources.push({
                        label: srv.label,
                        name: srv.label,
                        url: u,
                        src: u,
                        type: u.includes(".m3u8") ? "hls" : "mp4"
                      });
                    });
                    m.iframes.forEach((u) => {
                      allIframes.push(u);
                      customSources.push({
                        label: srv.label,
                        name: srv.label,
                        url: u,
                        src: u,
                        type: "iframe"
                      });
                    });
                    break;
                  }
                }
              }
            } catch (_) {}
          }

          if (resolvedByAjax) continue;

          // 3c. Nếu script có chứa mẫu domain nhúng (ví dụ https://.../embed/), ghép UUID vào
          for (const dom of scriptInfo.embedDomains) {
            if (/(?:embed|play|video|v\/|e\/)/i.test(dom)) {
              const baseEmbed = dom.replace(/\/+$/, "");
              const builtUrl = `${baseEmbed}/${vid}`;
              allIframes.push(builtUrl);
              customSources.push({
                label: srv.label,
                name: srv.label,
                url: builtUrl,
                src: builtUrl,
                type: "iframe"
              });
            }
          }
        }
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
