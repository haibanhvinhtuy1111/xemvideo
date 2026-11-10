import { NextResponse } from "next/server";
import vm from "vm";
import data from "@/data/videos.json";
import { siteConfig } from "@/config/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Range, X-Requested-With"
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
  "ajax.googleapis.com",
  "jquery.com"
];

// Bản đồ đường dẫn & từ khóa dự phòng cho các thẻ trên thanh menu Viet69
const CATEGORY_MAP = {
  "phim-sex-viet-moi": {
    paths: [
      "tag/phim-sex-viet-moi",
      "category/phim-sex-viet-moi",
      "phim-sex-viet-moi",
      "clip-sex-viet-nam",
      ""
    ],
    keyword: "việt nam"
  },
  "video-cua-thanh-vien": {
    paths: [
      "video-cua-thanh-vien",
      "category/video-cua-thanh-vien",
      "tag/video-cua-thanh-vien"
    ],
    keyword: "thành viên chia sẻ"
  },
  "phim-sex-sinh-vien": {
    paths: [
      "tag/phim-sex-sinh-vien",
      "category/phim-sex-sinh-vien",
      "phim-sex-sinh-vien",
      "tag/sinh-vien"
    ],
    keyword: "sinh viên"
  },
  teen: {
    paths: ["tag/teen", "category/teen", "teen", "tag/sex-teen"],
    keyword: "teen"
  },
  "check-hang": {
    paths: ["tag/check-hang", "category/check-hang", "check-hang"],
    keyword: "check hàng"
  },
  camera: {
    paths: ["tag/camera", "category/camera", "camera", "tag/quay-len"],
    keyword: "camera"
  },
  bdsm: {
    paths: ["tag/bdsm", "category/bdsm", "bdsm", "tag/bao-dam"],
    keyword: "bdsm"
  },
  "may-bay-ba-gia": {
    paths: [
      "tag/may-bay-ba-gia",
      "category/may-bay-ba-gia",
      "may-bay-ba-gia",
      "tag/may-bay"
    ],
    keyword: "máy bay bà già"
  }
};

// Bộ nhớ đệm lưu đường dẫn thực tế của menu quét từ trang chủ
const navPathCache = new Map();

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

