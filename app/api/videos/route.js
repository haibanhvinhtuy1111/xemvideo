import { NextResponse } from "next/server";
import data from "@/data/videos.json";
import { siteConfig } from "@/config/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Range"
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

// 1. Lấy danh sách các nút Server (.video2-btn / .movieLoader) trên Viet69
function extractViet69Servers(html = "") {
  const servers = [];
  const seen = new Set();

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

// 2. Phân tích HTML trả về từ /get.video.php hoặc trang nhúng
function parsePlayerHtml(rawHtml = "", baseDomain = "") {
  if (!rawHtml) return [];
  let buffer = String(rawHtml)
    .replace(/\\\//g, "/")
    .replace(/\\x([0-9A-Fa-f]{2})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    )
    .replace(/\\u0026/gi, "&")
    .replace(/&amp;/g, "&")
    .trim();

  buffer += "\n" + unpackPacker(buffer);

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

  if (/^https?:\/\/[^\s"'<>]+$/i.test(buffer)) {
    addUrl(buffer);
    return results;
  }

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

  const jsFieldRegex =
    /(?:["']?(?:file|source|src|url|embed_url|embedUrl|video_url|videoSource|securedLink|stream_url|hls|mp4)["']?)\s*:\s*["'](https?:\/\/[^"'\s<>]+|\/\/[^"'\s<>]+)["']/gi;
  while ((m = jsFieldRegex.exec(buffer)) !== null) {
    const fieldCall = m[0].toLowerCase();
    const isHlsField =
      fieldCall.includes("videosource") ||
      fieldCall.includes("securedlink") ||
      fieldCall.includes("hls");
    addUrl(m[1], isHlsField ? "hls" : "");
  }

  (
    buffer.match(
      /https?:\/\/[^\s"'<>\\]+?\.(?:m3u8|mp4)(?:\?[^\s"'<>\\]*)?/gi
    ) || []
  ).forEach((u) => addUrl(u));

  if (results.length === 0) {
    const anyUrls = buffer.match(/https?:\/\/[^\s"'<>\\]+/gi) || [];
    for (const u of anyUrls) {
      addUrl(u);
    }
  }

  return results;
}

// 3. Đi xuyên vào bên trong trang Iframe (FirePlayer / JWPlayer / Embed) để lấy luồng .m3u8 trực tiếp
async function resolveEmbedPage(iframeUrl, postLink, baseDomain) {
  const directStreams = [];
  let embedSnippet = "";

  try {
    const embedUrlObj = new URL(iframeUrl);
    const embedOrigin = embedUrlObj.origin;
    const embedHost = embedUrlObj.hostname;

    const res = await fetchWithTimeout(
      iframeUrl,
      {
        headers: {
          ...BROWSER_HEADERS,
          Referer: postLink
        }
      },
      5500
    );

    let embedCookies = "";
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) {
      embedCookies = setCookie
        .split(/,(?=\s*[a-zA-Z0-9_-]+=)/)
        .map((c) => c.split(";")[0].trim())
        .join("; ");
    }

    const html = await res.text();
    embedSnippet = html
      .replace(/\s+/g, " ")
      .slice(0, 350);

    // 3a. Quét trực tiếp .m3u8 / .mp4 (kể cả trong Packer JS hoặc Base64)
    const parsedInner = parsePlayerHtml(html, embedOrigin);
    for (const item of parsedInner) {
      if (item.type === "hls" || item.type === "mp4") {
        directStreams.push({
          url: item.url,
          type: item.type,
          referer: iframeUrl
        });
      }
    }

    // 3b. Kiểm tra cơ chế FirePlayer / JWPlayer (POST /player/index.php?data=<hash>&do=getVideo)
    const fireMatch =
      html.match(/FirePlayer\s*\(\s*["']([a-zA-Z0-9_-]+)["']/i) ||
      html.match(/player\/index\.php\?data=([a-zA-Z0-9_-]+)/i) ||
      iframeUrl.match(/\/(?:v|e|embed|play|video)\/([a-zA-Z0-9_-]{8,})/i) ||
      iframeUrl.match(/[?&](?:id|v|data)=([a-zA-Z0-9_-]{8,})/i);

    if (fireMatch && fireMatch[1]) {
      const hash = fireMatch[1];
      const fireApiUrl = `${embedOrigin}/player/index.php?data=${encodeURIComponent(hash)}&do=getVideo`;
      try {
        const fireRes = await fetchWithTimeout(
          fireApiUrl,
          {
            method: "POST",
            headers: {
              ...BROWSER_HEADERS,
              Origin: embedOrigin,
              Referer: iframeUrl,
              "Content-Type":
                "application/x-www-form-urlencoded; charset=UTF-8",
              "X-Requested-With": "XMLHttpRequest",
              ...(embedCookies ? { Cookie: embedCookies } : {})
            },
            body: `hash=${encodeURIComponent(hash)}&r=${encodeURIComponent(baseDomain + "/")}`
          },
          4500
        );

        if (fireRes.ok) {
          const fireText = await fireRes.text();
          embedSnippet += ` | FireAPI: ${fireText.slice(0, 200)}`;
          try {
            const fireJson = JSON.parse(fireText);
            const streamUrl =
              fireJson.securedLink ||
              fireJson.videoSource ||
              fireJson.file ||
              fireJson.hls ||
              "";
            if (streamUrl && streamUrl.startsWith("http")) {
              directStreams.unshift({
                url: streamUrl,
                type: streamUrl.includes(".mp4") ? "mp4" : "hls",
                referer: iframeUrl
              });
            }
          } catch (_) {
            const extra = parsePlayerHtml(fireText, embedOrigin);
            for (const x of extra) {
              if (x.type === "hls" || x.type === "mp4") {
                directStreams.unshift({
                  url: x.url,
                  type: x.type,
                  referer: iframeUrl
                });
              }
            }
          }
        }
      } catch (_) {}

      // 3c. Kiểm tra chuẩn Fembed / Short.ink (POST /api/source/<hash>)
      if (directStreams.length === 0 && html.includes("/api/source/")) {
        try {
          const apiRes = await fetchWithTimeout(
            `${embedOrigin}/api/source/${encodeURIComponent(hash)}`,
            {
              method: "POST",
              headers: {
                ...BROWSER_HEADERS,
                Origin: embedOrigin,
                Referer: iframeUrl,
                "Content-Type":
                  "application/x-www-form-urlencoded; charset=UTF-8",
                "X-Requested-With": "XMLHttpRequest"
              },
              body: `r=${encodeURIComponent(baseDomain + "/")}&d=${encodeURIComponent(embedHost)}`
            },
            4500
          );
          if (apiRes.ok) {
            const apiJson = await apiRes.json();
            if (Array.isArray(apiJson?.data)) {
              for (const item of apiJson.data) {
                if (item.file) {
                  directStreams.push({
                    url: item.file,
                    type: item.type === "mp4" || item.file.includes(".mp4") ? "mp4" : "hls",
                    referer: iframeUrl
                  });
                }
              }
            }
          }
        } catch (_) {}
      }
    }
  } catch (err) {
    embedSnippet = `HopError: ${err.message}`;
  }

  return { directStreams, embedSnippet };
}

// 4. Gọi POST /get.video.php (hoặc /get.xvideo.php khi type == 10) và bóc tách sâu
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
    let parsed = parsePlayerHtml(text, baseDomain);

    if (parsed.length === 0) {
      const getRes = await fetchWithTimeout(
        `${targetUrl}?${body}`,
        { method: "GET", headers: ajaxHeaders },
        5000
      );
      const getText = await getRes.text();
      parsed = parsePlayerHtml(getText, baseDomain);
    }

    const enrichedItems = [];
    let hopLog = "";

    for (const item of parsed) {
      if (item.type === "iframe") {
        // Quét xuyên vào trong iframe để lấy luồng HLS/MP4 trực tiếp
        const { directStreams, embedSnippet } = await resolveEmbedPage(
          item.url,
          postLink,
          baseDomain
        );
        if (embedSnippet) hopLog += ` -> ${embedSnippet}`;

        for (const ds of directStreams) {
          enrichedItems.push({
            url: ds.url,
            type: ds.type,
            referer: ds.referer || item.url,
            isDirectResolved: true
          });
        }
      }
      enrichedItems.push({
        url: item.url,
        type: item.type,
        referer: postLink,
        isDirectResolved: false
      });
    }

    return {
      items: enrichedItems,
      rawResponse: `${text.slice(0, 250)}${hopLog}`
    };
  } catch (err) {
    return { items: [], rawResponse: `Error: ${err.message}` };
  }
}

export async function GET(req) {
  const sp = req.nextUrl.searchParams;

  // =================================================================
  // CHẾ ĐỘ A: PROXY LUỒNG HLS (.m3u8 / .ts) VƯỢT CHẶN REFERER & CORS
  // =================================================================
  if (sp.get("hlsProxy") === "1") {
    const targetUrl = sp.get("url");
    const referer = sp.get("referer") || `${DEFAULT_DOMAIN}/`;
    if (!targetUrl) {
      return new NextResponse("Missing url", { status: 400, headers: CORS });
    }
    try {
      const refOrigin = new URL(referer).origin;
      const upstream = await fetchWithTimeout(
        targetUrl,
        {
          headers: {
            ...BROWSER_HEADERS,
            Origin: refOrigin,
            Referer: referer
          }
        },
        9000
      );

      const contentType = (
        upstream.headers.get("content-type") || ""
      ).toLowerCase();
      const buffer = await upstream.arrayBuffer();
      const firstBytes = Buffer.from(buffer.slice(0, 16)).toString("utf-8");

      // Nếu là file danh sách phát M3U8 (#EXTM3U), viết lại các đường dẫn con qua Proxy
      if (
        firstBytes.startsWith("#EXTM3U") ||
        contentType.includes("mpegurl") ||
        targetUrl.includes(".m3u8")
      ) {
        const text = Buffer.from(buffer).toString("utf-8");
        const rewritten = text
          .split(/\r?\n/)
          .map((line) => {
            const trimmed = line.trim();
            if (!trimmed) return line;
            if (trimmed.startsWith("#")) {
              return line.replace(/URI=["']([^"']+)["']/gi, (_, uri) => {
                try {
                  const abs = new URL(uri, targetUrl).toString();
                  return `URI="/api/videos?hlsProxy=1&url=${encodeURIComponent(abs)}&referer=${encodeURIComponent(referer)}"`;
                } catch (_) {
                  return `URI="${uri}"`;
                }
              });
            }
            try {
              const abs = new URL(trimmed, targetUrl).toString();
              return `/api/videos?hlsProxy=1&url=${encodeURIComponent(abs)}&referer=${encodeURIComponent(referer)}`;
            } catch (_) {
              return line;
            }
          })
          .join("\n");

        return new NextResponse(rewritten, {
          status: 200,
          headers: {
            ...CORS,
            "Content-Type": "application/vnd.apple.mpegurl",
            "Cache-Control": "no-store"
          }
        });
      }

      return new NextResponse(buffer, {
        status: upstream.status,
        headers: {
          ...CORS,
          "Content-Type":
            upstream.headers.get("content-type") || "video/mp2t",
          "Cache-Control": "public, max-age=3600"
        }
      });
    } catch (err) {
      return new NextResponse(err.message, { status: 502, headers: CORS });
    }
  }

  // =================================================================
  // CHẾ ĐỘ B: PROXY TRANG NHÚNG IFRAME (GIẢ LẬP DOCUMENT.REFERRER = VIET69)
  // =================================================================
  if (sp.get("embedProxy") === "1") {
    const targetUrl = sp.get("url");
    const referer = sp.get("referer") || `${DEFAULT_DOMAIN}/`;
    if (!targetUrl) {
      return new NextResponse("Missing url", { status: 400, headers: CORS });
    }
    try {
      const upstream = await fetchWithTimeout(
        targetUrl,
        {
          headers: {
            ...BROWSER_HEADERS,
            Referer: referer
          }
        },
        8000
      );
      let html = await upstream.text();
      const targetOrigin = new URL(targetUrl).origin;
      const injectHead = `
        <base href="${targetUrl}">
        <meta name="referrer" content="no-referrer">
        <style>html,body{margin:0!important;padding:0!important;width:100%!important;height:100%!important;overflow:hidden!important;background:#000!important;}</style>
        <script>
          try {
            Object.defineProperty(document, 'referrer', { get: function() { return '${referer}'; } });
            Object.defineProperty(window, 'top', { get: function() { return window.self; } });
            Object.defineProperty(window, 'parent', { get: function() { return window.self; } });
          } catch (e) {}
        </script>
      `;
      if (/<head[^>]*>/i.test(html)) {
        html = html.replace(/<head[^>]*>/i, (m) => `${m}${injectHead}`);
      } else {
        html = `${injectHead}${html}`;
      }
      // Chuyển các đường dẫn gốc tương đối sang tuyệt đối
      html = html.replace(
        /\b(src|href)=["']\/(?!\/)([^"']*)["']/gi,
        `$1="${targetOrigin}/$2"`
      );

      return new NextResponse(html, {
        status: 200,
        headers: {
          ...CORS,
          "Content-Type": "text/html; charset=utf-8"
        }
      });
    } catch (err) {
      return new NextResponse(err.message, { status: 502, headers: CORS });
    }
  }

  // =================================================================
  // CHẾ ĐỘ C: API LẤY THÔNG TIN VIDEO & DANH SÁCH BÀI VIẾT
  // =================================================================
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

        const servers = extractViet69Servers(pageHtml);
        debugInfo.servers = servers;

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
              if (mediaItem.type === "hls" || mediaItem.type === "mp4") {
                allStreams.push(mediaItem.url);
                const proxyStreamUrl = `/api/videos?hlsProxy=1&url=${encodeURIComponent(mediaItem.url)}&referer=${encodeURIComponent(mediaItem.referer || postLink)}`;
                customSources.push({
                  label: `${srv.label} (VIP)`,
                  name: `${srv.label} (VIP)`,
                  url: mediaItem.url,
                  src: mediaItem.url,
                  proxyUrl: proxyStreamUrl,
                  referer: mediaItem.referer || postLink,
                  type: mediaItem.type
                });
              } else {
                allIframes.push(mediaItem.url);
                const proxyEmbedUrl = `/api/videos?embedProxy=1&url=${encodeURIComponent(mediaItem.url)}&referer=${encodeURIComponent(postLink)}`;
                customSources.push({
                  label: srv.label,
                  name: srv.label,
                  url: mediaItem.url,
                  src: mediaItem.url,
                  proxyUrl: proxyEmbedUrl,
                  type: "iframe"
                });
                customSources.push({
                  label: `${srv.label} (Proxy)`,
                  name: `${srv.label} (Proxy)`,
                  url: proxyEmbedUrl,
                  src: proxyEmbedUrl,
                  type: "iframe"
                });
              }
            }
          });

          if (rawSnippets.length > 0) {
            debugInfo.playerSnippet = rawSnippets.join("\n\n");
          }
        }

        if (customSources.length === 0) {
          const directParsed = parsePlayerHtml(pageHtml, baseDomain).filter(
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

      // Ưu tiên đưa các luồng Direct HLS/MP4 (VIP) lên đầu để tự động phát ngay
      customSources.sort((a, b) => {
        const aDirect = a.type === "hls" || a.type === "mp4" ? 0 : 1;
        const bDirect = b.type === "hls" || b.type === "mp4" ? 0 : 1;
        return aDirect - bDirect;
      });

      const streams = [...new Set(allStreams)];
      const iframes = [...new Set(allIframes)];
      const primarySource = customSources[0] || null;
      const primaryUrl = primarySource?.url || streams[0] || iframes[0] || "";
      const primaryType = primarySource?.type || (streams[0] ? "hls" : "iframe");

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
          hlsUrl: streams[0] || "",
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
