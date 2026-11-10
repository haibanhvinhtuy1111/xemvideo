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

const DIRECT_IFRAME_HOSTS = [
  "hydrax",
  "abyss",
  "short.ink",
  "helvid",
  "dood",
  "d000d",
  "ds2play",
  "ok.ru",
  "odnoklassniki",
  "streamtape",
  "voe.sx",
  "filemoon",
  "streamwish",
  "lulustream",
  "vidoza",
  "upstream",
  "mixdrop",
  "blogger.com",
  "blogspot.com",
  "youtube.com",
  "youtu.be",
  "vimeo.com",
  "dailymotion.com",
  "spankbang",
  "xvideos",
  "xnxx",
  "pornhub"
];

const PROXY_PREFERRED_HOSTS = [
  "cd-vs.com",
  "vhstream",
  "goostream",
  "viet69",
  "69vn"
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
  if (!html || html.length < 400) return true;
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
    if (!/^[A-Za-z0-9+/=_-]+$/.test(cleaned)) return "";
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

function executeEmbedScriptInVm(
  scriptCode = "",
  iframeUrl = "",
  refererUrl = "",
  knownVideoId = ""
) {
  const captured = {
    scriptUrls: [],
    ajaxRequests: [],
    mediaUrls: [],
    deobfuscatedText: scriptCode
  };
  if (!scriptCode || !scriptCode.trim()) return captured;

  try {
    const urlObj = new URL(iframeUrl || "https://emb.cd-vs.com");
    let refObj;
    try {
      refObj = new URL(refererUrl || DEFAULT_DOMAIN);
    } catch (_) {
      refObj = new URL(DEFAULT_DOMAIN);
    }

    const recordUrl = (u, kind = "media") => {
      if (!u || typeof u !== "string") return;
      try {
        const abs = new URL(u, iframeUrl).toString();
        if (kind === "script") captured.scriptUrls.push(abs);
        else if (kind === "ajax")
          captured.ajaxRequests.push({ url: abs, method: "GET" });
        else captured.mediaUrls.push(abs);
      } catch (_) {}
    };

    const makeEl = (tag) => {
      const el = {
        tagName: String(tag || "DIV").toUpperCase(),
        style: {},
        dataset: {},
        setAttribute(k, v) {
          this[k] = v;
          if (k === "src" || k === "href" || k === "data-src") {
            recordUrl(
              String(v),
              this.tagName === "SCRIPT" ? "script" : "media"
            );
          }
        },
        getAttribute(k) {
          return this[k] || "";
        },
        appendChild(child) {
          if (child && child.src) {
            recordUrl(
              String(child.src),
              child.tagName === "SCRIPT" ? "script" : "media"
            );
          }
          if (child && typeof child.onload === "function") {
            try {
              child.onload();
            } catch (_) {}
          }
          return child;
        },
        addEventListener(evt, fn) {
          if (evt === "load" && typeof fn === "function") {
            this.onload = fn;
          }
        }
      };
      return new Proxy(el, {
        set(target, prop, val) {
          target[prop] = val;
          if (prop === "src" || prop === "file") {
            recordUrl(
              String(val),
              target.tagName === "SCRIPT" ? "script" : "media"
            );
          }
          if (prop === "onload" && typeof val === "function" && target.src) {
            try {
              val();
            } catch (_) {}
          }
          return true;
        }
      });
    };

    const headMock = makeEl("HEAD");
    const bodyMock = makeEl("BODY");

    const jqMock = function () {
      return {
        ready(fn) {
          if (typeof fn === "function") {
            try {
              fn();
            } catch (_) {}
          }
        },
        on() {
          return this;
        },
        attr() {
          return "";
        },
        html() {
          return this;
        },
        find() {
          return this;
        }
      };
    };
    jqMock.ajax = (opts) => {
      if (opts && opts.url) {
        try {
          const abs = new URL(opts.url, iframeUrl).toString();
          captured.ajaxRequests.push({
            url: abs,
            method: (opts.type || opts.method || "GET").toUpperCase(),
            data: opts.data || null,
            headers: opts.headers || {}
          });
        } catch (_) {}
      }
      return {
        done() {
          return this;
        },
        fail() {
          return this;
        }
      };
    };
    jqMock.post = (url, data) => jqMock.ajax({ url, type: "POST", data });
    jqMock.get = (url, data) => jqMock.ajax({ url, type: "GET", data });
    jqMock.getJSON = jqMock.get;
    jqMock.getScript = (url) => recordUrl(url, "script");

    const sandbox = {
      videoId: knownVideoId || "",
      console: { log() {}, warn() {}, error() {}, info() {} },
      atob: (b) => decodeBase64Safe(b),
      btoa: (s) => Buffer.from(String(s), "utf-8").toString("base64"),
      setTimeout: (fn) => {
        if (typeof fn === "function") {
          try {
            fn();
          } catch (_) {}
        }
        return 1;
      },
      clearTimeout() {},
      setInterval: () => 1,
      clearInterval() {},
      location: {
        href: iframeUrl,
        origin: urlObj.origin,
        host: urlObj.host,
        hostname: urlObj.hostname,
        pathname: urlObj.pathname,
        search: urlObj.search,
        protocol: "https:",
        assign() {},
        replace() {},
        reload() {}
      },
      document: {
        referrer: refererUrl || `${DEFAULT_DOMAIN}/`,
        domain: urlObj.hostname,
        URL: iframeUrl,
        head: headMock,
        body: bodyMock,
        documentElement: makeEl("HTML"),
        createElement: (tag) => makeEl(tag),
        getElementById: () => makeEl("VIDEO"),
        querySelector: () => makeEl("VIDEO"),
        querySelectorAll: () => [makeEl("VIDEO")],
        getElementsByTagName: (t) =>
          String(t).toLowerCase() === "head" ? [headMock] : [bodyMock],
        addEventListener: (evt, fn) => {
          if (
            (evt === "DOMContentLoaded" || evt === "load") &&
            typeof fn === "function"
          ) {
            try {
              fn();
            } catch (_) {}
          }
        }
      },
      navigator: {
        userAgent: BROWSER_HEADERS["User-Agent"],
        language: "vi-VN",
        webdriver: false
      },
      fetch: (u, init = {}) => {
        try {
          const abs = new URL(
            typeof u === "string" ? u : u.url,
            iframeUrl
          ).toString();
          captured.ajaxRequests.push({
            url: abs,
            method: (init.method || "GET").toUpperCase(),
            data: init.body || null,
            headers: init.headers || {}
          });
        } catch (_) {}
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
          text: () => Promise.resolve("")
        });
      },
      XMLHttpRequest: function () {
        let reqUrl = "";
        let reqMethod = "GET";
        const reqHeaders = {};
        this.open = (m, u) => {
          reqMethod = m || "GET";
          reqUrl = u || "";
        };
        this.setRequestHeader = (k, v) => {
          reqHeaders[k] = v;
        };
        this.send = (body) => {
          if (reqUrl) {
            try {
              const abs = new URL(reqUrl, iframeUrl).toString();
              captured.ajaxRequests.push({
                url: abs,
                method: reqMethod.toUpperCase(),
                data: body || null,
                headers: reqHeaders
              });
            } catch (_) {}
          }
        };
      },
      Plyr: function () {
        return { on() {} };
      },
      Hls: function () {
        this.loadSource = (u) => recordUrl(u, "media");
        this.attachMedia = () => {};
        this.on = () => {};
      },
      jwplayer: () => ({
        setup(cfg) {
          if (cfg && cfg.file) recordUrl(cfg.file, "media");
          return this;
        },
        on() {
          return this;
        }
      }),
      jQuery: jqMock,
      $: jqMock,
      Promise,
      String,
      Number,
      Boolean,
      Array,
      Object,
      Math,
      Date,
      RegExp,
      JSON,
      Error,
      TypeError,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      encodeURIComponent,
      decodeURIComponent,
      encodeURI,
      decodeURI,
      Uint8Array
    };

    sandbox.window = sandbox;
    sandbox.self = sandbox;
    sandbox.globalThis = sandbox;
    sandbox.top = {
      location: {
        href: refObj.toString(),
        origin: refObj.origin,
        host: refObj.host,
        hostname: refObj.hostname
      }
    };
    sandbox.parent = sandbox.top;
    sandbox.Hls.isSupported = () => true;

    const ctx = vm.createContext(sandbox);
    try {
      vm.runInContext(scriptCode, ctx, { timeout: 900 });
    } catch (_) {}

    const aliasMap = {};
    const aliasRegex =
      /\b([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*([A-Za-z_$][A-Za-z0-9_$]*)\b/g;
    let am;
    while ((am = aliasRegex.exec(scriptCode)) !== null) {
      aliasMap[am[1]] = am[2];
    }

    const resolveFn = (name) => {
      let cur = name;
      for (let i = 0; i < 6; i++) {
        if (typeof sandbox[cur] === "function") return sandbox[cur];
        if (aliasMap[cur] && aliasMap[cur] !== cur) cur = aliasMap[cur];
        else break;
      }
      return null;
    };

    captured.deobfuscatedText = scriptCode.replace(
      /\b([A-Za-z_$][A-Za-z0-9_$]*)\(\s*(0x[a-f0-9]+|\d{2,5})\s*\)/gi,
      (full, fnName, argStr) => {
        if (
          fnName === "parseInt" ||
          fnName === "setTimeout" ||
          fnName === "setInterval" ||
          fnName === "Number" ||
          fnName === "String"
        ) {
          return full;
        }
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
  } catch (_) {}

  return captured;
}

function isStaticAsset(url = "") {
  const clean = url.split("?")[0].toLowerCase();
  if (
    clean.endsWith(".m3u8") ||
    clean.endsWith(".mp4") ||
    clean.endsWith(".webm") ||
    clean.endsWith(".mov") ||
    clean.endsWith(".mkv")
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

function shouldUseDirectIframe(url = "") {
  const lower = url.toLowerCase();
  if (DIRECT_IFRAME_HOSTS.some((h) => lower.includes(h))) return true;
  if (PROXY_PREFERRED_HOSTS.some((h) => lower.includes(h))) return false;
  return true;
}

function extractViet69Servers(html = "") {
  const servers = [];
  const seen = new Set();

  const btnRegex =
    /<(?:button|a|li|span)[^>]*class=["']?[^"'>]*(?:video2-btn|server-btn|btn-server|play-btn)[^"'>]*["']?[^>]*>([\s\S]*?)<\/(?:button|a|li|span)>/gi;
  let m;
  let btnIdx = 1;
  while ((m = btnRegex.exec(html)) !== null) {
    const tag = m[0];
    const label = cleanText(m[1]) || `Server #${btnIdx}`;
    const typeMatch = tag.match(/\bdata-type=(?:["']([^"']+)["']|([^\s>"']+))/i);
    const indexMatch = tag.match(
      /\bdata-index=(?:["']([^"']+)["']|([^\s>"']+))/i
    );
    const videoMatch = tag.match(
      /\bdata-(?:video|movie|src|link|url|embed|hash|id)=(?:["']([^"']+)["']|([^\s>"']+))/i
    );
    const rawVid = videoMatch ? videoMatch[1] || videoMatch[2] : "";
    const rawType = typeMatch ? typeMatch[1] || typeMatch[2] : "1";
    const rawIndex = indexMatch ? indexMatch[1] || indexMatch[2] : "1";

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
          index: parseInt(rawIndex, 10) || 1
        });
      }
      btnIdx++;
    }
  }

  const loaderRegex =
    /<div[^>]*class=["']?[^"'>]*movieLoader\b[^"'>]*["']?[^>]*>/gi;
  let loaderIdx = 1;
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
          index: loaderIdx
        });
      }
      loaderIdx++;
    }
  }

  return servers;
}

// Bóc tách chuyên sâu JSON trả về từ /api/get-video?id=... của emb.cd-vs.com cũng như HTML/JS bất kỳ
function parsePlayerHtml(rawHtml = "", baseDomain = "") {
  if (!rawHtml) return [];
  let buffer = String(rawHtml)
    .replace(/\\\//g, "/")
    .replace(/\\x([0-9A-Fa-f]{2})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    )
    .replace(/\\u0026/gi, "&")
    .replace(/\\u003c/gi, "<")
    .replace(/\\u003e/gi, ">")
    .replace(/\\u0022/gi, '"')
    .replace(/\\u0027/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/g, "&")
    .trim();

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
      lower.includes("/master") ||
      lower.includes("/manifest") ||
      lower.includes("mpegurl");
    const isMp4 =
      lower.includes(".mp4") ||
      lower.includes(".webm") ||
      lower.includes(".mov") ||
      lower.includes(".mkv") ||
      lower.includes("googlevideo.com/videoplayback");
    const type =
      forcedType || (isHls ? "hls" : isMp4 ? "mp4" : "iframe");
    results.push({ url: u, type });
  };

  // 1. Nếu chuỗi đầu vào là JSON (ví dụ phản hồi từ /api/get-video?id=...)
  if (buffer.startsWith("{") || buffer.startsWith("[")) {
    try {
      const parsedJson = JSON.parse(buffer);
      const inspectNode = (node) => {
        if (!node) return;
        if (typeof node === "string") {
          if (
            /^https?:\/\//i.test(node) ||
            node.startsWith("//") ||
            node.includes(".m3u8") ||
            node.includes(".mp4")
          ) {
            if (!/\.(?:jpg|jpeg|png|webp|gif|vtt|srt)(?:\?|$)/i.test(node)) {
              const isStream =
                node.includes(".m3u8") ||
                node.includes("/hls") ||
                node.includes("master") ||
                node.includes("playlist");
              addUrl(
                node,
                node.includes(".mp4") ? "mp4" : isStream ? "hls" : "hls"
              );
            }
          } else {
            const dec = decodeBase64Safe(node);
            if (dec && (/^https?:\/\//i.test(dec) || dec.includes(".m3u8") || dec.includes(".mp4"))) {
              addUrl(dec, dec.includes(".mp4") ? "mp4" : "hls");
            }
          }
          return;
        }
        if (Array.isArray(node)) {
          node.forEach(inspectNode);
          return;
        }
        if (typeof node === "object") {
          const directUrl =
            node.file ||
            node.src ||
            node.url ||
            node.source ||
            node.videoSource ||
            node.securedLink ||
            node.hls ||
            node.mp4 ||
            node.link ||
            node.stream;
          if (typeof directUrl === "string" && directUrl.trim()) {
            const nodeType = String(node.type || "").toLowerCase();
            const fType =
              nodeType.includes("mp4") || directUrl.includes(".mp4")
                ? "mp4"
                : "hls";
            addUrl(directUrl, fType);
          }
          for (const [k, v] of Object.entries(node)) {
            if (k === "thumbnail" || k === "poster" || k === "image" || k === "tracks") {
              continue;
            }
            inspectNode(v);
          }
        }
      };
      inspectNode(parsedJson);
      if (results.length > 0) return results;
    } catch (_) {}
  }

  buffer += "\n" + unpackPacker(buffer);

  const b64Regex = /([A-Za-z0-9+/]{20,}={0,2})/g;
  let bm;
  while ((bm = b64Regex.exec(buffer)) !== null) {
    const decoded = decodeBase64Safe(bm[1]);
    if (decoded && /https?:\/\/|<iframe|\.m3u8|\.mp4/i.test(decoded)) {
      buffer += "\n" + decoded;
    }
  }

  if (/^https?:\/\/[^\s"'<>]+$/i.test(buffer)) {
    addUrl(buffer);
    return results;
  }

  const tagRegex = /<(iframe|video|source|embed|object)\b[^>]*>/gi;
  const attrs = [
    "data-litespeed-src",
    "data-lazy-src",
    "data-wpfc-original-src",
    "data-src",
    "data-url",
    "data-video",
    "data-embed",
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
    /(?:["']?(?:file|source|src|url|embed_url|embedUrl|contentUrl|video_url|videoUrl|videoSource|securedLink|stream_url|hls|mp4|link|clip)["']?)\s*[:=]\s*["'](https?:\/\/[^"'\s<>]+|\/\/[^"'\s<>]+|\/[^"'\s<>]+)["']/gi;
  while ((m = jsFieldRegex.exec(buffer)) !== null) {
    const fieldCall = m[0].toLowerCase();
    const rawVal = m[1];
    if (
      /\.(?:jpg|jpeg|png|webp|gif|vtt|srt|ass|css|js)(?:\?|$)/i.test(rawVal)
    ) {
      continue;
    }
    const isHlsField =
      fieldCall.includes("videosource") ||
      fieldCall.includes("securedlink") ||
      fieldCall.includes("hls") ||
      rawVal.includes(".m3u8");
    const isMp4Field = fieldCall.includes("mp4") || rawVal.includes(".mp4");
    addUrl(rawVal, isMp4Field ? "mp4" : isHlsField ? "hls" : "");
  }

  const loadSourceRegex =
    /(?:loadSource|setSrc|src)\s*\(\s*["'`](https?:\/\/[^"'`\s]+|\/[^"'`\s]+)["'`]\s*\)/gi;
  while ((m = loadSourceRegex.exec(buffer)) !== null) {
    addUrl(m[1], m[1].includes(".mp4") ? "mp4" : "hls");
  }

  (
    buffer.match(
      /https?:\/\/[^\s"'<>\\]+?\.(?:m3u8|mp4)(?:\?[^\s"'<>\\]*)?/gi
    ) || []
  ).forEach((u) => addUrl(u));

  return results;
}

function extractLegacyAndDirectMedia(
  pageHtml = "",
  baseDomain = "",
  baseHost = ""
) {
  if (!pageHtml) return [];

  const zones = [];
  const zoneRegex =
    /<(?:article|div|section)[^>]*class=["']?[^"'>]*(?:responsive-player|video-player|player-wrapper|entry-content|post-content|single-content|toro-play|video-embed|sv2-player)[^"'>]*["']?[^>]*>[\s\S]{0,25000}?<\/(?:article|div|section)>/gi;
  let zm;
  while ((zm = zoneRegex.exec(pageHtml)) !== null) {
    zones.push(zm[0]);
  }

  const metaRegex =
    /<meta[^>]+(?:property|name|itemprop)=["']?(?:og:video(?::url|:secure_url)?|twitter:player|embedUrl|contentUrl)["']?[^>]+content=["']([^"']+)["']/gi;
  let mm;
  while ((mm = metaRegex.exec(pageHtml)) !== null) {
    zones.push(`<iframe src="${mm[1]}"></iframe>`);
  }

  const scopeHtml = zones.length > 0 ? zones.join("\n") : pageHtml;
  const rawItems = parsePlayerHtml(scopeHtml, baseDomain);

  return rawItems.filter((item) => {
    try {
      const u = new URL(item.url);
      const h = u.hostname.replace(/^www\./, "").toLowerCase();
      if (item.type === "hls" || item.type === "mp4") return true;
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

// Đi xuyên vào trang Iframe (emb.cd-vs.com): Gọi trực tiếp /api/get-video?id=<UUID> để lấy luồng .m3u8 / .mp4
async function resolveEmbedPage(iframeUrl, postLink, baseDomain) {
  const directStreams = [];
  let embedSnippet = "";
  let embedCookies = "";
  let isAlive = true;

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
      5500
    );

    if (res.status === 404 || res.status === 410 || res.status >= 500) {
      return {
        directStreams: [],
        embedSnippet: `DeadStatus: ${res.status}`,
        embedCookies: "",
        isAlive: false
      };
    }

    const setCookie = res.headers.get("set-cookie");
    if (setCookie) {
      embedCookies = setCookie
        .split(/,(?=\s*[a-zA-Z0-9_-]+=)/)
        .map((c) => c.split(";")[0].trim())
        .join("; ");
    }

    const html = await res.text();

    if (
      html.length < 200 ||
      /(?:Video not found|File was deleted|File is no longer available|404 Not Found|We're sorry, this video|Video đã bị xóa|Không tìm thấy video)/i.test(
        html
      )
    ) {
      isAlive = false;
    }

    // Bóc tách mã UUID (window.videoId hoặc cuối đường dẫn /embed/<uuid>)
    const winIdMatch = html.match(
      /window\.videoId\s*=\s*["']([^"']+)["']/i
    );
    const pathIdMatch = iframeUrl.match(
      /\/(?:embed|e|v|play|video)\/([a-zA-Z0-9_-]{6,})/i
    );
    const uuid =
      (winIdMatch && winIdMatch[1]) ||
      (pathIdMatch && pathIdMatch[1]) ||
      "";

    // BƯỚC QUAN TRỌNG NHẤT: Nếu có UUID (như emb.cd-vs.com), gọi thẳng /api/get-video?id=<uuid>
    if (uuid) {
      const apiEndpoints = [
        `${embedOrigin}/api/get-video?id=${encodeURIComponent(uuid)}`,
        `${embedOrigin}/api/source/${encodeURIComponent(uuid)}`
      ];

      for (const apiUrl of apiEndpoints) {
        if (directStreams.length > 0) break;
        try {
          const isGetVideoApi = apiUrl.includes("/api/get-video");
          const apiRes = await fetchWithTimeout(
            apiUrl,
            {
              method: isGetVideoApi ? "GET" : "POST",
              headers: {
                ...BROWSER_HEADERS,
                Accept: "application/json, text/plain, */*",
                Origin: embedOrigin,
                Referer: iframeUrl,
                "X-Requested-With": "XMLHttpRequest",
                ...(embedCookies ? { Cookie: embedCookies } : {}),
                ...(!isGetVideoApi
                  ? {
                      "Content-Type":
                        "application/x-www-form-urlencoded; charset=UTF-8"
                    }
                  : {})
              },
              ...(!isGetVideoApi
                ? {
                    body: `id=${encodeURIComponent(uuid)}&r=${encodeURIComponent(postLink)}`
                  }
                : {})
            },
            4500
          );

          if (apiRes.ok) {
            const apiText = await apiRes.text();
            embedSnippet += ` | DirectAPI(${apiUrl}): ${apiText.slice(0, 320)}`;
            const extracted = parsePlayerHtml(apiText, embedOrigin);
            for (const ex of extracted) {
              if (ex.type === "hls" || ex.type === "mp4") {
                directStreams.push({
                  url: ex.url,
                  type: ex.type,
                  referer: iframeUrl,
                  embedCookies
                });
              }
            }
          }
        } catch (_) {}
      }

      // Nếu /api/get-video bằng GET trả về sources rỗng, thử gọi bằng POST
      if (directStreams.length === 0) {
        try {
          const postApiUrl = `${embedOrigin}/api/get-video?id=${encodeURIComponent(uuid)}`;
          const postApiRes = await fetchWithTimeout(
            postApiUrl,
            {
              method: "POST",
              headers: {
                ...BROWSER_HEADERS,
                Accept: "application/json, text/plain, */*",
                Origin: embedOrigin,
                Referer: iframeUrl,
                "Content-Type":
                  "application/x-www-form-urlencoded; charset=UTF-8",
                "X-Requested-With": "XMLHttpRequest",
                ...(embedCookies ? { Cookie: embedCookies } : {})
              },
              body: `id=${encodeURIComponent(uuid)}&videoId=${encodeURIComponent(uuid)}`
            },
            4000
          );
          if (postApiRes.ok) {
            const postApiText = await postApiRes.text();
            embedSnippet += ` | PostAPI: ${postApiText.slice(0, 250)}`;
            const extracted = parsePlayerHtml(postApiText, embedOrigin);
            for (const ex of extracted) {
              if (ex.type === "hls" || ex.type === "mp4") {
                directStreams.push({
                  url: ex.url,
                  type: ex.type,
                  referer: iframeUrl,
                  embedCookies
                });
              }
            }
          }
        } catch (_) {}
      }
    }

    // Nếu đã lấy được luồng .m3u8 / .mp4 trực tiếp từ API thì trả về ngay lập tức (nhanh và ổn định nhất)
    if (directStreams.length > 0) {
      return { directStreams, embedSnippet, embedCookies, isAlive: true };
    }

    // Nếu là host khác chưa rõ API, mới chạy VM phân tích script động
    const inlineBodies = [];
    const dynamicScriptUrls = new Set();
    const vmAjaxQueue = [];

    const scriptRegex = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
    let sm;
    while ((sm = scriptRegex.exec(html)) !== null) {
      const attrs = sm[1] || "";
      const body = (sm[2] || "").trim();
      if (body && !body.includes("__CF$cv$params")) {
        const vmResult = executeEmbedScriptInVm(
          body,
          iframeUrl,
          postLink,
          uuid
        );
        inlineBodies.push(vmResult.deobfuscatedText);
        vmResult.scriptUrls.forEach((u) => {
          if (!u.includes("/cdn-cgi/")) dynamicScriptUrls.add(u);
        });
        vmResult.ajaxRequests.forEach((r) => vmAjaxQueue.push(r));
        for (const mUrl of vmResult.mediaUrls) {
          if (mUrl.includes(".m3u8") || mUrl.includes(".mp4")) {
            directStreams.push({
              url: mUrl,
              type: mUrl.includes(".mp4") ? "mp4" : "hls",
              referer: iframeUrl,
              embedCookies
            });
          }
        }
      } else {
        const srcM = attrs.match(/src=["']([^"']+)["']/i);
        if (
          srcM &&
          srcM[1] &&
          !srcM[1].includes("/cdn-cgi/") &&
          !IGNORE_DOMAINS.some((d) => srcM[1].includes(d)) &&
          !srcM[1].includes("plyr") &&
          !srcM[1].includes("hls.js") &&
          !srcM[1].includes("jquery")
        ) {
          try {
            dynamicScriptUrls.add(new URL(srcM[1], iframeUrl).toString());
          } catch (_) {}
        }
      }
    }

    if (dynamicScriptUrls.size > 0 && directStreams.length === 0) {
      const fetchedScripts = await Promise.allSettled(
        [...dynamicScriptUrls].slice(0, 3).map(async (sUrl) => {
          const r = await fetchWithTimeout(
            sUrl,
            {
              headers: {
                ...BROWSER_HEADERS,
                Referer: iframeUrl,
                ...(embedCookies ? { Cookie: embedCookies } : {})
              }
            },
            4000
          );
          return r.ok ? { url: sUrl, text: await r.text() } : null;
        })
      );

      for (const item of fetchedScripts) {
        if (item.status === "fulfilled" && item.value?.text) {
          const jsContent = item.value.text;
          const fullCode = `window.videoId = "${uuid}";\n${jsContent}`;
          const subVm = executeEmbedScriptInVm(
            fullCode,
            iframeUrl,
            postLink,
            uuid
          );
          inlineBodies.push(
            `[DynamicJS ${item.value.url}]: ` + subVm.deobfuscatedText
          );
          subVm.ajaxRequests.forEach((r) => vmAjaxQueue.push(r));
          for (const mUrl of subVm.mediaUrls) {
            if (mUrl.includes(".m3u8") || mUrl.includes(".mp4")) {
              directStreams.push({
                url: mUrl,
                type: mUrl.includes(".mp4") ? "mp4" : "hls",
                referer: iframeUrl,
                embedCookies
              });
            }
          }
        }
      }
    }

    const combinedScripts = inlineBodies.join("\n");
    if (combinedScripts && !embedSnippet) {
      embedSnippet = combinedScripts.replace(/\s+/g, " ").slice(0, 800);
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
          referer: iframeUrl,
          embedCookies
        });
      }
    }

    // Thực thi các request AJAX tìm được (Tự động điền `uuid` nếu đường dẫn kết thúc bằng `id=` hoặc `v=`)
    for (const reqItem of vmAjaxQueue.slice(0, 3)) {
      if (directStreams.length > 0) break;
      try {
        let reqUrl = reqItem.url;
        if (/[?&](?:id|vid|videoId|v)=$/i.test(reqUrl) && uuid) {
          reqUrl += encodeURIComponent(uuid);
        }
        const ajaxRes = await fetchWithTimeout(
          reqUrl,
          {
            method: reqItem.method || "GET",
            headers: {
              ...BROWSER_HEADERS,
              Origin: embedOrigin,
              Referer: iframeUrl,
              "X-Requested-With": "XMLHttpRequest",
              ...(reqItem.headers || {}),
              ...(embedCookies ? { Cookie: embedCookies } : {})
            }
          },
          4000
        );
        if (ajaxRes.ok) {
          const ajaxText = await ajaxRes.text();
          embedSnippet += ` | VmAjax(${reqUrl}): ${ajaxText.slice(0, 220)}`;
          const extracted = parsePlayerHtml(ajaxText, embedOrigin);
          for (const ex of extracted) {
            if (ex.type === "hls" || ex.type === "mp4") {
              directStreams.push({
                url: ex.url,
                type: ex.type,
                referer: iframeUrl,
                embedCookies
              });
            }
          }
        }
      } catch (_) {}
    }

    const ajaxUrlRegex =
      /(?:url\s*:\s*|\$\.(?:post|get|getJSON)\s*\(\s*|fetch\s*\(\s*)["'`]([^"'`\s]+)["'`]/gi;
    let am;
    while ((am = ajaxUrlRegex.exec(combinedScripts)) !== null) {
      let rawAjaxPath = am[1];
      if (
        rawAjaxPath.endsWith(".js") ||
        rawAjaxPath.endsWith(".css") ||
        rawAjaxPath.includes("/cdn-cgi/")
      ) {
        continue;
      }
      // Nếu chuỗi bị cắt ở dấu `=` (ví dụ `/api/get-video?id=`), tự động nối thêm `uuid`
      if (/[?&](?:id|vid|videoId|v|hash)=$/i.test(rawAjaxPath) && uuid) {
        rawAjaxPath += encodeURIComponent(uuid);
      }

      try {
        const fullAjaxUrl = new URL(rawAjaxPath, iframeUrl).toString();
        for (const method of ["GET", "POST"]) {
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
                    body: `id=${encodeURIComponent(uuid)}&videoId=${encodeURIComponent(uuid)}&vid=${encodeURIComponent(uuid)}&r=${encodeURIComponent(baseDomain + "/")}`
                  }
                : {})
            },
            4000
          );
          if (ajaxRes.ok) {
            const ajaxText = await ajaxRes.text();
            embedSnippet += ` | Ajax(${rawAjaxPath}): ${ajaxText.slice(0, 220)}`;
            const extracted = parsePlayerHtml(ajaxText, embedOrigin);
            for (const ex of extracted) {
              if (ex.type === "hls" || ex.type === "mp4") {
                directStreams.push({
                  url: ex.url,
                  type: ex.type,
                  referer: iframeUrl,
                  embedCookies
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

  return { directStreams, embedSnippet, embedCookies, isAlive };
}

async function fetchViet69PlayerUrl({
  baseDomain,
  postLink,
  srv,
  reqHeaders,
  cookies
}) {
  const isType10 = String(srv.dataType) === "10";
  const primaryEndpoint = isType10 ? "/get.xvideo.php" : "/get.video.php";
  const backupEndpoint = isType10 ? "/get.video.php" : "/get.xvideo.php";

  const ajaxHeaders = {
    ...reqHeaders,
    Origin: baseDomain,
    Referer: postLink,
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    "X-Requested-With": "XMLHttpRequest",
    ...(cookies ? { Cookie: cookies } : {})
  };

  let parsed = [];
  let rawText = "";

  const indicesToTry = [...new Set([srv.index || 1, 1, 2])];
  for (const idxVal of indicesToTry) {
    if (parsed.length > 0) break;
    const body = `movie_id=${encodeURIComponent(srv.movieId)}&type=${encodeURIComponent(srv.dataType)}&index=${idxVal}`;
    try {
      const res = await fetchWithTimeout(
        `${baseDomain}${primaryEndpoint}`,
        { method: "POST", headers: ajaxHeaders, body },
        5000
      );
      if (res.ok) {
        const t = await res.text();
        if (t && t.trim()) {
          rawText = t;
          parsed = parsePlayerHtml(t, baseDomain);
        }
      }
    } catch (_) {}
  }

  if (parsed.length === 0) {
    const body = `movie_id=${encodeURIComponent(srv.movieId)}&type=${encodeURIComponent(srv.dataType)}&index=1`;
    try {
      const res = await fetchWithTimeout(
        `${baseDomain}${backupEndpoint}`,
        { method: "POST", headers: ajaxHeaders, body },
        4500
      );
      if (res.ok) {
        const t = await res.text();
        if (t && t.trim()) {
          rawText = t;
          parsed = parsePlayerHtml(t, baseDomain);
        }
      }
    } catch (_) {}
  }

  if (parsed.length === 0 && srv.movieId) {
    const decoded = decodeBase64Safe(srv.movieId) || srv.movieId;
    if (/^https?:\/\//i.test(decoded) || decoded.includes("<iframe")) {
      parsed = parsePlayerHtml(decoded, baseDomain);
    } else if (
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        decoded
      )
    ) {
      parsed = [
        { url: `https://emb.cd-vs.com/embed/${decoded}`, type: "iframe" }
      ];
    } else if (/^[a-zA-Z0-9_-]{7,16}$/.test(decoded)) {
      if (String(srv.dataType) === "2" || String(srv.dataType) === "15") {
        parsed = [{ url: `https://short.ink/${decoded}`, type: "iframe" }];
      }
    }
  }

  const enrichedItems = [];
  let hopLog = "";

  for (const item of parsed) {
    if (item.type === "iframe") {
      const { directStreams, embedSnippet, embedCookies, isAlive } =
        await resolveEmbedPage(item.url, postLink, baseDomain);
      if (embedSnippet) hopLog += `\n -> [Body]: ${embedSnippet}`;

      for (const ds of directStreams) {
        enrichedItems.push({
          url: ds.url,
          type: ds.type,
          referer: ds.referer || item.url,
          embedCookies: ds.embedCookies || embedCookies,
          isDirectResolved: true,
          isAlive: true
        });
      }
      enrichedItems.push({
        url: item.url,
        type: "iframe",
        referer: postLink,
        embedCookies,
        isDirectResolved: false,
        isAlive
      });
    } else {
      enrichedItems.push({
        url: item.url,
        type: item.type,
        referer: postLink,
        embedCookies: "",
        isDirectResolved: true,
        isAlive: true
      });
    }
  }

  return {
    items: enrichedItems,
    rawResponse: `${rawText.trim()}${hopLog}`
  };
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
      contentType.includes("json") ||
      finalTargetUrl.includes(".m3u8") ||
      finalTargetUrl.includes("playlist") ||
      finalTargetUrl.includes("master") ||
      finalTargetUrl.includes("/api/get-video") ||
      (contentLength > 0 && contentLength < 250000);

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
      "Cache-Control": "no-store"
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

function transformEmbedJsCode(js = "") {
  if (!js || !js.trim()) return js;
  return js
    .replace(/\bwindow\.location\b/g, "window.__fakeLoc")
    .replace(/\bdocument\.location\b/g, "window.__fakeLoc")
    .replace(/\bself\.location\b/g, "window.__fakeLoc")
    .replace(/\btop\.location\b/g, "window.__fakeTopLoc")
    .replace(/\bparent\.location\b/g, "window.__fakeTopLoc")
    .replace(
      /\blocation\.(href|hostname|host|origin|pathname|search|assign|replace|reload)\b/g,
      "window.__fakeLoc.$1"
    );
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

  // CHẾ ĐỘ A2: PROXY FILE SCRIPT CỦA TRANG NHÚNG
  if (sp.get("scriptProxy") === "1") {
    const targetUrl = sp.get("url");
    const referer = sp.get("referer") || `${DEFAULT_DOMAIN}/`;
    const cookie = sp.get("cookie") || "";
    if (!targetUrl || targetUrl.includes("/cdn-cgi/")) {
      return new NextResponse("// ignored script", {
        status: 200,
        headers: { ...CORS, "Content-Type": "application/javascript" }
      });
    }
    try {
      const res = await fetchWithTimeout(
        targetUrl,
        {
          headers: {
            ...BROWSER_HEADERS,
            Referer: referer,
            ...(cookie ? { Cookie: cookie } : {})
          }
        },
        7000
      );
      const js = await res.text();
      return new NextResponse(transformEmbedJsCode(js), {
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

  // CHẾ ĐỘ B: PROXY TRANG NHÚNG IFRAME (LOẠI BỎ SCRIPT CLOUDFLARE JSD & TỰ ĐỘNG GẮN VIDEOID)
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

      const winIdMatch = html.match(
        /window\.videoId\s*=\s*["']([^"']+)["']/i
      );
      const pathIdMatch = targetUrl.match(
        /\/(?:embed|e|v|play|video)\/([a-zA-Z0-9_-]{6,})/i
      );
      const extractedVid =
        (winIdMatch && winIdMatch[1]) ||
        (pathIdMatch && pathIdMatch[1]) ||
        "";

      let refUrlObj;
      try {
        refUrlObj = new URL(referer);
      } catch (_) {
        refUrlObj = new URL(DEFAULT_DOMAIN);
      }

      html = html.replace(/<meta[^>]+http-equiv=["']?refresh["']?[^>]*>/gi, "");

      html = html.replace(
        /<script\b([^>]*)>([\s\S]*?)<\/script>/gi,
        (fullTag, attrs, body) => {
          // Loại bỏ hoàn toàn script kiểm tra ngầm __CF$cv$params / cdn-cgi của Cloudflare
          if (
            body.includes("__CF$cv$params") ||
            body.includes("/cdn-cgi/challenge-platform") ||
            attrs.includes("/cdn-cgi/")
          ) {
            return "";
          }

          const srcMatch = attrs.match(
            /\bsrc\s*=\s*(?:["']([^"']+)["']|([^\s>"']+))/i
          );
          if (srcMatch) {
            const rawSrc = srcMatch[1] || srcMatch[2] || "";
            if (
              /googleapis\.com|cloudflare\.com|jsdelivr\.net|jquery|plyr|hls\.js|hls\.min\.js|jwplayer/i.test(
                rawSrc
              )
            ) {
              return fullTag;
            }
            try {
              const absSrc = new URL(rawSrc, targetUrl).toString();
              const proxiedSrc = `/api/videos?scriptProxy=1&url=${encodeURIComponent(absSrc)}&referer=${encodeURIComponent(targetUrl)}${
                embedCookies
                  ? `&cookie=${encodeURIComponent(embedCookies)}`
                  : ""
              }`;
              return `<script src="${proxiedSrc}"></script>`;
            } catch (_) {
              return fullTag;
            }
          }
          if (!body.trim()) return fullTag;
          return `<script${attrs}>\n${transformEmbedJsCode(body)}\n</script>`;
        }
      );

      html = html.replace(
        /\b(src|href)=["'](\/(?!\/|api\/videos)[^"']+)["']/gi,
        (_, attr, relPath) => {
          const abs = `${targetOrigin}${relPath}`;
          return `${attr}="/api/videos?rawProxy=1&url=${encodeURIComponent(abs)}&referer=${encodeURIComponent(targetUrl)}${
            embedCookies ? `&cookie=${encodeURIComponent(embedCookies)}` : ""
          }"`;
        }
      );

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
            var VIDEO_UUID = ${JSON.stringify(extractedVid)};

            var REF_URL = ${JSON.stringify(refUrlObj.toString())};
            var REF_ORIGIN = ${JSON.stringify(refUrlObj.origin)};
            var REF_HOST = ${JSON.stringify(refUrlObj.host)};
            var REF_HOSTNAME = ${JSON.stringify(refUrlObj.hostname)};
            var REF_PATHNAME = ${JSON.stringify(refUrlObj.pathname)};

            var COOKIE_STR = ${JSON.stringify(embedCookies)};
            var RAW_PROXY = window.location.origin + "/api/videos?rawProxy=1";
            var SCRIPT_PROXY = window.location.origin + "/api/videos?scriptProxy=1";

            if (VIDEO_UUID && !window.videoId) {
              window.videoId = VIDEO_UUID;
            }

            function resolveTargetAbs(rawUrl) {
              if (!rawUrl || typeof rawUrl !== "string") return rawUrl;
              var u = rawUrl;
              // Tự động điền VIDEO_UUID nếu script gọi /api/get-video?id= bị rỗng hoặc undefined
              if (VIDEO_UUID && /[?&]id=(?:undefined|null)?$/i.test(u)) {
                u = u.replace(/([?&]id=)(?:undefined|null)?$/i, "$1" + encodeURIComponent(VIDEO_UUID));
              }
              try {
                if (u.indexOf("//") === 0) return "https:" + u;
                if (u.indexOf("/") === 0) return TARGET_ORIGIN + u;
                if (u.indexOf(window.location.origin) === 0 && u.indexOf("/api/videos") === -1) {
                  return TARGET_ORIGIN + u.slice(window.location.origin.length);
                }
                if (!/^https?:\\/\\//i.test(u)) {
                  return new URL(u, TARGET_URL).toString();
                }
              } catch (e) {}
              return u;
            }

            function rewriteToProxy(rawUrl, isScript) {
              if (!rawUrl || typeof rawUrl !== "string") return rawUrl;
              if (rawUrl.indexOf("/cdn-cgi/") !== -1) {
                return "data:text/javascript;base64,";
              }
              if (
                rawUrl.indexOf("blob:") === 0 ||
                rawUrl.indexOf("data:") === 0 ||
                rawUrl.indexOf("/api/videos?") !== -1
              ) {
                return rawUrl;
              }
              var abs = resolveTargetAbs(rawUrl);
              if (/googleapis\\.com|cloudflare\\.com|jsdelivr\\.net/i.test(abs)) {
                return abs;
              }
              var baseEndpoint = isScript ? SCRIPT_PROXY : RAW_PROXY;
              return (
                baseEndpoint +
                "&url=" + encodeURIComponent(abs) +
                "&referer=" + encodeURIComponent(TARGET_URL) +
                (COOKIE_STR ? "&cookie=" + encodeURIComponent(COOKIE_STR) : "")
              );
            }

            try {
              var origSetAttr = Element.prototype.setAttribute;
              Element.prototype.setAttribute = function(name, value) {
                var lower = String(name).toLowerCase();
                if (lower === "src" && typeof value === "string") {
                  var tag = (this.tagName || "").toUpperCase();
                  if (tag === "SCRIPT") {
                    value = rewriteToProxy(value, true);
                  } else if (tag === "VIDEO" || tag === "SOURCE" || tag === "IFRAME") {
                    value = rewriteToProxy(value, false);
                  }
                }
                return origSetAttr.call(this, name, value);
              };

              var scriptProto = window.HTMLScriptElement && window.HTMLScriptElement.prototype;
              if (scriptProto) {
                var srcDesc = Object.getOwnPropertyDescriptor(scriptProto, "src");
                if (srcDesc && srcDesc.set) {
                  Object.defineProperty(scriptProto, "src", {
                    configurable: true,
                    enumerable: true,
                    get: function() { return srcDesc.get.call(this); },
                    set: function(val) {
                      return srcDesc.set.call(this, rewriteToProxy(String(val), true));
                    }
                  });
                }
              }

              function fixNodeBeforeInsert(node) {
                try {
                  if (node && node.tagName) {
                    var t = node.tagName.toUpperCase();
                    var rawAttr = node.getAttribute ? node.getAttribute("src") : "";
                    if (rawAttr && rawAttr.indexOf("/api/videos?") === -1) {
                      if (t === "SCRIPT") {
                        origSetAttr.call(node, "src", rewriteToProxy(rawAttr, true));
                      } else if (t === "VIDEO" || t === "SOURCE") {
                        origSetAttr.call(node, "src", rewriteToProxy(rawAttr, false));
                      }
                    }
                  }
                } catch (e) {}
              }

              var origAppend = Node.prototype.appendChild;
              Node.prototype.appendChild = function(child) {
                fixNodeBeforeInsert(child);
                return origAppend.call(this, child);
              };

              var origInsert = Node.prototype.insertBefore;
              Node.prototype.insertBefore = function(newNode, refNode) {
                fixNodeBeforeInsert(newNode);
                return origInsert.call(this, newNode, refNode);
              };
            } catch (e) {}

            window.__fakeLoc = {
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

            window.__fakeTopLoc = {
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

            try {
              HTMLAnchorElement.prototype.click = function() {};
              HTMLFormElement.prototype.submit = function() {};
              window.open = function() { return null; };
            } catch (e) {}

            var origOpen = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function(method, url) {
              var args = Array.prototype.slice.call(arguments);
              args[1] = rewriteToProxy(String(url), false);
              return origOpen.apply(this, args);
            };

            if (window.fetch) {
              var origFetch = window.fetch;
              window.fetch = function(input, init) {
                if (typeof input === "string") {
                  input = rewriteToProxy(input, false);
                } else if (input && typeof input.url === "string") {
                  input = new Request(rewriteToProxy(input.url, false), input);
                }
                return origFetch.call(this, input, init);
              };
            }

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
                  return origLoad.call(this, rewriteToProxy(String(src), false));
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
      let postLink = `${baseDomain}/${cleanSlug}/`;
      const allStreams = [];
      const allIframes = [];
      const customSources = [];
      const tags = [];
      const debugInfo = { baseDomain, wpStatus: 0, htmlVia: "none" };

      let fetchResult = await fetchHtmlWithFallback(postLink, reqHeaders, true);
      if (
        !fetchResult.html &&
        !cleanSlug.startsWith("bai-viet/") &&
        !cleanSlug.includes("/")
      ) {
        const altLink = `${baseDomain}/bai-viet/${cleanSlug}/`;
        const altRes = await fetchHtmlWithFallback(altLink, reqHeaders, false);
        if (altRes.html) {
          fetchResult = altRes;
          postLink = altLink;
        }
      }

      const { html: pageHtml, via, status: htmlStatus, cookies } = fetchResult;
      debugInfo.htmlVia = via;
      debugInfo.htmlStatus = htmlStatus;
      debugInfo.htmlLength = pageHtml.length;

      const registerMediaSource = (mediaItem, baseLabel) => {
        const isAlive = mediaItem.isAlive !== false;
        if (mediaItem.type === "hls" || mediaItem.type === "mp4") {
          allStreams.push(mediaItem.url);
          const cookieParam = mediaItem.embedCookies
            ? `&cookie=${encodeURIComponent(mediaItem.embedCookies)}`
            : "";
          const proxyStreamUrl = `/api/videos?rawProxy=1&url=${encodeURIComponent(mediaItem.url)}&referer=${encodeURIComponent(mediaItem.referer || postLink)}${cookieParam}`;
          customSources.push({
            label: `${baseLabel} (VIP)`,
            name: `${baseLabel} (VIP)`,
            url: proxyStreamUrl,
            src: proxyStreamUrl,
            rawUrl: mediaItem.url,
            proxyUrl: proxyStreamUrl,
            type: mediaItem.type,
            priority: isAlive ? 1 : 9
          });
          return;
        }

        allIframes.push(mediaItem.url);
        const proxyEmbedUrl = `/api/videos?embedProxy=1&url=${encodeURIComponent(mediaItem.url)}&referer=${encodeURIComponent(postLink)}`;
        const preferDirect = shouldUseDirectIframe(mediaItem.url);

        if (preferDirect) {
          customSources.push({
            label: baseLabel,
            name: baseLabel,
            url: mediaItem.url,
            src: mediaItem.url,
            backupUrl: proxyEmbedUrl,
            type: "iframe",
            priority: isAlive ? 2 : 8
          });
          customSources.push({
            label: `${baseLabel} (Proxy)`,
            name: `${baseLabel} (Proxy)`,
            url: proxyEmbedUrl,
            src: proxyEmbedUrl,
            type: "iframe",
            priority: isAlive ? 4 : 9
          });
        } else {
          customSources.push({
            label: baseLabel,
            name: baseLabel,
            url: proxyEmbedUrl,
            src: proxyEmbedUrl,
            backupUrl: mediaItem.url,
            type: "iframe",
            priority: isAlive ? 2 : 8
          });
          customSources.push({
            label: `${baseLabel} (Gốc)`,
            name: `${baseLabel} (Gốc)`,
            url: mediaItem.url,
            src: mediaItem.url,
            type: "iframe",
            priority: isAlive ? 5 : 9
          });
        }
      };

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
              registerMediaSource(mediaItem, srv.label);
            }
          });

          if (rawSnippets.length > 0) {
            debugInfo.playerSnippet = rawSnippets.join("\n\n");
          }
        }

        const directItems = extractLegacyAndDirectMedia(
          pageHtml,
          baseDomain,
          baseHost
        );
        const existingUrls = new Set(
          customSources.map((s) => s.rawUrl || s.url)
        );

        let extraIdx = 1;
        for (const dItem of directItems) {
          if (existingUrls.has(dItem.url)) continue;
          existingUrls.add(dItem.url);
          const label =
            servers.length === 0
              ? `Server #${extraIdx}`
              : `Dự phòng #${extraIdx}`;
          extraIdx++;

          if (dItem.type === "iframe") {
            const { directStreams, isAlive } = await resolveEmbedPage(
              dItem.url,
              postLink,
              baseDomain
            );
            for (const ds of directStreams) {
              registerMediaSource({ ...ds, isAlive: true }, label);
            }
            registerMediaSource({ ...dItem, isAlive }, label);
          } else {
            registerMediaSource({ ...dItem, isAlive: true }, label);
          }
        }
      }

      if (customSources.length === 0) {
        try {
          const tailSlug = cleanSlug.split("/").pop();
          const wpRes = await fetchWithTimeout(
            `${baseDomain}/wp-json/wp/v2/posts?slug=${encodeURIComponent(tailSlug)}&_embed`,
            { headers: reqHeaders },
            5000
          );
          if (wpRes.ok) {
            const wpPosts = await wpRes.json();
            if (Array.isArray(wpPosts) && wpPosts.length > 0) {
              const p = wpPosts[0];
              if (!title || title === cleanSlug) {
                title = cleanText(p.title?.rendered || cleanSlug);
              }
              const wpMedia = parsePlayerHtml(
                JSON.stringify(p),
                baseDomain
              ).filter(
                (x) =>
                  !x.url.includes(baseHost) && !x.url.includes("viet69")
              );
              wpMedia.forEach((mItem, idx) => {
                registerMediaSource(
                  { ...mItem, isAlive: true },
                  `Server #${idx + 1}`
                );
              });
            }
          }
        } catch (_) {}
      }

      customSources.sort((a, b) => (a.priority || 5) - (b.priority || 5));

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