function toSlugKey(str = "") {
  return cleanText(str)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 6500) {
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

function is404Html(html = "") {
  if (!html || html.length < 500) return true;
  if (/<title>[^<]*(?:404|Not Found|Page not found)/i.test(html)) return true;
  if (html.includes("404 Not Found") && !html.includes("loop-video")) {
    return true;
  }
  return false;
}

// Tải HTML: Nếu gặp 404 thì thoát ngay lập tức (KHÔNG gọi proxy làm treo 10s)
async function fetchHtmlWithFallback(targetUrl, headers, allowProxy = true) {
  let status = 0;
  let cookies = "";
  try {
    const res = await fetchWithTimeout(targetUrl, { headers }, 5500);
    status = res.status;
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) {
      cookies = setCookie
        .split(/,(?=\s*[a-zA-Z0-9_-]+=)/)
        .map((c) => c.split(";")[0].trim())
        .join("; ");
    }

    // Nếu trang không tồn tại (404), trả về ngay để thử đường dẫn khác
    if (status === 404) {
      return { html: "", via: "404", status: 404, cookies: "" };
    }

    if (res.ok) {
      const text = await res.text();
      if (is404Html(text)) {
        return { html: "", via: "404-page", status: 404, cookies: "" };
      }
      if (!text.includes("Just a moment...")) {
        return { html: text, via: "direct", status, cookies };
      }
    }
  } catch (_) {}

  // Chỉ dùng Proxy khi thực sự bị chặn Cloudflare (403/503/0) và được phép
  if (!allowProxy || status === 404) {
    return { html: "", via: "failed", status, cookies: "" };
  }

  const proxies = [
    (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
    (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`
  ];

  for (const buildProxy of proxies) {
    try {
      const res = await fetchWithTimeout(buildProxy(targetUrl), {}, 6000);
      if (res.ok) {
        const text = await res.text();
        if (!is404Html(text) && !text.includes("Just a moment...")) {
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

function deobfuscateScriptWithVm(scriptCode = "") {
  if (!scriptCode || !scriptCode.includes("_0x")) return scriptCode;
  try {
    const sandbox = {
      atob: (b) => decodeBase64Safe(b),
      btoa: (s) => Buffer.from(String(s), "utf-8").toString("base64"),
      String,
      Number,
      Array,
      Object,
      Math,
      Date,
      RegExp,
      JSON,
      parseInt,
      parseFloat,
      decodeURIComponent,
      encodeURIComponent,
      escape,
      unescape
    };
    sandbox.window = sandbox;
    sandbox.self = sandbox;
    sandbox.globalThis = sandbox;
    const ctx = vm.createContext(sandbox);

    const splitPoints = [
      scriptCode.indexOf("$(document)"),
      scriptCode.indexOf("jQuery("),
      scriptCode.indexOf("new Plyr"),
      scriptCode.indexOf("new Hls"),
      scriptCode.indexOf("$.ajax"),
      scriptCode.indexOf("fetch(")
    ].filter((idx) => idx > 50);

    const cutIdx =
      splitPoints.length > 0 ? Math.min(...splitPoints) : scriptCode.length;
    try {
      vm.runInContext(scriptCode.slice(0, cutIdx), ctx, { timeout: 600 });
    } catch (_) {
      try {
        vm.runInContext(scriptCode, ctx, { timeout: 600 });
      } catch (_) {}
    }

    const aliasMap = {};
    const aliasRegex = /\b(_0x[a-f0-9]+)\s*=\s*(_0x[a-f0-9]+)\b/gi;
    let am;
    while ((am = aliasRegex.exec(scriptCode)) !== null) {
      aliasMap[am[1]] = am[2];
    }

    const resolveFn = (name) => {
      let cur = name;
      for (let i = 0; i < 6; i++) {
        if (typeof sandbox[cur] === "function") return sandbox[cur];
        if (aliasMap[cur]) cur = aliasMap[cur];
        else break;
      }
      return null;
    };

    return scriptCode.replace(
      /\b(_0x[a-f0-9]{3,})\(\s*(0x[a-f0-9]+|\d+)\s*\)/gi,
      (full, fnName, argStr) => {
        try {
          const fn = resolveFn(fnName);
          if (fn) {
            const val = fn(Number(argStr));
            if (typeof val === "string") return JSON.stringify(val);
          }
        } catch (_) {}
        return full;
      }
    );
  } catch (_) {
    return scriptCode;
  }
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

function extractViet69Servers(html = "") {
  const servers = [];
  const seen = new Set();

  const btnRegex =
    /<button[^>]*class=["']?[^"'>]*video2-btn[^"'>]*["']?[^>]*>([\s\S]*?)<\/button>/gi;
  let m;
  while ((m = btnRegex.exec(html)) !== null) {
    const tag = m[0];
    const label = cleanText(m[1]) || `Server #${servers.length + 1}`;
    const typeMatch = tag.match(/\bdata-type=(?:["']([^"']+)["']|([^\s>"']+))/i);
    const videoMatch = tag.match(
      /\bdata-(?:video|movie)=(?:["']([^"']+)["']|([^\s>"']+))/i
    );
    const rawVid = videoMatch ? videoMatch[1] || videoMatch[2] : "";
    const rawType = typeMatch ? typeMatch[1] || typeMatch[2] : "1";
    if (rawVid) {
      const movieId = rawVid.trim();
      const dataType = rawType.trim();
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
    /<div[^>]*class=["']?[^"'>]*movieLoader\b[^"'>]*["']?[^>]*>/gi;
  let idx = 1;
  while ((m = loaderRegex.exec(html)) !== null) {
    const tag = m[0];
    if (tag.includes("movieLoader-server")) continue;
    const typeMatch = tag.match(/\bdata-type=(?:["']([^"']+)["']|([^\s>"']+))/i);
    const videoMatch = tag.match(
      /\bdata-(?:movie|video)=(?:["']([^"']+)["']|([^\s>"']+))/i
    );
    const rawVid = videoMatch ? videoMatch[1] || videoMatch[2] : "";
    const rawType = typeMatch ? typeMatch[1] || typeMatch[2] : "1";
    if (rawVid) {
      const movieId = rawVid.trim();
      const dataType = rawType.trim();
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
    const isHls =
      lower.includes(".m3u8") ||
      lower.includes("/hls/") ||
      lower.includes("/playlist") ||
      lower.includes("/manifest");
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
    /(?:["']?(?:file|source|src|url|embed_url|embedUrl|video_url|videoSource|securedLink|stream_url|hls|mp4|link)["']?)\s*:\s*["'](https?:\/\/[^"'\s<>]+|\/\/[^"'\s<>]+|\/[^"'\s<>]+)["']/gi;
  while ((m = jsFieldRegex.exec(buffer)) !== null) {
    const fieldCall = m[0].toLowerCase();
    const isHlsField =
      fieldCall.includes("videosource") ||
      fieldCall.includes("securedlink") ||
      fieldCall.includes("hls") ||
      fieldCall.includes("file") ||
      fieldCall.includes("source");
    addUrl(m[1], isHlsField ? "hls" : "");
  }

  const loadSourceRegex =
    /loadSource\s*\(\s*["'`](https?:\/\/[^"'`\s]+|\/[^"'`\s]+)["'`]\s*\)/gi;
  while ((m = loadSourceRegex.exec(buffer)) !== null) {
    addUrl(m[1], "hls");
  }

  (
    buffer.match(
      /https?:\/\/[^\s"'<>\\]+?\.(?:m3u8|mp4)(?:\?[^\s"'<>\\]*)?/gi
    ) || []
  ).forEach((u) => addUrl(u));

  return results;
}

async function resolveEmbedPage(iframeUrl, postLink, baseDomain) {
  const directStreams = [];
  let embedSnippet = "";
  let embedCookies = "";

  try {
    const embedUrlObj = new URL(iframeUrl);
    const embedOrigin = embedUrlObj.origin;

    const res = await fetchWithTimeout(
      iframeUrl,
      {
        headers: {
          ...BROWSER_HEADERS,
          Referer: postLink
        }
      },
      6000
    );

    const setCookie = res.headers.get("set-cookie");
    if (setCookie) {
      embedCookies = setCookie
        .split(/,(?=\s*[a-zA-Z0-9_-]+=)/)
        .map((c) => c.split(";")[0].trim())
        .join("; ");
    }

    const html = await res.text();

    const inlineScripts = [];
    const scriptRegex = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
    let sm;
    while ((sm = scriptRegex.exec(html)) !== null) {
      const attrs = sm[1] || "";
      const body = (sm[2] || "").trim();
      if (body) {
        const decodedBody = deobfuscateScriptWithVm(body);
        inlineScripts.push(decodedBody);
      } else {
        const srcM = attrs.match(/src=["']([^"']+)["']/i);
        if (
          srcM &&
          srcM[1] &&
          !IGNORE_DOMAINS.some((d) => srcM[1].includes(d)) &&
          !srcM[1].includes("plyr") &&
          !srcM[1].includes("hls.js") &&
          !srcM[1].includes("jquery")
        ) {
          try {
            const extUrl = new URL(srcM[1], iframeUrl).toString();
            const extRes = await fetchWithTimeout(
              extUrl,
              { headers: { ...BROWSER_HEADERS, Referer: iframeUrl } },
              4000
            );
            if (extRes.ok) {
              const extJs = await extRes.text();
              inlineScripts.push(deobfuscateScriptWithVm(extJs));
            }
          } catch (_) {}
        }
      }
    }

    const combinedScripts = inlineScripts.join("\n");
    if (combinedScripts) {
      embedSnippet = combinedScripts.replace(/\s+/g, " ").slice(0, 900);
    } else {
      const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      embedSnippet = (bodyMatch ? bodyMatch[1] : html)
        .replace(/\s+/g, " ")
        .slice(0, 700);
    }

    const parsedInner = parsePlayerHtml(
      html + "\n" + combinedScripts,
      embedOrigin
    );
    for (const item of parsedInner) {
      if (item.type === "hls" || item.type === "mp4") {
        directStreams.push({
          url: item.url,
          type: item.type,
          referer: iframeUrl
        });
      }
    }

    const ajaxUrlRegex =
      /(?:url\s*:\s*|\$\.(?:post|get|getJSON)\s*\(\s*|fetch\s*\(\s*)["'`]([^"'`\s]+)["'`]/gi;
    let am;
    while ((am = ajaxUrlRegex.exec(combinedScripts)) !== null) {
      const rawAjaxPath = am[1];
      if (rawAjaxPath.endsWith(".js") || rawAjaxPath.endsWith(".css")) continue;
      try {
        const fullAjaxUrl = new URL(rawAjaxPath, iframeUrl).toString();
        const uuidMatch = iframeUrl.match(/\/embed\/([a-zA-Z0-9_-]+)/i);
        const uuid = uuidMatch ? uuidMatch[1] : "";

        for (const method of ["POST", "GET"]) {
          if (directStreams.length > 0) break;
          const ajaxRes = await fetchWithTimeout(
            fullAjaxUrl,
            {
              method,
              headers: {
                ...BROWSER_HEADERS,
                Origin: embedOrigin,
                Referer: iframeUrl,
                "X-Requested-With": "XMLHttpRequest",
                ...(method === "POST"
                  ? {
                      "Content-Type":
                        "application/x-www-form-urlencoded; charset=UTF-8"
                    }
                  : {}),
                ...(embedCookies ? { Cookie: embedCookies } : {})
              },
              ...(method === "POST"
                ? {
                    body: `id=${encodeURIComponent(uuid)}&vid=${encodeURIComponent(uuid)}&r=${encodeURIComponent(baseDomain + "/")}`
                  }
                : {})
            },
            4500
          );
          if (ajaxRes.ok) {
            const ajaxText = await ajaxRes.text();
            embedSnippet += ` | Ajax(${rawAjaxPath}): ${ajaxText.slice(0, 250)}`;
            const extracted = parsePlayerHtml(ajaxText, embedOrigin);
            for (const ex of extracted) {
              if (ex.type === "hls" || ex.type === "mp4") {
                directStreams.push({
                  url: ex.url,
                  type: ex.type,
                  referer: iframeUrl
                });
              }
            }
          }
        }
      } catch (_) {}
    }
  } catch (err) {
    embedSnippet = `HopError: ${err.message}`;
  }

  return { directStreams, embedSnippet, embedCookies };
}

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
        const { directStreams, embedSnippet, embedCookies } =
          await resolveEmbedPage(item.url, postLink, baseDomain);
        if (embedSnippet) hopLog += `\n -> [Body]: ${embedSnippet}`;

        for (const ds of directStreams) {
          enrichedItems.push({
            url: ds.url,
            type: ds.type,
            referer: ds.referer || item.url,
            embedCookies,
            isDirectResolved: true
          });
        }
        enrichedItems.push({
          url: item.url,
          type: "iframe",
          referer: postLink,
          embedCookies,
          isDirectResolved: false
        });
      } else {
        enrichedItems.push({
          url: item.url,
          type: item.type,
          referer: postLink,
          embedCookies: "",
          isDirectResolved: true
        });
      }
    }

    return {
      items: enrichedItems,
      rawResponse: `${text.trim()}${hopLog}`
    };
  } catch (err) {
    return { items: [], rawResponse: `Error: ${err.message}` };
  }
}

// Bóc tách tổng số trang thực tế từ thanh phân trang WP-PageNavi ("Page 1 of 1,050" / "Last »")
function extractTotalPagesFromHtml(html = "", currentPage = 1) {
  let maxPage = currentPage;

  const ofMatch = html.match(
    /(?:Page|Trang)\s+\d+\s+(?:of|trên|của|\/)\s+([\d,.]+)/i
  );
  if (ofMatch && ofMatch[1]) {
    const num = parseInt(ofMatch[1].replace(/[,.]/g, ""), 10);
    if (!isNaN(num) && num > maxPage) {
      maxPage = num;
    }
  }

  const pageRegex = /\/page\/(\d+)\/?/gi;
  let m;
  while ((m = pageRegex.exec(html)) !== null) {
    const p = parseInt(m[1], 10);
    if (!isNaN(p) && p > maxPage && p < 500000) {
      maxPage = p;
    }
  }

  return Math.max(1, maxPage);
}

// Quét menu trên trang gốc và lưu vào bộ nhớ đệm navPathCache
function extractNavCategories(html = "", baseDomain = "", baseHost = "") {
  const categories = [];
  const seen = new Set();

  const navRegex =
    /<li[^>]*menu-item[^>]*>[\s\S]*?<a[^>]+href=(?:["']([^"']+)["']|([^\s>"']+))[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = navRegex.exec(html)) !== null) {
    try {
      const rawHref = m[1] || m[2] || "";
      const labelHtml = m[3] || "";
      const parsed = new URL(rawHref, baseDomain);
      const linkHost = parsed.hostname.replace(/^www\./, "").toLowerCase();
      if (linkHost !== baseHost && !linkHost.includes("viet69")) continue;

      const rawPath = parsed.pathname.replace(/^\/+|\/+$/g, "");
      if (!rawPath || rawPath.includes("wp-")) continue;

      const name = cleanText(labelHtml).replace(/\s*MỚI\s*$/i, "").trim();
      if (!name || name === "..." || seen.has(rawPath)) continue;
      seen.add(rawPath);

      const labelSlug = toSlugKey(name);
      const tailSlug = rawPath.split("/").pop();
      if (labelSlug) navPathCache.set(labelSlug, rawPath);
      if (tailSlug) navPathCache.set(tailSlug, rawPath);

      categories.push({
        name,
        slug: rawPath,
        isNew: /mới|new/i.test(labelHtml)
      });
    } catch (_) {}
  }

  return categories;
}

function extractThumbnailFromBlock(block = "") {
  const attrs = [
    "data-litespeed-src",
    "data-lazy-src",
    "data-original",
    "data-src",
    "poster",
    "src"
  ];
  for (const attr of attrs) {
    const regex = new RegExp(
      `\\b${attr}\\s*=\\s*(?:["']([^"']+)["']|([^\\s>"']+))`,
      "gi"
    );
    let m;
    while ((m = regex.exec(block)) !== null) {
      let val = (m[1] || m[2] || "").trim();
      if (!val || val.startsWith("data:") || val.includes("blank.gif")) {
        continue;
      }
      if (val.startsWith("//")) val = `https:${val}`;
      if (
        val.startsWith("http") &&
        /\.(?:jpg|jpeg|png|webp|gif|bmp|avif)/i.test(val)
      ) {
        return val;
      }
    }
  }
  return FALLBACK_THUMB;
}

// Bóc tách danh sách bài viết (hỗ trợ cả HTML đã bị LiteSpeed nén mất dấu ngoặc kép)
function parseVideoListHtml(
  html = "",
  baseDomain = "",
  baseHost = "",
  category = "all"
) {
  const items = [];
  const seen = new Set();

  const articleBlocks = html.match(/<article[\s\S]*?<\/article>/gi) || [];
  const blocks =
    articleBlocks.length > 0
      ? articleBlocks
      : html.split(
          /(?=<div[^>]+class=["']?[^"'>]*(?:post-|loop-video|video-item|clip-item|entry-item|item-video|col-video)[^"'>]*["']?)/i
        );

  for (const block of blocks) {
    // Quét tất cả thẻ <a> trong khối để chọn đúng link bài viết (không bị vướng link category/tag phụ)
    const aTagRegex =
      /<a\b[^>]*href\s*=\s*(?:["']([^"']+)["']|([^\s>"']+))[^>]*>/gi;
    let chosenUrl = null;
    let chosenATag = "";
    let am;

    while ((am = aTagRegex.exec(block)) !== null) {
      const rawHref = am[1] || am[2] || "";
      let parsedUrl;
      try {
        parsedUrl = new URL(rawHref, baseDomain);
      } catch (_) {
        continue;
      }

      const linkHost = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
      if (linkHost !== baseHost && !linkHost.includes("viet69")) continue;

      const pathname = parsedUrl.pathname;
      if (
        pathname === "/" ||
        pathname.includes("/category/") ||
        pathname.includes("/tag/") ||
        pathname.includes("/page/") ||
        pathname.includes("/author/") ||
        pathname.includes("/wp-") ||
        pathname.includes("/feed/")
      ) {
        continue;
      }

      chosenUrl = parsedUrl;
      chosenATag = am[0];
      break;
    }

    if (!chosenUrl) continue;

    const itemSlug = chosenUrl.pathname.replace(/^\/+|\/+$/g, "");
    if (!itemSlug || seen.has(itemSlug)) continue;
    seen.add(itemSlug);

    const titleFromA = chosenATag.match(/\btitle=["']([^"']+)["']/i);
    const titleMatch =
      titleFromA ||
      block.match(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/i) ||
      block.match(/\btitle=["']([^"']+)["']/i) ||
      block.match(/\balt=["']([^"']+)["']/i);

    const thumb = extractThumbnailFromBlock(block);

    const durationMatch = block.match(
      /<span[^>]*class=["']?[^"'>]*(?:duration|time|length)[^"'>]*["']?[^>]*>([\s\S]*?)<\/span>/i
    );
    const viewsMatch = block.match(
      /<span[^>]*class=["']?[^"'>]*(?:views|view-count)[^"'>]*["']?[^>]*>([\s\S]*?)<\/span>/i
    );

    items.push({
      id: itemSlug,
      slug: itemSlug,
      title: titleMatch
        ? cleanText(titleMatch[1]).replace(/\s*[-|–]\s*Viet69.*$/i, "")
        : itemSlug,
      category: category === "all" ? "movie" : category,
      thumbnail: thumb,
      thumb,
      poster: thumb,
      image: thumb,
      duration: durationMatch ? cleanText(durationMatch[1]) : "",
      views: viewsMatch ? cleanText(viewsMatch[1]) : ""
    });
  }

  return items;
}

// =====================================================================
// HÀM PROXY ĐA NĂNG (HỖ TRỢ CẢ GET VÀ POST CHO XHR/FETCH & HLS PLAYLIST)
// =====================================================================
async function handleRawProxy(req) {
  const sp = req.nextUrl.searchParams;
  const targetUrl = sp.get("url");
  const referer = sp.get("referer") || `${DEFAULT_DOMAIN}/`;
  const cookie = sp.get("cookie") || "";

  if (!targetUrl) {
    return new NextResponse("Missing url", { status: 400, headers: CORS });
  }

  try {
    const refOrigin = new URL(referer).origin;
    const method = (req.method || "GET").toUpperCase();

    const headers = {
      ...BROWSER_HEADERS,
      Origin: refOrigin,
      Referer: referer
    };

    const reqContentType = req.headers.get("content-type");
    if (reqContentType) headers["Content-Type"] = reqContentType;

    const reqWith = req.headers.get("x-requested-with");
    if (reqWith) headers["X-Requested-With"] = reqWith;
    else headers["X-Requested-With"] = "XMLHttpRequest";

    const rangeHeader = req.headers.get("range");
    if (rangeHeader) headers["Range"] = rangeHeader;

    if (cookie) headers["Cookie"] = cookie;

    const fetchOpts = { method, headers };
    if (method !== "GET" && method !== "HEAD") {
      const bodyBuf = await req.arrayBuffer();
      if (bodyBuf && bodyBuf.byteLength > 0) {
        fetchOpts.body = bodyBuf;
      }
    }

    const upstream = await fetchWithTimeout(targetUrl, fetchOpts, 9000);
    const contentType = (
      upstream.headers.get("content-type") || ""
    ).toLowerCase();
    const buffer = await upstream.arrayBuffer();
    const firstBytes = Buffer.from(buffer.slice(0, 16))
      .toString("utf-8")
      .trim();

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
                return `URI="/api/videos?rawProxy=1&url=${encodeURIComponent(abs)}&referer=${encodeURIComponent(referer)}"`;
              } catch (_) {
                return `URI="${uri}"`;
              }
            });
          }
          try {
            const abs = new URL(trimmed, targetUrl).toString();
            return `/api/videos?rawProxy=1&url=${encodeURIComponent(abs)}&referer=${encodeURIComponent(referer)}`;
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

    const resHeaders = {
      ...CORS,
      "Content-Type":
        upstream.headers.get("content-type") || "application/octet-stream",
      "Cache-Control": "public, max-age=300"
    };
    const contentRange = upstream.headers.get("content-range");
    if (contentRange) resHeaders["Content-Range"] = contentRange;

    return new NextResponse(buffer, {
      status: upstream.status,
      headers: resHeaders
    });
  } catch (err) {
    return new NextResponse(err.message, { status: 502, headers: CORS });
  }
}

export async function POST(req) {
  const sp = req.nextUrl.searchParams;
  if (sp.get("rawProxy") === "1" || sp.get("hlsProxy") === "1") {
    return handleRawProxy(req);
  }
  return NextResponse.json(
    { error: "method_not_allowed" },
    { status: 405, headers: CORS }
  );
}

export async function GET(req) {
  const sp = req.nextUrl.searchParams;

  // CHẾ ĐỘ A: PROXY LUỒNG DỮ LIỆU / XHR / HLS
  if (sp.get("rawProxy") === "1" || sp.get("hlsProxy") === "1") {
    return handleRawProxy(req);
  }

  // CHẾ ĐỘ B: PROXY TRANG NHÚNG IFRAME
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

      let embedCookies = "";
      const setCookie = upstream.headers.get("set-cookie");
      if (setCookie) {
        embedCookies = setCookie
          .split(/,(?=\s*[a-zA-Z0-9_-]+=)/)
          .map((c) => c.split(";")[0].trim())
          .join("; ");
      }

      let html = await upstream.text();
      const targetUrlObj = new URL(targetUrl);
      const targetOrigin = targetUrlObj.origin;

      html = html.replace(
        /\b(src|href)=["'](\/(?!\/)[^"']+)["']/gi,
        (_, attr, relPath) => {
          const abs = `${targetOrigin}${relPath}`;
          return `${attr}="/api/videos?rawProxy=1&url=${encodeURIComponent(abs)}&referer=${encodeURIComponent(targetUrl)}"`;
        }
      );

      const interceptorScript = `
        <style>html,body{margin:0!important;padding:0!important;width:100%!important;height:100%!important;overflow:hidden!important;background:#000!important;}</style>
        <script>
          (function() {
            var TARGET_URL = ${JSON.stringify(targetUrl)};
            var TARGET_ORIGIN = ${JSON.stringify(targetOrigin)};
            var TARGET_PATH = ${JSON.stringify(targetUrlObj.pathname + targetUrlObj.search)};
            var REFERER_URL = ${JSON.stringify(referer)};
            var COOKIE_STR = ${JSON.stringify(embedCookies)};
            var PROXY_ENDPOINT = window.location.origin + "/api/videos?rawProxy=1";

            try {
              history.replaceState(null, "", TARGET_PATH);
            } catch (e) {}

            try {
              Object.defineProperty(document, "referrer", {
                get: function() { return REFERER_URL; },
                configurable: true
              });
            } catch (e) {}

            function rewriteToProxy(rawUrl) {
              if (!rawUrl || typeof rawUrl !== "string") return rawUrl;
              if (
                rawUrl.indexOf("blob:") === 0 ||
                rawUrl.indexOf("data:") === 0 ||
                rawUrl.indexOf("/api/videos?") !== -1
              ) {
                return rawUrl;
              }
              var abs = rawUrl;
              try {
                if (rawUrl.indexOf("//") === 0) {
                  abs = "https:" + rawUrl;
                } else if (rawUrl.indexOf("/") === 0) {
                  abs = TARGET_ORIGIN + rawUrl;
                } else if (!/^https?:\\/\\//i.test(rawUrl)) {
                  abs = new URL(rawUrl, TARGET_URL).toString();
                }
              } catch (e) {}

              if (/googleapis\\.com|cloudflare\\.com|jsdelivr\\.net/i.test(abs)) {
                return abs;
              }

              return (
                PROXY_ENDPOINT +
                "&url=" + encodeURIComponent(abs) +
                "&referer=" + encodeURIComponent(TARGET_URL) +
                (COOKIE_STR ? "&cookie=" + encodeURIComponent(COOKIE_STR) : "")
              );
            }

            var origOpen = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function(method, url) {
              var args = Array.prototype.slice.call(arguments);
              args[1] = rewriteToProxy(String(url));
              return origOpen.apply(this, args);
            };

            if (window.fetch) {
              var origFetch = window.fetch;
              window.fetch = function(input, init) {
                if (typeof input === "string") {
                  input = rewriteToProxy(input);
                } else if (input && typeof input.url === "string") {
                  input = new Request(rewriteToProxy(input.url), input);
                }
                return origFetch.call(this, input, init);
              };
            }
          })();
        </script>
      `;

      if (/<head[^>]*>/i.test(html)) {
        html = html.replace(/<head[^>]*>/i, (m) => `${m}${interceptorScript}`);
      } else {
        html = `${interceptorScript}${html}`;
      }

      return new NextResponse(html, {
        status: 200,
        headers: {
          ...CORS,
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store"
        }
      });
    } catch (err) {
      return new NextResponse(err.message, { status: 502, headers: CORS });
    }
  }

  // CHẾ ĐỘ C: API LẤY VIDEO CHI TIẾT & DANH SÁCH THEO DANH MỤC / PHÂN TRANG
  const slug = sp.get("slug");
  const category = (sp.get("category") || "all").trim();
  const q = (sp.get("q") || "").trim();
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
  const per = siteConfig?.perPage || 20;

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
      const tags = [];
      const debugInfo = { baseDomain, wpStatus: 0, htmlVia: "none" };

      const { html: pageHtml, via, status: htmlStatus, cookies } =
        await fetchHtmlWithFallback(postLink, reqHeaders, true);
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

        const tagRegex =
          /<a[^>]+href=["']?https?:\/\/[^"'\s>]+\/(tag\/[^"'/\s>]+)\/?["']?[^>]*>([\s\S]*?)<\/a>/gi;
        const seenTags = new Set();
        let tm;
        while ((tm = tagRegex.exec(pageHtml)) !== null) {
          const tSlug = tm[1].replace(/^\/+|\/+$/g, "");
          const tName = cleanText(tm[2]);
          if (tName && !seenTags.has(tSlug)) {
            seenTags.add(tSlug);
            tags.push({ name: tName, slug: tSlug });
          }
        }

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
                const proxyStreamUrl = `/api/videos?rawProxy=1&url=${encodeURIComponent(mediaItem.url)}&referer=${encodeURIComponent(mediaItem.referer || postLink)}`;
                customSources.push({
                  label: `${srv.label} (VIP)`,
                  name: `${srv.label} (VIP)`,
                  url: proxyStreamUrl,
                  src: proxyStreamUrl,
                  rawUrl: mediaItem.url,
                  proxyUrl: proxyStreamUrl,
                  type: mediaItem.type
                });
              } else {
                allIframes.push(mediaItem.url);
                const proxyEmbedUrl = `/api/videos?embedProxy=1&url=${encodeURIComponent(mediaItem.url)}&referer=${encodeURIComponent(postLink)}`;
                customSources.push({
                  label: srv.label,
                  name: srv.label,
                  url: proxyEmbedUrl,
                  src: proxyEmbedUrl,
                  type: "iframe"
                });
                customSources.push({
                  label: `${srv.label} (Gốc)`,
                  name: `${srv.label} (Gốc)`,
                  url: mediaItem.url,
                  src: mediaItem.url,
                  type: "iframe"
                });
              }
            }
          });

          if (rawSnippets.length > 0) {
            debugInfo.playerSnippet = rawSnippets.join("\n\n");
          }
        }
      }

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
          tags,
          url: primaryUrl,
          src: primaryUrl,
          videoUrl: streams[0] || primaryUrl,
          hlsUrl: streams[0] || "",
          mp4Url: streams.find((s) => s.includes(".mp4")) || "",
          embedUrl: primaryUrl,
          iframe: primaryUrl,
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
  // TRƯỜNG HỢP 2: LẤY DANH SÁCH VIDEO THEO DANH MỤC / TÌM KIẾM / TRANG
  // =================================================================
  try {
    const cleanCat = category.replace(/^\/+|\/+$/g, "");
    const bareSlug = cleanCat.replace(/^(?:category|tag)\//i, "");
    const pageSuffix = page > 1 ? `page/${page}/` : "";

    // 1. Nếu có từ khóa tìm kiếm q hoặc ở trang chủ ("all")
    if (q || !cleanCat || cleanCat === "all" || cleanCat === "movie") {
      const targetUrl = q
        ? `${baseDomain}/${pageSuffix}?s=${encodeURIComponent(q)}`
        : `${baseDomain}/${pageSuffix}`;

      const { html } = await fetchHtmlWithFallback(targetUrl, reqHeaders, true);
      if (html) {
        const items = parseVideoListHtml(html, baseDomain, baseHost, cleanCat);
        const totalPages = extractTotalPagesFromHtml(html, page);
        const navCategories = extractNavCategories(html, baseDomain, baseHost);

        if (items.length > 0) {
          return NextResponse.json(
            {
              items,
              page,
              totalPages,
              total: totalPages * items.length,
              categories: navCategories
            },
            { headers: CORS }
          );
        }
      }
    } else {
      // 2. Khi người dùng bấm vào một Thẻ / Danh mục cụ thể
      const candidateUrls = new Set();

      // 2a. Ưu tiên đường dẫn thực tế đã học từ thanh menu của Viet69
      const cachedPath =
        navPathCache.get(cleanCat) || navPathCache.get(bareSlug);
      if (cachedPath) {
        candidateUrls.add(`${baseDomain}/${cachedPath}/${pageSuffix}`);
      }

      // 2b. Đường dẫn cấu hình sẵn trong CATEGORY_MAP
      const mapped = CATEGORY_MAP[bareSlug];
      if (mapped && Array.isArray(mapped.paths)) {
        for (const p of mapped.paths) {
          const cleanP = p.replace(/^\/+|\/+$/g, "");
          candidateUrls.add(
            cleanP
              ? `${baseDomain}/${cleanP}/${pageSuffix}`
              : `${baseDomain}/${pageSuffix}`
          );
        }
      }

      // 2c. Các cấu trúc chuẩn của WordPress (/tag/..., /category/..., /...)
      if (cleanCat.startsWith("tag/") || cleanCat.startsWith("category/")) {
        candidateUrls.add(`${baseDomain}/${cleanCat}/${pageSuffix}`);
      }
      candidateUrls.add(`${baseDomain}/tag/${bareSlug}/${pageSuffix}`);
      candidateUrls.add(`${baseDomain}/category/${bareSlug}/${pageSuffix}`);
      candidateUrls.add(`${baseDomain}/${bareSlug}/${pageSuffix}`);

      // 2d. Luôn kèm 1 nhánh tìm kiếm từ khóa dự phòng để đảm bảo 100% không bao giờ trống
      const fallbackKeyword =
        mapped?.keyword || bareSlug.replace(/-/g, " ");
      const searchFallbackUrl = `${baseDomain}/${pageSuffix}?s=${encodeURIComponent(fallbackKeyword)}`;

      // Chạy song song các đường dẫn ứng viên (không bật proxy cho link thử nghiệm để phản hồi dưới 1 giây)
      const urlList = [...candidateUrls].slice(0, 4);
      const parallelResults = await Promise.all(
        urlList.map(async (u) => {
          const { html } = await fetchHtmlWithFallback(u, reqHeaders, false);
          if (!html) return null;
          const items = parseVideoListHtml(
            html,
            baseDomain,
            baseHost,
            cleanCat
          );
          if (items.length === 0) return null;
          return {
            items,
            totalPages: extractTotalPagesFromHtml(html, page),
            categories: extractNavCategories(html, baseDomain, baseHost)
          };
        })
      );

      const validArchive = parallelResults.find((r) => r !== null);
      if (validArchive) {
        return NextResponse.json(
          {
            items: validArchive.items,
            page,
            totalPages: validArchive.totalPages,
            total: validArchive.totalPages * validArchive.items.length,
            categories: validArchive.categories
          },
          { headers: CORS }
        );
      }

      // 2e. Nếu danh mục đó không có trang archive riêng (như Video của thành viên), lấy ngay từ nhánh tìm kiếm
      const { html: searchHtml } = await fetchHtmlWithFallback(
        searchFallbackUrl,
        reqHeaders,
        true
      );
      if (searchHtml) {
        const sItems = parseVideoListHtml(
          searchHtml,
          baseDomain,
          baseHost,
          cleanCat
        );
        if (sItems.length > 0) {
          const sTotalPages = extractTotalPagesFromHtml(searchHtml, page);
          const sNav = extractNavCategories(searchHtml, baseDomain, baseHost);
          return NextResponse.json(
            {
              items: sItems,
              page,
              totalPages: sTotalPages,
              total: sTotalPages * sItems.length,
              categories: sNav
            },
            { headers: CORS }
          );
        }
      }
    }
  } catch (_) {}

  // Fallback cuối cùng: Dữ liệu JSON nội bộ
  const filtered = data.filter(
    (v) =>
      (category === "all" || v.category === category) &&
      (!q || v.title.toLowerCase().includes(q.toLowerCase()))
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / per));
  const items = filtered.slice((page - 1) * per, page * per);
  return NextResponse.json(
    { items, page, totalPages, total: filtered.length, categories: [] },
    { headers: CORS }
  );
}
