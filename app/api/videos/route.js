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

const FALLBACK_THUMB = "https://placehold.co/600x340/1e293b/94a3b8?text=Video";

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
      "bai-viet",
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

const navPathCache = new Map();
const sortParamCache = new Map();

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

function decodeSlug(raw = "") {
  let s = String(raw || "").trim();
  try {
    for (let i = 0; i < 3; i++) {
      if (!s.includes("%")) break;
      const dec = decodeURIComponent(s);
      if (dec === s) break;
      s = dec;
    }
  } catch (_) {}
  return s.replace(/^\/+|\/+$/g, "");
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

function parseStatNumber(val = "0") {
  const s = String(val).trim().toLowerCase().replace(/,/g, "");
  const num = parseFloat(s);
  if (isNaN(num)) return 0;
  if (s.endsWith("k")) return Math.round(num * 1000);
  if (s.endsWith("m")) return Math.round(num * 1000000);
  return Math.round(num);
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

// Bóc tách luồng video trực tiếp trong bài viết (dành cho bài đăng thành viên bai-viet/... không dùng nút video2-btn)
function extractDirectPostMedia(pageHtml = "", baseDomain = "", baseHost = "") {
  if (!pageHtml) return [];

  // Khoanh vùng phần thân bài viết để không bắt nhầm quảng cáo ở footer/sidebar
  const contentMatch =
    pageHtml.match(
      /<(?:article|div)[^>]*class=["']?[^"'>]*(?:entry-content|post-content|single-content|video-player|player-wrapper|content-area)[^"'>]*["']?[^>]*>[\s\S]*?<\/(?:article|div)>/i
    ) || pageHtml.match(/<article[\s\S]*?<\/article>/i);

  const scopeHtml = contentMatch ? contentMatch[0] : pageHtml;
  const rawItems = parsePlayerHtml(scopeHtml, baseDomain);

  return rawItems.filter((item) => {
    try {
      const u = new URL(item.url);
      const h = u.hostname.replace(/^www\./, "").toLowerCase();
      if (item.type === "hls" || item.type === "mp4") return true;
      // Nếu là iframe, không lấy nhầm trang bài viết thông thường của viet69
      if (h === baseHost || h.includes("viet69")) {
        return /(?:embed|player|play|video|stream|get\.)/i.test(
          u.pathname + u.search
        );
      }
      return true;
    } catch (_) {
      return false;
    }
  });
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
        addUrl(
          val,
          tagName === "iframe"
            ? "iframe"
            : tagName === "video" || tagName === "source"
            ? val.includes(".m3u8")
              ? "hls"
              : "mp4"
            : ""
        );
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
    addUrl(
      m[1],
      m[1].includes(".mp4") ? "mp4" : isHlsField ? "hls" : ""
    );
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

function learnSortParamsFromHtml(html = "") {
  const linkRegex =
    /<a\b[^>]*href=(?:["']([^"']+)["']|([^\s>"']+))[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = linkRegex.exec(html)) !== null) {
    const href = m[1] || m[2] || "";
    const text = cleanText(m[3]).toLowerCase();
    if (!href.includes("?")) continue;
    const qs = href.split("?")[1]?.split("#")[0] || "";
    if (!qs) continue;

    if (text === "mới nhất") sortParamCache.set("latest", qs);
    else if (text === "lượt xem") sortParamCache.set("views", qs);
    else if (text === "lượt thích") sortParamCache.set("likes", qs);
    else if (text === "bình luận") sortParamCache.set("comments", qs);
  }
}

function getSortQueryString(sortBy = "latest") {
  if (!sortBy || sortBy === "latest") {
    return sortParamCache.get("latest") || "";
  }
  if (sortParamCache.has(sortBy)) {
    return sortParamCache.get(sortBy);
  }
  const defaults = {
    views: "orderby=views&filter=most-viewed",
    likes: "orderby=likes&filter=popular",
    comments: "orderby=comment_count&filter=comments"
  };
  return defaults[sortBy] || "";
}

function extractNavCategories(html = "", baseDomain = "", baseHost = "") {
  learnSortParamsFromHtml(html);
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

function extractStatsFromBlock(block = "") {
  const iconNumbers = [];
  const afterIconRegex =
    /(?:<\/svg>|<\/i>)\s*(?:<span[^>]*>)?\s*(\d[\d,.]*[kKmM]?)\b/gi;
  let m;
  while ((m = afterIconRegex.exec(block)) !== null) {
    iconNumbers.push(m[1]);
  }
  if (iconNumbers.length >= 3) {
    return {
      views: iconNumbers[0],
      comments: iconNumbers[1],
      likes: iconNumbers[2]
    };
  }

  const tailPart = block.slice(Math.floor(block.length * 0.45));
  const standaloneNums = [];
  const spanNumRegex = />\s*(\d[\d,.]*[kKmM]?)\s*</g;
  while ((m = spanNumRegex.exec(tailPart)) !== null) {
    standaloneNums.push(m[1]);
  }
  if (standaloneNums.length >= 3) {
    const lastThree = standaloneNums.slice(-3);
    return {
      views: lastThree[0],
      comments: lastThree[1],
      likes: lastThree[2]
    };
  }

  return {
    views: standaloneNums[0] || "0",
    comments: standaloneNums[1] || "0",
    likes: standaloneNums[2] || "0"
  };
}

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
    const stats = extractStatsFromBlock(block);

    const durationMatch = block.match(
      /<span[^>]*class=["']?[^"'>]*(?:duration|time|length)[^"'>]*["']?[^>]*>([\s\S]*?)<\/span>/i
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
      views: stats.views,
      comments: stats.comments,
      likes: stats.likes
    });
  }

  return items;
}

function sortVideoItems(items = [], sortBy = "latest") {
  if (!sortBy || sortBy === "latest") return items;
  const copy = [...items];
  if (sortBy === "views") {
    copy.sort((a, b) => parseStatNumber(b.views) - parseStatNumber(a.views));
  } else if (sortBy === "likes") {
    copy.sort((a, b) => parseStatNumber(b.likes) - parseStatNumber(a.likes));
  } else if (sortBy === "comments") {
    copy.sort(
      (a, b) => parseStatNumber(b.comments) - parseStatNumber(a.comments)
    );
  }
  return copy;
}

// =====================================================================
// HÀM PROXY LUỒNG DỮ LIỆU / HLS (.m3u8 / .ts / AJAX)
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

    const upstream = await fetchWithTimeout(targetUrl, fetchOpts, 9500);
    const finalTargetUrl = upstream.url || targetUrl;
    const contentType = (
      upstream.headers.get("content-type") || ""
    ).toLowerCase();
    const contentLength = parseInt(
      upstream.headers.get("content-length") || "0",
      10
    );

    const mightBeM3u8 =
      contentType.includes("mpegurl") ||
      contentType.includes("text") ||
      finalTargetUrl.includes(".m3u8") ||
      finalTargetUrl.includes("playlist") ||
      finalTargetUrl.includes("master") ||
      (contentLength > 0 && contentLength < 250000);

    // Nếu là phân đoạn video lớn (.ts / .mp4), truyền luồng trực tiếp (streaming) để phát mượt không nghẽn bộ nhớ
    if (!mightBeM3u8 && upstream.body) {
      const streamHeaders = {
        ...CORS,
        "Content-Type":
          upstream.headers.get("content-type") || "video/mp2t",
        "Cache-Control": "public, max-age=3600"
      };
      const contentRange = upstream.headers.get("content-range");
      if (contentRange) streamHeaders["Content-Range"] = contentRange;
      const acceptRanges = upstream.headers.get("accept-ranges");
      if (acceptRanges) streamHeaders["Accept-Ranges"] = acceptRanges;

      return new NextResponse(upstream.body, {
        status: upstream.status,
        headers: streamHeaders
      });
    }

    const buffer = await upstream.arrayBuffer();
    const firstBytes = Buffer.from(buffer.slice(0, 16))
      .toString("utf-8")
      .trim();

    if (
      firstBytes.startsWith("#EXTM3U") ||
      contentType.includes("mpegurl") ||
      finalTargetUrl.includes(".m3u8")
    ) {
      const selfOrigin = req.nextUrl.origin;
      const buildProxyUrl = (absUrl) =>
        `${selfOrigin}/api/videos?rawProxy=1&url=${encodeURIComponent(absUrl)}&referer=${encodeURIComponent(referer)}${
          cookie ? `&cookie=${encodeURIComponent(cookie)}` : ""
        }`;

      const text = Buffer.from(buffer).toString("utf-8");
      const rewritten = text
        .split(/\r?\n/)
        .map((line) => {
          const trimmed = line.trim();
          if (!trimmed) return line;
          if (trimmed.startsWith("#")) {
            return line.replace(/URI=["']([^"']+)["']/gi, (_, uri) => {
              try {
                const abs = new URL(uri, finalTargetUrl).toString();
                return `URI="${buildProxyUrl(abs)}"`;
              } catch (_) {
                return `URI="${uri}"`;
              }
            });
          }
          try {
            const abs = new URL(trimmed, finalTargetUrl).toString();
            return buildProxyUrl(abs);
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

  // CHẾ ĐỘ A2: PROXY FILE SCRIPT CỦA TRANG NHÚNG (BỌC TRONG SANDBOX CHỐNG REDIRECT 404)
  if (sp.get("scriptProxy") === "1") {
    const targetUrl = sp.get("url");
    const referer = sp.get("referer") || `${DEFAULT_DOMAIN}/`;
    if (!targetUrl) {
      return new NextResponse("// missing url", {
        status: 200,
        headers: { ...CORS, "Content-Type": "application/javascript" }
      });
    }
    try {
      const res = await fetchWithTimeout(
        targetUrl,
        { headers: { ...BROWSER_HEADERS, Referer: referer } },
        7000
      );
      let js = await res.text();
      js = js.replace(/["']use strict["']\s*;?/g, "");
      const wrapped = `\nif (window.__sandboxScope) {\n  with (window.__sandboxScope) {\n${js}\n  }\n} else {\n${js}\n}\n`;
      return new NextResponse(wrapped, {
        status: 200,
        headers: {
          ...CORS,
          "Content-Type": "application/javascript; charset=utf-8",
          "Cache-Control": "no-store"
        }
      });
    } catch (_) {
      return new NextResponse("// script error", {
        status: 200,
        headers: { ...CORS, "Content-Type": "application/javascript" }
      });
    }
  }

  // CHẾ ĐỘ B: PROXY TRANG NHÚNG IFRAME (CHẶN ĐỨNG CHUYỂN HƯỚNG 404 & GIẢ LẬP DOMAIN)
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
      const targetHost = targetUrlObj.host;
      const targetHostname = targetUrlObj.hostname;

      let refUrlObj;
      try {
        refUrlObj = new URL(referer);
      } catch (_) {
        refUrlObj = new URL(DEFAULT_DOMAIN);
      }

      // Xóa mọi thẻ <meta http-equiv="refresh"> nếu có
      html = html.replace(/<meta[^>]+http-equiv=["']?refresh["']?[^>]*>/gi, "");

      // Bọc tất cả các thẻ <script> nội tuyến trong `with (window.__sandboxScope)` để khóa mọi lệnh redirect location
      html = html.replace(
        /<script\b([^>]*)>([\s\S]*?)<\/script>/gi,
        (fullTag, attrs, body) => {
          const srcMatch = attrs.match(
            /\bsrc\s*=\s*(?:["']([^"']+)["']|([^\s>"']+))/i
          );
          if (srcMatch) {
            const rawSrc = srcMatch[1] || srcMatch[2] || "";
            if (
              /googleapis\.com|cloudflare\.com|jsdelivr\.net|jquery|plyr|hls\.js|hls\.min\.js/i.test(
                rawSrc
              )
            ) {
              return fullTag;
            }
            try {
              const absSrc = new URL(rawSrc, targetUrl).toString();
              const proxiedSrc = `/api/videos?scriptProxy=1&url=${encodeURIComponent(absSrc)}&referer=${encodeURIComponent(targetUrl)}`;
              return `<script src="${proxiedSrc}"></script>`;
            } catch (_) {
              return fullTag;
            }
          }
          const cleanBody = body.replace(/["']use strict["']\s*;?/g, "");
          if (!cleanBody.trim()) return fullTag;
          return `<script${attrs}>\nif (window.__sandboxScope) {\n  with (window.__sandboxScope) {\n${cleanBody}\n  }\n}\n</script>`;
        }
      );

      // Chuyển các đường dẫn tài nguyên tĩnh tương đối (/...) sang rawProxy
      html = html.replace(
        /\b(src|href)=["'](\/(?!\/|api\/videos)[^"']+)["']/gi,
        (_, attr, relPath) => {
          const abs = `${targetOrigin}${relPath}`;
          return `${attr}="/api/videos?rawProxy=1&url=${encodeURIComponent(abs)}&referer=${encodeURIComponent(targetUrl)}"`;
        }
      );

      // Tiêm môi trường ảo hóa __sandboxScope (KHÔNG dùng history.replaceState làm hỏng URL thật)
      const interceptorScript = `
        <style>html,body{margin:0!important;padding:0!important;width:100%!important;height:100%!important;overflow:hidden!important;background:#000!important;}</style>
        <script>
          (function() {
            var TARGET_URL = ${JSON.stringify(targetUrl)};
            var TARGET_ORIGIN = ${JSON.stringify(targetOrigin)};
            var TARGET_HOST = ${JSON.stringify(targetHost)};
            var TARGET_HOSTNAME = ${JSON.stringify(targetHostname)};
            var TARGET_PATHNAME = ${JSON.stringify(targetUrlObj.pathname)};
            var TARGET_SEARCH = ${JSON.stringify(targetUrlObj.search || "")};

            var REF_URL = ${JSON.stringify(refUrlObj.toString())};
            var REF_ORIGIN = ${JSON.stringify(refUrlObj.origin)};
            var REF_HOST = ${JSON.stringify(refUrlObj.host)};
            var REF_HOSTNAME = ${JSON.stringify(refUrlObj.hostname)};
            var REF_PATHNAME = ${JSON.stringify(refUrlObj.pathname)};

            var COOKIE_STR = ${JSON.stringify(embedCookies)};
            var PROXY_ENDPOINT = window.location.origin + "/api/videos?rawProxy=1";

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
            window.__rewriteToProxy = rewriteToProxy;

            // 1. Ảo hóa Location của trang nhúng (emb.cd-vs.com) và chặn mọi lệnh redirect sang 404
            var fakeLoc = {
              get href() { return TARGET_URL; },
              set href(v) {},
              get origin() { return TARGET_ORIGIN; },
              get protocol() { return "https:"; },
              get host() { return TARGET_HOST; },
              get hostname() { return TARGET_HOSTNAME; },
              get port() { return ""; },
              get pathname() { return TARGET_PATHNAME; },
              get search() { return TARGET_SEARCH; },
              get hash() { return ""; },
              assign: function() {},
              replace: function() {},
              reload: function() {},
              toString: function() { return TARGET_URL; }
            };

            // 2. Ảo hóa Location của trang cha (viet69.be)
            var fakeTopLoc = {
              get href() { return REF_URL; },
              set href(v) {},
              get origin() { return REF_ORIGIN; },
              get protocol() { return "https:"; },
              get host() { return REF_HOST; },
              get hostname() { return REF_HOSTNAME; },
              get pathname() { return REF_PATHNAME; },
              assign: function() {},
              replace: function() {},
              reload: function() {},
              toString: function() { return REF_URL; }
            };

            var fakeHist = {
              pushState: function() {},
              replaceState: function() {},
              go: function() {},
              back: function() {},
              forward: function() {}
            };

            try {
              Object.defineProperty(document, "referrer", {
                get: function() { return REF_URL; },
                configurable: true
              });
              Object.defineProperty(document, "domain", {
                get: function() { return TARGET_HOSTNAME; },
                set: function() {},
                configurable: true
              });
            } catch (e) {}

            var fakeDoc = new Proxy(document, {
              get: function(target, prop) {
                if (prop === "location") return fakeLoc;
                if (prop === "referrer") return REF_URL;
                if (prop === "domain") return TARGET_HOSTNAME;
                if (prop === "URL" || prop === "documentURI") return TARGET_URL;
                var val = target[prop];
                return typeof val === "function" ? val.bind(target) : val;
              },
              set: function(target, prop, value) {
                if (prop === "location" || prop === "domain") return true;
                target[prop] = value;
                return true;
              }
            });

            var fakeTop = null;
            var fakeWin = new Proxy(window, {
              get: function(target, prop) {
                if (prop === "location") return fakeLoc;
                if (prop === "document") return fakeDoc;
                if (prop === "history") return fakeHist;
                if (prop === "window" || prop === "self" || prop === "globalThis") return fakeWin;
                if (prop === "top" || prop === "parent") return fakeTop;
                if (prop === "origin") return TARGET_ORIGIN;
                var val = target[prop];
                return typeof val === "function" ? val.bind(target) : val;
              },
              set: function(target, prop, value) {
                if (prop === "location") return true;
                target[prop] = value;
                return true;
              }
            });

            fakeTop = new Proxy(window, {
              get: function(target, prop) {
                if (prop === "location") return fakeTopLoc;
                if (prop === "window" || prop === "self" || prop === "top" || prop === "parent") return fakeTop;
                var val = target[prop];
                return typeof val === "function" ? val.bind(target) : val;
              },
              set: function(target, prop, value) {
                if (prop === "location") return true;
                return true;
              }
            });

            window.__fakeLoc = fakeLoc;
            window.__fakeTopLoc = fakeTopLoc;
            window.__fakeDoc = fakeDoc;
            window.__fakeWin = fakeWin;
            window.__fakeTop = fakeTop;
            window.__fakeHist = fakeHist;

            window.__sandboxScope = {
              get window() { return fakeWin; },
              set window(v) {},
              get self() { return fakeWin; },
              set self(v) {},
              get top() { return fakeTop; },
              set top(v) {},
              get parent() { return fakeTop; },
              set parent(v) {},
              get globalThis() { return fakeWin; },
              set globalThis(v) {},
              get document() { return fakeDoc; },
              set document(v) {},
              get location() { return fakeLoc; },
              set location(v) {},
              get history() { return fakeHist; },
              set history(v) {}
            };

            // 3. Chặn tạo thẻ <a> ẩn để click chuyển hướng
            try {
              HTMLAnchorElement.prototype.click = function() {};
              HTMLFormElement.prototype.submit = function() {};
              window.open = function() { return null; };
              window.addEventListener("click", function(e) {
                var a = e.target && e.target.closest ? e.target.closest("a") : null;
                if (a) {
                  e.preventDefault();
                  e.stopPropagation();
                }
              }, true);
            } catch (e) {}

            // 4. Bắt mọi request XHR & Fetch qua Proxy
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

            // 5. Ép Hls.js chạy trên luồng chính (enableWorker: false) để không bị rớt kết nối sau vài giây
            var _OrigHls = window.Hls;
            function wrapHlsClass(HlsClass) {
              if (typeof HlsClass !== "function" || HlsClass.__wrapped) return HlsClass;
              var Wrapped = function(cfg) {
                var merged = Object.assign({}, cfg || {}, { enableWorker: false });
                return new HlsClass(merged);
              };
              Object.assign(Wrapped, HlsClass);
              Wrapped.prototype = HlsClass.prototype;
              Wrapped.__wrapped = true;
              if (HlsClass.prototype && HlsClass.prototype.loadSource) {
                var origLoad = HlsClass.prototype.loadSource;
                HlsClass.prototype.loadSource = function(src) {
                  return origLoad.call(this, rewriteToProxy(String(src)));
                };
              }
              return Wrapped;
            }
            if (_OrigHls) {
              _OrigHls = wrapHlsClass(_OrigHls);
            }
            try {
              Object.defineProperty(window, "Hls", {
                configurable: true,
                enumerable: true,
                get: function() { return _OrigHls; },
                set: function(val) { _OrigHls = wrapHlsClass(val); }
              });
            } catch (e) {}
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

  // CHẾ ĐỘ C: API LẤY VIDEO CHI TIẾT & DANH SÁCH
  const rawSlugParam = sp.get("slug");
  const category = (sp.get("category") || "all").trim();
  const sortBy = (sp.get("sort") || "latest").trim();
  const q = (sp.get("q") || "").trim();
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
  const per = siteConfig?.perPage || 20;

  if (category === "demo") {
    if (rawSlugParam) {
      const v = data.find((x) => x.slug === rawSlugParam);
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
  // TRƯỜNG HỢP 1: LẤY CHI TIẾT VIDEO THEO SLUG (KỂ CẢ bai-viet/...)
  // =================================================================
  if (rawSlugParam) {
    const cleanSlug = decodeSlug(rawSlugParam);
    const localVideo = data.find(
      (x) => x.slug === cleanSlug || x.slug === rawSlugParam
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

        // 1. Kiểm tra các nút Server (.video2-btn / .movieLoader)
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

        // 2. Nếu bài viết (như mục Video của thành viên bai-viet/...) nhúng trực tiếp <video> hoặc <iframe> trong bài
        if (customSources.length === 0) {
          const directItems = extractDirectPostMedia(
            pageHtml,
            baseDomain,
            baseHost
          );
          for (let i = 0; i < directItems.length; i++) {
            const dItem = directItems[i];
            const srvLabel = `Server #${i + 1}`;
            if (dItem.type === "hls" || dItem.type === "mp4") {
              allStreams.push(dItem.url);
              const proxyStreamUrl = `/api/videos?rawProxy=1&url=${encodeURIComponent(dItem.url)}&referer=${encodeURIComponent(postLink)}`;
              customSources.push({
                label: srvLabel,
                name: srvLabel,
                url: dItem.url,
                src: dItem.url,
                proxyUrl: proxyStreamUrl,
                type: dItem.type
              });
              customSources.push({
                label: `${srvLabel} (Proxy)`,
                name: `${srvLabel} (Proxy)`,
                url: proxyStreamUrl,
                src: proxyStreamUrl,
                type: dItem.type
              });
            } else {
              allIframes.push(dItem.url);
              const proxyEmbedUrl = `/api/videos?embedProxy=1&url=${encodeURIComponent(dItem.url)}&referer=${encodeURIComponent(postLink)}`;
              customSources.push({
                label: srvLabel,
                name: srvLabel,
                url: proxyEmbedUrl,
                src: proxyEmbedUrl,
                type: "iframe"
              });
              customSources.push({
                label: `${srvLabel} (Gốc)`,
                name: `${srvLabel} (Gốc)`,
                url: dItem.url,
                src: dItem.url,
                type: "iframe"
              });
            }
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

  // TRƯỜNG HỢP 2: LẤY DANH SÁCH VIDEO THEO DANH MỤC / TÌM KIẾM / SẮP XẾP / TRANG
  try {
    const cleanCat = decodeSlug(category);
    const bareSlug = cleanCat.replace(/^(?:category|tag)\//i, "");
    const pageSuffix = page > 1 ? `page/${page}/` : "";
    const sortQuery = getSortQueryString(sortBy);

    const appendSort = (baseUrl) => {
      if (!sortQuery) return baseUrl;
      return `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}${sortQuery}`;
    };

    if (q || !cleanCat || cleanCat === "all" || cleanCat === "movie") {
      const baseTarget = q
        ? `${baseDomain}/${pageSuffix}?s=${encodeURIComponent(q)}`
        : `${baseDomain}/${pageSuffix}`;
      const targetUrl = appendSort(baseTarget);

      const { html } = await fetchHtmlWithFallback(targetUrl, reqHeaders, true);
      if (html) {
        const rawItems = parseVideoListHtml(
          html,
          baseDomain,
          baseHost,
          cleanCat
        );
        const items = sortVideoItems(rawItems, sortBy);
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
      const candidateUrls = new Set();

      const cachedPath =
        navPathCache.get(cleanCat) || navPathCache.get(bareSlug);
      if (cachedPath) {
        candidateUrls.add(
          appendSort(`${baseDomain}/${cachedPath}/${pageSuffix}`)
        );
      }

      const mapped = CATEGORY_MAP[bareSlug];
      if (mapped && Array.isArray(mapped.paths)) {
        for (const p of mapped.paths) {
          const cleanP = p.replace(/^\/+|\/+$/g, "");
          candidateUrls.add(
            appendSort(
              cleanP
                ? `${baseDomain}/${cleanP}/${pageSuffix}`
                : `${baseDomain}/${pageSuffix}`
            )
          );
        }
      }

      if (cleanCat.startsWith("tag/") || cleanCat.startsWith("category/")) {
        candidateUrls.add(
          appendSort(`${baseDomain}/${cleanCat}/${pageSuffix}`)
        );
      }
      candidateUrls.add(
        appendSort(`${baseDomain}/tag/${bareSlug}/${pageSuffix}`)
      );
      candidateUrls.add(
        appendSort(`${baseDomain}/category/${bareSlug}/${pageSuffix}`)
      );
      candidateUrls.add(appendSort(`${baseDomain}/${bareSlug}/${pageSuffix}`));

      const fallbackKeyword =
        mapped?.keyword || bareSlug.replace(/-/g, " ");
      const searchFallbackUrl = appendSort(
        `${baseDomain}/${pageSuffix}?s=${encodeURIComponent(fallbackKeyword)}`
      );

      const urlList = [...candidateUrls].slice(0, 4);
      const parallelResults = await Promise.all(
        urlList.map(async (u) => {
          const { html } = await fetchHtmlWithFallback(u, reqHeaders, false);
          if (!html) return null;
          const rawItems = parseVideoListHtml(
            html,
            baseDomain,
            baseHost,
            cleanCat
          );
          if (rawItems.length === 0) return null;
          return {
            items: sortVideoItems(rawItems, sortBy),
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

      const { html: searchHtml } = await fetchHtmlWithFallback(
        searchFallbackUrl,
        reqHeaders,
        true
      );
      if (searchHtml) {
        const sItems = sortVideoItems(
          parseVideoListHtml(searchHtml, baseDomain, baseHost, cleanCat),
          sortBy
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
