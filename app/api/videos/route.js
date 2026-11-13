import { NextResponse } from "next/server";
import vm from "vm";
import data from "@/data/videos.json";
import { siteConfig } from "@/config/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Range, X-Requested-With",
  "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges"
};

const DEFAULT_DOMAIN =
  process.env.SOURCE_DOMAIN || siteConfig?.sourceDomain || "https://viet69.be";

const QMH_DOMAIN = "https://qmhv3.top";

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
  "69vn",
  "qmhv3"
];

const CATEGORY_MAP = {
  "phim-sex-viet-moi": {
    paths: [
      "category/phim-sex-viet-moi",
      "phim-sex-viet-moi",
      "tag/phim-sex-viet-moi",
      "category/clip-sex-viet-nam",
      "clip-sex-viet-nam"
    ],
    keyword: "việt mới",
    isMemberSection: false
  },
  "video-cua-thanh-vien": {
    paths: [
      "video-cua-thanh-vien",
      "bai-viet",
      "category/video-cua-thanh-vien",
      "tag/video-cua-thanh-vien"
    ],
    keyword: "thành viên chia sẻ",
    isMemberSection: true
  },
  "phim-sex-sinh-vien": {
    paths: [
      "category/phim-sex-sinh-vien",
      "phim-sex-sinh-vien",
      "tag/phim-sex-sinh-vien",
      "tag/sinh-vien"
    ],
    keyword: "sinh viên"
  },
  teen: {
    paths: ["category/teen", "tag/teen", "teen", "tag/sex-teen"],
    keyword: "teen"
  },
  "check-hang": {
    paths: ["category/check-hang", "tag/check-hang", "check-hang"],
    keyword: "check hàng"
  },
  camera: {
    paths: ["category/camera", "tag/camera", "camera", "tag/quay-len"],
    keyword: "camera"
  },
  bdsm: {
    paths: ["category/bdsm", "tag/bdsm", "bdsm", "tag/bao-dam"],
    keyword: "bdsm"
  },
  "may-bay-ba-gia": {
    paths: [
      "category/may-bay-ba-gia",
      "tag/may-bay-ba-gia",
      "may-bay-ba-gia",
      "tag/may-bay"
    ],
    keyword: "máy bay bà già"
  }
};

const SYSTEM_SLUGS_BLACKLIST = [
  "video-cua-toi",
  "video-da-thich",
  "video-yeu-thich",
  "video-da-xem",
  "xem-sau",
  "video-xem-sau",
  "lich-su",
  "lich-su-xem",
  "dang-video",
  "dang-bai",
  "dang-nhap",
  "dang-ky",
  "dang-xuat",
  "tai-khoan",
  "thong-tin-ca-nhan",
  "doi-mat-khau",
  "quen-mat-khau",
  "upload",
  "submit-video",
  "my-videos",
  "liked-videos",
  "watch-later",
  "favorite-videos",
  "profile",
  "login",
  "register",
  "logout",
  "contact",
  "lien-he",
  "dmca",
  "privacy-policy",
  "terms",
  "trang-chu",
  "home"
];

const SYSTEM_TITLES_BLACKLIST = [
  "video của tôi",
  "video đã thích",
  "video yêu thích",
  "video đã xem",
  "xem sau",
  "video xem sau",
  "lịch sử",
  "lịch sử xem",
  "đăng video",
  "đăng bài",
  "đăng nhập",
  "đăng ký",
  "đăng xuất",
  "tài khoản",
  "trang cá nhân",
  "thông tin cá nhân",
  "quên mật khẩu",
  "đổi mật khẩu",
  "video thành viên",
  "video của thành viên",
  "trang chủ"
];

const QMH_CASINO_BLACKLIST = [
  "banner",
  "win-big",
  "defi",
  "lottery",
  "jackpot",
  "3333-vnd",
  "3333vnd",
  "currency",
  "vip-3-ngay",
  "mien-phi-vip",
  "minimal-crash",
  "crash",
  "dice",
  "plinko",
  "limbo",
  "mines",
  "slots",
  "roulette",
  "blackjack",
  "baccarat",
  "keno",
  "wheel",
  "hilo",
  "casino",
  "sports",
  "promotions",
  "affiliate",
  "fairness",
  "wallet",
  "deposit",
  "withdraw",
  "idol-live"
];

const navPathCache = new Map();
const sortParamCache = new Map();

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS });
}

function cleanText(str = "") {
  return String(str || "")
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
  return s
    .replace(/__slash__/g, "/")
    .replace(/^\/+|\/+$/g, "");
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

function isSystemLinkOrTitle(slug = "", title = "") {
  const s = slug.toLowerCase().replace(/^\/+|\/+$/g, "");
  const tail = s.split("/").pop() || "";
  const t = title.toLowerCase().trim();
  const tSlug = toSlugKey(title);

  if (
    SYSTEM_SLUGS_BLACKLIST.some(
      (b) => s === b || tail === b || tSlug === b || s.endsWith(`/${b}`)
    )
  ) {
    return true;
  }
  if (
    SYSTEM_TITLES_BLACKLIST.some(
      (b) => t === b || t.startsWith(b + " (") || t.startsWith(b + " -")
    )
  ) {
    return true;
  }
  return false;
}

function isQmhCasinoOrBanner(slug = "", title = "") {
  const s = String(slug || "")
    .toLowerCase()
    .replace(/^qmh__/, "")
    .trim();
  const t = String(title || "").toLowerCase().trim();
  if (!s || s.length < 4 || s.includes("/") || s.includes(" ")) return true;
  if (/^(?:banner|slide|promo|game|ads?)[-_\d]*$/i.test(s)) return true;
  if (t === "idol live" || s === "idol-live") return true;

  const slugTokens = s.split(/[-_]+/);
  if (
    QMH_CASINO_BLACKLIST.some(
      (b) =>
        s === b ||
        slugTokens.includes(b) ||
        (b.includes("-") && s.includes(b)) ||
        t === b
    )
  ) {
    return true;
  }
  if (
    /win big|lottery|jackpot|3333\s*vnd|new currency|miễn phí vip|minimal crash|defi/i.test(
      t
    )
  ) {
    return true;
  }
  return false;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 4500) {
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
  if (!html || html.length < 300) return true;
  if (/<title>[^<]*(?:404|Not Found|Page not found)/i.test(html)) return true;
  if (html.includes("404 Not Found") && !html.includes("loop-video")) {
    return true;
  }
  return false;
}

function isRedirectedToHomepage(requestedUrl = "", finalUrl = "", html = "") {
  try {
    const reqObj = new URL(requestedUrl);
    const reqPath = reqObj.pathname.replace(/^\/+|\/+$/g, "");
    if (
      !reqPath ||
      /^page\/\d+$/i.test(reqPath) ||
      reqObj.search.includes("s=") ||
      reqObj.search.includes("category=") ||
      reqObj.search.includes("tab=")
    ) {
      return false;
    }

    if (finalUrl) {
      const finObj = new URL(finalUrl);
      const finPath = finObj.pathname.replace(/^\/+|\/+$/g, "");
      if (!finPath && !finObj.search) {
        return true;
      }
    }

    const canonicalMatch = html.match(
      /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i
    );
    if (canonicalMatch && canonicalMatch[1]) {
      const canObj = new URL(canonicalMatch[1], requestedUrl);
      const canPath = canObj.pathname.replace(/^\/+|\/+$/g, "");
      if (!canPath && !reqObj.search) {
        return true;
      }
    }
  } catch (_) {}
  return false;
}

async function fetchHtmlWithFallback(
  targetUrl,
  headers,
  allowProxy = true,
  rejectHomeRedirect = false
) {
  let status = 0;
  let cookies = "";
  try {
    const res = await fetchWithTimeout(targetUrl, { headers }, 4500);
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
      if (
        rejectHomeRedirect &&
        isRedirectedToHomepage(targetUrl, res.url, text)
      ) {
        return { html: "", via: "redirected-home", status: 302, cookies: "" };
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
      const res = await fetchWithTimeout(buildProxy(targetUrl), {}, 4500);
      if (res.ok) {
        const text = await res.text();
        if (!is404Html(text) && !text.includes("Just a moment...")) {
          if (
            rejectHomeRedirect &&
            isRedirectedToHomepage(targetUrl, "", text)
          ) {
            return {
              html: "",
              via: "redirected-home",
              status: 302,
              cookies: ""
            };
          }
          return { html: text, via: "proxy", status: res.status, cookies: "" };
        }
      }
    } catch (_) {}
  }

  return { html: "", via: "failed", status, cookies: "" };
}

async function fetchFastText(targetUrl, headers, timeoutMs = 3500) {
  let capturedCookies = "";
  const attempts = [
    fetchWithTimeout(targetUrl, { headers }, timeoutMs).then(async (r) => {
      const sc = r.headers.get("set-cookie");
      if (sc) {
        capturedCookies = sc
          .split(/,(?=\s*[a-zA-Z0-9_-]+=)/)
          .map((c) => c.split(";")[0].trim())
          .join("; ");
      }
      if (!r.ok) throw new Error("status_" + r.status);
      const t = await r.text();
      if (!t || t.includes("Just a moment...")) throw new Error("cf");
      return {
        text: t,
        via: "direct",
        status: r.status,
        cookies: capturedCookies
      };
    }),
    fetchWithTimeout(
      `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`,
      {},
      timeoutMs
    ).then(async (r) => {
      if (!r.ok) throw new Error("proxy1_" + r.status);
      const t = await r.text();
      if (!t || t.includes("Just a moment...")) throw new Error("cf");
      return { text: t, via: "codetabs", status: r.status, cookies: "" };
    }),
    fetchWithTimeout(
      `https://cors.eu.org/${targetUrl}`,
      { headers: { Origin: QMH_DOMAIN, Referer: `${QMH_DOMAIN}/` } },
      timeoutMs
    ).then(async (r) => {
      if (!r.ok) throw new Error("proxy_eu_" + r.status);
      const t = await r.text();
      if (!t || t.includes("Just a moment...")) throw new Error("cf");
      return { text: t, via: "corseu", status: r.status, cookies: "" };
    }),
    fetchWithTimeout(
      `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
      {},
      timeoutMs
    ).then(async (r) => {
      if (!r.ok) throw new Error("proxy2_" + r.status);
      const t = await r.text();
      if (!t || t.includes("Just a moment...")) throw new Error("cf");
      return { text: t, via: "allorigins", status: r.status, cookies: "" };
    })
  ];

  try {
    return await Promise.any(attempts);
  } catch (_) {
    return { text: "", via: "failed", status: 0, cookies: "" };
  }
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
    /eval\(function\(p,a,c,k,e,[dr]\)\{[\s\S]*?\}\s*\(\s*(['"])((?:\\.|(?!\1)[\s\S])*)\1\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(['"])((?:\\.|(?!\5)[\s\S])*)\5\.split\(['"]\|['"]\)/gi;
  let m;
  while ((m = packerRegex.exec(html)) !== null) {
    try {
      let p = m[2].replace(/\\(['"\\])/g, "$1");
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
          if (cfg && Array.isArray(cfg.sources)) {
            cfg.sources.forEach(
              (s) => s && s.file && recordUrl(s.file, "media")
            );
          }
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
      vm.runInContext(scriptCode, ctx, { timeout: 600 });
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
  return /\.(?:jpg|jpeg|png|webp|avif|gif|svg|ico|css|js|mjs|json|map|woff2?|ttf|eot|xml|txt|vtt|srt)$/i.test(
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
    u.startsWith("data:") ||
    u.includes("/_next/")
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
    /<(?:button|a|li|span|div)[^>]*class=["']?[^"'>]*(?:video2-btn|server-btn|btn-server|play-btn)[^"'>]*["']?[^>]*>([\s\S]*?)<\/(?:button|a|li|span|div)>/gi;
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

  if (buffer.startsWith("{") || buffer.startsWith("[")) {
    try {
      const parsedJson = JSON.parse(buffer);
      const extraHtmlChunks = [];
      const inspectNode = (node) => {
        if (!node) return;
        if (typeof node === "string") {
          if (/<(?:iframe|video|source|embed|script)\b/i.test(node)) {
            extraHtmlChunks.push(node);
            return;
          }
          if (
            /^https?:\/\//i.test(node) ||
            node.startsWith("//") ||
            node.includes(".m3u8") ||
            node.includes(".mp4")
          ) {
            if (!isStaticAsset(node)) {
              const isStream =
                node.includes(".m3u8") ||
                node.includes("/hls/") ||
                node.includes(".mp4");
              addUrl(
                node,
                node.includes(".mp4")
                  ? "mp4"
                  : isStream
                  ? "hls"
                  : "iframe"
              );
            }
          } else {
            const dec = decodeBase64Safe(node);
            if (dec) {
              if (/<(?:iframe|video|source)\b/i.test(dec)) {
                extraHtmlChunks.push(dec);
              } else if (
                /^https?:\/\//i.test(dec) ||
                dec.includes(".m3u8") ||
                dec.includes(".mp4")
              ) {
                addUrl(
                  dec,
                  dec.includes(".mp4")
                    ? "mp4"
                    : dec.includes(".m3u8")
                    ? "hls"
                    : "iframe"
                );
              }
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
            node.stream ||
            node.embedUrl ||
            node.iframe;
          if (typeof directUrl === "string" && directUrl.trim()) {
            if (/<(?:iframe|video|source)\b/i.test(directUrl)) {
              extraHtmlChunks.push(directUrl);
            } else {
              const nodeType = String(node.type || "").toLowerCase();
              const fType =
                nodeType.includes("mp4") || directUrl.includes(".mp4")
                  ? "mp4"
                  : nodeType.includes("hls") ||
                    directUrl.includes(".m3u8") ||
                    directUrl.includes("/hls/")
                  ? "hls"
                  : "iframe";
              addUrl(directUrl, fType);
            }
          }
          for (const [k, v] of Object.entries(node)) {
            if (
              k === "thumbnail" ||
              k === "poster" ||
              k === "image" ||
              k === "tracks"
            ) {
              continue;
            }
            inspectNode(v);
          }
        }
      };
      inspectNode(parsedJson);
      if (extraHtmlChunks.length > 0) {
        buffer += "\n" + extraHtmlChunks.join("\n");
      } else if (results.length > 0) {
        return results;
      }
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
    /(?:["']?(?:file|source|src|url|embed_url|embedUrl|contentUrl|video_url|videoUrl|videoSource|securedLink|stream_url|streamUrl|playUrl|hls|hlsUrl|mp4|mp4Url|link|clip)["']?)\s*[:=]\s*["'](https?:\/\/[^"'\s<>]+|\/\/[^"'\s<>]+|\/[^"'\s<>]+)["']/gi;
  while ((m = jsFieldRegex.exec(buffer)) !== null) {
    const fieldCall = m[0].toLowerCase();
    const rawVal = m[1];
    if (isStaticAsset(rawVal)) {
      continue;
    }
    const isHlsField =
      fieldCall.includes("videosource") ||
      fieldCall.includes("securedlink") ||
      fieldCall.includes("hls") ||
      fieldCall.includes("stream") ||
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
    /<(?:article|div|section)[^>]*class=["']?[^"'>]*(?:responsive-player|video-player|player-wrapper|entry-content|post-content|single-content|toro-play|video-embed|sv2-player|wp-video)[^"'>]*["']?[^>]*>[\s\S]{0,30000}?<\/(?:article|div|section)>/gi;
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
        return /(?:embed|player|play|video|stream|get\.|wp-content\/uploads)/i.test(
          u.pathname + u.search
        );
      }
      return true;
    } catch (_) {
      return false;
    }
  });
}

async function resolveEmbedPage(iframeUrl, postLink) {
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
      4500
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
            4000
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
    }

    if (directStreams.length > 0) {
      return { directStreams, embedSnippet, embedCookies, isAlive: true };
    }

    const inlineBodies = [];
    const scriptRegex = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
    let sm;
    while ((sm = scriptRegex.exec(html)) !== null) {
      const body = (sm[2] || "").trim();
      if (body && !body.includes("__CF$cv$params")) {
        const vmResult = executeEmbedScriptInVm(
          body,
          iframeUrl,
          postLink,
          uuid
        );
        inlineBodies.push(vmResult.deobfuscatedText);
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
      }
    }

    const combinedScripts = inlineBodies.join("\n");
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

  const indicesToTry = [...new Set([srv.index || 1, 1])];
  for (const idxVal of indicesToTry) {
    if (parsed.length > 0) break;
    const body = `movie_id=${encodeURIComponent(srv.movieId)}&type=${encodeURIComponent(srv.dataType)}&index=${idxVal}`;
    try {
      const res = await fetchWithTimeout(
        `${baseDomain}${primaryEndpoint}`,
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

  if (parsed.length === 0) {
    const body = `movie_id=${encodeURIComponent(srv.movieId)}&type=${encodeURIComponent(srv.dataType)}&index=1`;
    try {
      const res = await fetchWithTimeout(
        `${baseDomain}${backupEndpoint}`,
        { method: "POST", headers: ajaxHeaders, body },
        4000
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
        await resolveEmbedPage(item.url, postLink);
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

function extractTotalPagesFromHtml(
  html = "",
  currentPage = 1,
  isMemberCat = false
) {
  let maxPage = currentPage;

  if (isMemberCat) {
    let memberMax = currentPage;
    const memberPatterns = [
      /\/bai-viet\/page\/(\d+)\/?/gi,
      /\/video-cua-thanh-vien\/page\/(\d+)\/?/gi,
      /[?&](?:trang|paged)=(\d+)/gi
    ];
    for (const pat of memberPatterns) {
      let m;
      while ((m = pat.exec(html)) !== null) {
        const p = parseInt(m[1], 10);
        if (!isNaN(p) && p > memberMax && p < 500) {
          memberMax = p;
        }
      }
    }
    return Math.max(1, memberMax);
  }

  const navZoneMatch = html.match(
    /<(?:div|nav|ul)[^>]*class=["']?[^"'>]*(?:wp-pagenavi|pagination|nav-links|page-numbers|pagenavi|page-nav)[^"'>]*["']?[^>]*>[\s\S]{0,5000}?<\/(?:div|nav|ul)>/i
  );
  const scopeHtml = navZoneMatch ? navZoneMatch[0] : html;

  const ofMatch = scopeHtml.match(
    /(?:Page|Trang)\s+\d+\s+(?:of|trên|của|\/)\s+([\d,.]+)/i
  );
  if (ofMatch && ofMatch[1]) {
    const num = parseInt(ofMatch[1].replace(/[,.]/g, ""), 10);
    if (!isNaN(num) && num >= currentPage) {
      return num;
    }
  }

  const pagePatterns = [
    /\/page\/(\d+)\/?/gi,
    /[?&](?:trang|page|paged)=(\d+)/gi
  ];
  for (const pat of pagePatterns) {
    let m;
    while ((m = pat.exec(scopeHtml)) !== null) {
      const p = parseInt(m[1], 10);
      if (!isNaN(p) && p > maxPage && p < 100000) {
        maxPage = p;
      }
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

  const headerScope = html.slice(0, 45000);
  const aRegex =
    /<a\b[^>]*href=(?:["']([^"']+)["']|([^\s>"']+))[^>]*>((?:(?!<\/a>)[\s\S])*)<\/a>/gi;
  let m;
  while ((m = aRegex.exec(headerScope)) !== null) {
    try {
      const rawHref = m[1] || m[2] || "";
      const labelHtml = m[3] || "";
      const parsed = new URL(rawHref, baseDomain);
      const linkHost = parsed.hostname.replace(/^www\./, "").toLowerCase();
      if (linkHost !== baseHost && !linkHost.includes("viet69")) continue;

      const rawPath = parsed.pathname.replace(/^\/+|\/+$/g, "");
      if (!rawPath || rawPath.includes("wp-") || rawPath.includes("/page/")) {
        continue;
      }

      const name = cleanText(labelHtml).replace(/\s*MỚI\s*$/i, "").trim();
      if (!name || name === "..." || name.length > 35) continue;

      const labelSlug = toSlugKey(name);
      if (!labelSlug || isSystemLinkOrTitle(rawPath, name)) continue;

      if (
        labelSlug.includes("video-cua-thanh-vien") ||
        labelSlug === "video-thanh-vien"
      ) {
        if (rawPath.includes("thanh-vien") || rawPath.includes("bai-viet")) {
          navPathCache.set("video-cua-thanh-vien", rawPath);
        }
      } else if (
        labelSlug.includes("phim-sex-viet-moi") ||
        labelSlug === "phim-viet-moi"
      ) {
        if (!rawPath.includes("thanh-vien") && !rawPath.includes("bai-viet")) {
          navPathCache.set("phim-sex-viet-moi", rawPath);
        }
      } else if (labelSlug.includes("sinh-vien")) {
        navPathCache.set("phim-sex-sinh-vien", rawPath);
      } else if (labelSlug.includes("may-bay")) {
        navPathCache.set("may-bay-ba-gia", rawPath);
      } else if (labelSlug.includes("check-hang")) {
        navPathCache.set("check-hang", rawPath);
      }

      if (
        !seen.has(rawPath) &&
        (rawPath.startsWith("category/") ||
          rawPath.startsWith("tag/") ||
          CATEGORY_MAP[labelSlug])
      ) {
        seen.add(rawPath);
        categories.push({
          name,
          slug: rawPath,
          isNew: /mới|new/i.test(labelHtml)
        });
      }
    } catch (_) {}
  }

  return categories;
}

function extractThumbnailFromBlock(block = "", baseDomain = "") {
  const isInvalidThumbUrl = (u = "") => {
    const lower = u.toLowerCase();
    return (
      !u ||
      lower.startsWith("data:") ||
      lower.includes("blank.gif") ||
      lower.includes("placeholder") ||
      lower.includes("logo") ||
      lower.includes("favicon") ||
      lower.includes("avatar") ||
      lower.includes("list-top-images") ||
      lower.includes("/themes/") ||
      lower.includes("/plugins/") ||
      /\.(?:js|css|json|xml|woff2?|ttf)(?:\?|$)/i.test(lower)
    );
  };

  const nextImgMatch = block.match(/\/_next\/image\?[^"'\s>]*url=([^"'\s&>]+)/i);
  if (nextImgMatch && nextImgMatch[1]) {
    try {
      const decodedImg = decodeURIComponent(nextImgMatch[1]);
      if (!isInvalidThumbUrl(decodedImg)) {
        if (decodedImg.startsWith("http")) return decodedImg;
        if (decodedImg.startsWith("/") && baseDomain) {
          return `${baseDomain}${decodedImg}`;
        }
      }
    } catch (_) {}
  }

  const imgTagScope =
    (block.match(/<(?:img|video|source|div|span)\b[^>]*>/gi) || []).join(" ") ||
    block;

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
    while ((m = regex.exec(imgTagScope)) !== null) {
      let val = (m[1] || m[2] || "").trim().replace(/&amp;/g, "&");
      if (isInvalidThumbUrl(val)) continue;
      if (val.startsWith("//")) val = `https:${val}`;
      else if (val.startsWith("/") && baseDomain) val = `${baseDomain}${val}`;

      if (val.startsWith("http")) {
        return val;
      }
    }
  }

  const bgMatch = block.match(
    /background(?:-image)?\s*:[^;]*url\(\s*["']?(https?:\/\/[^"')]+|\/[^"')]+)["']?\s*\)/i
  );
  if (bgMatch && bgMatch[1]) {
    let bgUrl = bgMatch[1].trim();
    if (!isInvalidThumbUrl(bgUrl)) {
      if (bgUrl.startsWith("/") && baseDomain) bgUrl = `${baseDomain}${bgUrl}`;
      if (bgUrl.startsWith("http")) return bgUrl;
    }
  }

  return "";
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
  const allCandidates = [];
  const seen = new Set();

  const isMemberCat =
    category === "video-cua-thanh-vien" || category === "bai-viet";

  let mainScope = html
    .replace(/<header\b[\s\S]*?<\/header>/gi, "")
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer\b[\s\S]*?<\/footer>/gi, "")
    .replace(/<aside\b[\s\S]*?<\/aside>/gi, "");

  const mainMatch = mainScope.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  if (mainMatch) {
    mainScope = mainMatch[1];
  } else {
    const cutIdx = mainScope.search(
      /<(?:aside|div|footer)[^>]+(?:id|class)=["']?[^"'>]*(?:sidebar|secondary|widget-area|site-footer|footer-widgets)/i
    );
    if (cutIdx > 1500) {
      mainScope = mainScope.slice(0, cutIdx);
    }
  }

  const articleBlocks = mainScope.match(/<article[\s\S]*?<\/article>/gi) || [];
  const splitDivBlocks = mainScope.split(
    /(?=<div[^>]+class=["']?[^"'>]*(?:post-|loop-video|video-item|clip-item|entry-item|item-video|col-video|type-bai-viet|video-block|member-video|col-md-|col-sm-|col-6|item\b)[^"'>]*["']?)/i
  );
  const combinedBlocks = [...articleBlocks, ...splitDivBlocks];

  const tryExtractFromBlock = (block) => {
    const realThumb = extractThumbnailFromBlock(block, baseDomain);
    if (!realThumb) return;

    const aTagRegex =
      /<a\b[^>]*href\s*=\s*(?:["']([^"']+)["']|([^\s>"']+))[^>]*>([\s\S]*?)<\/a>/gi;
    let chosenUrl = null;
    let chosenATag = "";
    let chosenInnerText = "";
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
        pathname.includes("/user/") ||
        pathname.includes("/wp-") ||
        pathname.includes("/feed/") ||
        /^\/(?:bai-viet|video-cua-thanh-vien)\/?$/i.test(pathname)
      ) {
        continue;
      }

      const candidateSlug = pathname.replace(/^\/+|\/+$/g, "");
      const candidateText = cleanText(am[3] || "");
      if (isSystemLinkOrTitle(candidateSlug, candidateText)) {
        continue;
      }

      chosenUrl = parsedUrl;
      chosenATag = am[0];
      chosenInnerText = candidateText;
      if (chosenInnerText.length > 5 || /title=/i.test(chosenATag)) {
        break;
      }
    }

    if (!chosenUrl) return;

    const itemSlug = chosenUrl.pathname.replace(/^\/+|\/+$/g, "");
    if (!itemSlug || seen.has(itemSlug)) return;

    const isBvSlug =
      itemSlug.startsWith("bai-viet/") || /\btype-bai-viet\b/i.test(block);

    if (!isMemberCat && isBvSlug) {
      return;
    }

    const titleFromA = chosenATag.match(/\btitle=["']([^"']+)["']/i);
    const titleMatch =
      titleFromA ||
      block.match(/<h[1-5][^>]*>([\s\S]*?)<\/h[1-5]>/i) ||
      block.match(/\btitle=["']([^"']+)["']/i) ||
      block.match(/\balt=["']([^"']+)["']/i);

    const resolvedTitle = (
      titleMatch ? cleanText(titleMatch[1]) : chosenInnerText || itemSlug
    ).replace(/\s*[-|–]\s*Viet69.*$/i, "");

    if (
      !resolvedTitle ||
      resolvedTitle.length < 3 ||
      isSystemLinkOrTitle(itemSlug, resolvedTitle)
    ) {
      return;
    }

    seen.add(itemSlug);

    const stats = extractStatsFromBlock(block);
    const durationMatch = block.match(
      /<span[^>]*class=["']?[^"'>]*(?:duration|time|length)[^"'>]*["']?[^>]*>([\s\S]*?)<\/span>/i
    );

    const normalizedSlug =
      isMemberCat && !itemSlug.startsWith("bai-viet/")
        ? `bai-viet/${itemSlug}`
        : itemSlug;

    allCandidates.push({
      id: normalizedSlug,
      slug: normalizedSlug,
      title: resolvedTitle,
      category: isMemberCat
        ? "video-cua-thanh-vien"
        : category === "all"
        ? "movie"
        : category,
      isOriginalBv: isBvSlug,
      thumbnail: realThumb,
      thumb: realThumb,
      poster: realThumb,
      image: realThumb,
      duration: durationMatch ? cleanText(durationMatch[1]) : "",
      views: stats.views,
      comments: stats.comments,
      likes: stats.likes
    });
  };

  for (const b of combinedBlocks) {
    tryExtractFromBlock(b);
  }

  if (allCandidates.length < 4) {
    const anchorImgRegex =
      /<a\b[^>]*href\s*=\s*(?:["']([^"']+)["']|([^\s>"']+))[^>]*>(?:(?!<\/a>)[\s\S])*?<img\b[^>]*>(?:(?!<\/a>)[\s\S])*?<\/a>/gi;
    let aim;
    while ((aim = anchorImgRegex.exec(mainScope)) !== null) {
      const aBlock = aim[0];
      const startPos = Math.max(0, aim.index - 200);
      const endPos = Math.min(
        mainScope.length,
        aim.index + aBlock.length + 650
      );
      const surroundingContext = mainScope.slice(startPos, endPos);
      tryExtractFromBlock(surroundingContext);
    }
  }

  if (isMemberCat) {
    const strictBv = allCandidates.filter((x) => x.isOriginalBv);
    if (strictBv.length > 0) {
      return strictBv;
    }
  }

  return allCandidates;
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
// BỘ GIẢI MÃ CHUYÊN SÂU KHO PHIM QMHV3.TOP & API.QMHV3.TOP
// =====================================================================
function unescapeNextRscText(raw = "") {
  if (!raw) return "";
  let s = String(raw);
  for (let i = 0; i < 3; i++) {
    s = s
      .replace(/\\\\"/g, '\\"')
      .replace(/\\"/g, '"')
      .replace(/\\\\\//g, "/")
      .replace(/\\\//g, "/");
  }
  s = s
    .replace(/\\u0026/gi, "&")
    .replace(/\\u003d/gi, "=")
    .replace(/\\u003f/gi, "?")
    .replace(/\\u002f/gi, "/")
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    )
    .replace(/&amp;/g, "&");
  return s;
}

function normalizeQmhThumbUrl(rawThumb = "", baseDomain = QMH_DOMAIN) {
  let img = unescapeNextRscText(String(rawThumb || "").trim());
  if (!img) return "";
  if (img.includes("/_next/image") && img.includes("url=")) {
    try {
      const uObj = new URL(img, baseDomain);
      img = decodeURIComponent(uObj.searchParams.get("url") || "");
    } catch (_) {}
  }
  if (img.startsWith("//")) img = `https:${img}`;
  else if (img.startsWith("/")) img = `${baseDomain}${img}`;
  if (
    !img.startsWith("http") ||
    /logo|favicon|icon|list-top-images|\/banners?\/|avatar/i.test(img) ||
    /\.(?:js|css|json|xml|woff2?)(?:\?|$)/i.test(img)
  ) {
    return "";
  }
  return img;
}

function normalizeQmhJsonItems(rawJson, baseDomain = QMH_DOMAIN) {
  if (!rawJson) return null;
  let obj = rawJson;
  if (typeof rawJson === "string") {
    try {
      obj = JSON.parse(rawJson);
    } catch (_) {
      return null;
    }
  }

  const candidateArrays = [];
  const collectArrays = (node) => {
    if (!node) return;
    if (Array.isArray(node)) {
      if (
        node.length >= 1 &&
        typeof node[0] === "object" &&
        node[0] !== null
      ) {
        candidateArrays.push(node);
      }
      for (const el of node) collectArrays(el);
      return;
    }
    if (typeof node === "object") {
      for (const k of Object.keys(node)) {
        collectArrays(node[k]);
      }
    }
  };
  collectArrays(obj);

  const items = [];
  const seen = new Set();

  for (const arr of candidateArrays) {
    for (const item of arr) {
      if (!item || typeof item !== "object") continue;
      let rawSlug = String(
        item.slug ||
          item.code ||
          item.vod_id ||
          item.id ||
          item._id ||
          item.link ||
          item.url ||
          ""
      ).trim();

      if (!rawSlug) continue;
      rawSlug = rawSlug
        .replace(/^https?:\/\/[^/]+/i, "")
        .replace(/^\/?watch\//i, "")
        .replace(/^\/+|\/+$/g, "");

      const title = cleanText(
        String(
          item.title ||
            item.name ||
            item.vod_name ||
            rawSlug.replace(/-/g, " ")
        )
      );

      if (isQmhCasinoOrBanner(rawSlug, title) || seen.has(rawSlug)) {
        continue;
      }

      const thumb = normalizeQmhThumbUrl(
        item.thumbnail ||
          item.thumb ||
          item.poster ||
          item.image ||
          item.cover ||
          item.pic ||
          item.vod_pic ||
          item.thumbnailUrl ||
          item.posterUrl ||
          item.thumbUrl ||
          "",
        baseDomain
      );

      if (!thumb) continue;

      seen.add(rawSlug);
      const fullSlug = rawSlug.startsWith("qmh__")
        ? rawSlug
        : `qmh__${rawSlug}`;

      items.push({
        id: fullSlug,
        slug: fullSlug,
        title,
        category: "qmh-movie",
        thumbnail: thumb,
        thumb,
        poster: thumb,
        image: thumb,
        duration: String(item.duration || item.time || ""),
        views: String(item.views ?? item.view ?? item.viewCount ?? "0"),
        comments: String(
          item.comments ?? item.comment ?? item.commentCount ?? "0"
        ),
        likes: String(item.likes ?? item.like ?? item.likeCount ?? "0")
      });
    }
  }

  if (items.length === 0) return null;

  const totalPages = Math.max(
    1,
    Number(
      obj?.totalPages ||
        obj?.total_pages ||
        obj?.pageCount ||
        obj?.last_page ||
        obj?.pagination?.totalPages ||
        20
    )
  );

  return { items, totalPages };
}

function parseQmhListFromHtml(html = "", baseDomain = QMH_DOMAIN) {
  const items = [];
  const seen = new Set();
  if (!html) return items;

  const registerCandidate = (rawSlug, rawTitle, rawThumb, extra = {}) => {
    let s = String(rawSlug || "")
      .trim()
      .replace(/^https?:\/\/[^/]+/i, "")
      .replace(/^\/?watch\//i, "")
      .replace(/^\/+|\/+$/g, "");

    let t = cleanText(String(rawTitle || ""));
    if (!t || t.length < 3) {
      t = s.replace(/-/g, " ");
    }

    if (isQmhCasinoOrBanner(s, t) || seen.has(s)) {
      return;
    }

    const img = normalizeQmhThumbUrl(rawThumb, baseDomain);
    if (!img) return;

    seen.add(s);
    const fullSlug = s.startsWith("qmh__") ? s : `qmh__${s}`;

    items.push({
      id: fullSlug,
      slug: fullSlug,
      title: t,
      category: "qmh-movie",
      thumbnail: img,
      thumb: img,
      poster: img,
      image: img,
      duration: String(extra.duration || ""),
      views: String(extra.views ?? "0"),
      comments: String(extra.comments ?? "0"),
      likes: String(extra.likes ?? "0")
    });
  };

  const normalizedText = unescapeNextRscText(html).replace(/\\n/g, " ");

  const watchLinkRegex =
    /<a\b[^>]*href=["']?(?:https?:\/\/[^"'\s>]*)?\/watch\/([^"'/?#\s>]+)["']?[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = watchLinkRegex.exec(html)) !== null) {
    const rawSlug = m[1].trim();
    const aInner = m[2] || "";
    const prevLinkBoundary = html.lastIndexOf(
      "/watch/",
      Math.max(0, m.index - 10)
    );
    const nextLinkBoundary = html.indexOf("/watch/", m.index + m[0].length);

    const startCtx = Math.max(
      prevLinkBoundary !== -1 ? prevLinkBoundary + 20 : 0,
      m.index - 350
    );
    const endCtx = Math.min(
      nextLinkBoundary !== -1 ? nextLinkBoundary : html.length,
      m.index + m[0].length + 600
    );
    const contextBlock = html.slice(startCtx, endCtx);

    const thumb =
      extractThumbnailFromBlock(aInner, baseDomain) ||
      extractThumbnailFromBlock(contextBlock, baseDomain);

    const titleFromAttr =
      m[0].match(/\btitle=["']([^"']+)["']/i) ||
      aInner.match(/\balt=["']([^"']+)["']/i) ||
      aInner.match(/<h[1-5][^>]*>([\s\S]*?)<\/h[1-5]>/i) ||
      contextBlock.match(/<h[1-5][^>]*>([\s\S]*?)<\/h[1-5]>/i) ||
      contextBlock.match(/\balt=["']([^"']+)["']/i);

    const title = titleFromAttr
      ? cleanText(titleFromAttr[1])
      : cleanText(aInner);
    const stats = extractStatsFromBlock(contextBlock);

    registerCandidate(rawSlug, title, thumb, stats);
  }

  const slugKeyRegex = /"slug"\s*:\s*"([a-zA-Z0-9_-]{5,160})"/g;
  let sm;
  while ((sm = slugKeyRegex.exec(normalizedText)) !== null) {
    const candidateSlug = sm[1];
    if (seen.has(candidateSlug)) continue;

    const beforeSlice = normalizedText.slice(
      Math.max(0, sm.index - 800),
      sm.index
    );
    const prevSlugIdx = beforeSlice.lastIndexOf('"slug"');
    const cleanBefore =
      prevSlugIdx !== -1 ? beforeSlice.slice(prevSlugIdx + 6) : beforeSlice;

    const afterSlice = normalizedText.slice(
      sm.index,
      Math.min(normalizedText.length, sm.index + 1200)
    );
    const nextSlugMatch = afterSlice.slice(10).search(/"slug"\s*:/);
    const cleanAfter =
      nextSlugMatch !== -1
        ? afterSlice.slice(0, nextSlugMatch + 10)
        : afterSlice;

    const objSlice = cleanBefore + cleanAfter;

    const titleM = objSlice.match(
      /"(?:title|name|vod_name)"\s*:\s*"([^"]{3,240})"/i
    );
    const thumbM = objSlice.match(
      /"(?:thumbnail|thumb|poster|image|cover|pic|vod_pic|posterUrl|thumbUrl|thumbnailUrl|coverUrl|image_url)"\s*:\s*"([^"]{5,500})"/i
    );
    const viewsM = objSlice.match(
      /"(?:views|view|viewCount|views_count)"\s*:\s*"?(\d[\d,.]*[kKmM]?)"?/i
    );
    const commentsM = objSlice.match(
      /"(?:comments|comment|commentCount|comments_count)"\s*:\s*"?(\d[\d,.]*[kKmM]?)"?/i
    );
    const likesM = objSlice.match(
      /"(?:likes|like|likeCount|likes_count)"\s*:\s*"?(\d[\d,.]*[kKmM]?)"?/i
    );
    const durM = objSlice.match(
      /"(?:duration|time|length)"\s*:\s*"([^"]{1,25})"/i
    );

    if (titleM && thumbM) {
      registerCandidate(candidateSlug, titleM[1], thumbM[1], {
        views: viewsM ? viewsM[1] : "0",
        comments: commentsM ? commentsM[1] : "0",
        likes: likesM ? likesM[1] : "0",
        duration: durM ? durM[1] : ""
      });
    }
  }

  const watchRegex = /\/watch\/([a-zA-Z0-9_-]{5,160})/g;
  let wm;
  while ((wm = watchRegex.exec(normalizedText)) !== null) {
    const candidateSlug = wm[1];
    if (seen.has(candidateSlug)) continue;
    const windowStart = Math.max(0, wm.index - 600);
    const windowEnd = Math.min(normalizedText.length, wm.index + 950);
    const chunk = normalizedText.slice(windowStart, windowEnd);

    const titleM =
      chunk.match(/"(?:title|name|alt|vod_name)"\s*:\s*"([^"]{3,240})"/i) ||
      chunk.match(/<h[1-5][^>]*>([\s\S]*?)<\/h[1-5]>/i) ||
      chunk.match(/\balt=["']([^"']{3,220})["']/i);
    const thumbM =
      chunk.match(
        /"(?:thumbnail|thumb|poster|image|cover|pic|vod_pic|thumbnailUrl|posterUrl|thumbUrl|src)"\s*:\s*"(https?:\/\/[^"\s]+|\/[^"\s]+)"/i
      ) ||
      chunk.match(
        /<img\b[^>]*\bsrc=["'](https?:\/\/[^"'\s]+|\/[^"'\s]+)["']/i
      );

    registerCandidate(
      candidateSlug,
      titleM ? titleM[1] : candidateSlug.replace(/-/g, " "),
      thumbM ? thumbM[1] : ""
    );
  }

  return items;
}

async function fetchQmhVideoList({ page = 1, q = "", sortBy = "latest" }) {
  const qmhHeaders = {
    ...BROWSER_HEADERS,
    Referer: `${QMH_DOMAIN}/`
  };
  const rscHeaders = {
    ...qmhHeaders,
    RSC: "1"
  };

  const pageParam = page > 1 ? `&page=${page}` : "";
  const qParam = q ? `&q=${encodeURIComponent(q)}` : "";

  const urlsToTry = [
    {
      url: `https://api.qmhv3.top/api/videos?category=movie&page=${page}&limit=36&sort=${sortBy}${qParam}`,
      headers: { ...qmhHeaders, Origin: QMH_DOMAIN }
    },
    {
      url: `${QMH_DOMAIN}/?tab=movie&category=movie${pageParam}${qParam}`,
      headers: qmhHeaders
    },
    {
      url: `${QMH_DOMAIN}/?tab=movie&category=movie${pageParam}${qParam}`,
      headers: rscHeaders
    },
    {
      url: `${QMH_DOMAIN}/?tab=casino&category=movie${pageParam}${qParam}`,
      headers: qmhHeaders
    },
    {
      url: `${QMH_DOMAIN}/${page > 1 ? `?page=${page}` : ""}`,
      headers: qmhHeaders
    }
  ];

  const responses = await Promise.all(
    urlsToTry.map((u) => fetchFastText(u.url, u.headers, 3800))
  );

  const combinedMap = new Map();
  let maxDetectedPages = page + 5;

  for (const res of responses) {
    if (!res.text || res.text.length < 50) continue;
    const trimmed = res.text.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      const normalized = normalizeQmhJsonItems(trimmed, QMH_DOMAIN);
      if (normalized && normalized.items.length > 0) {
        maxDetectedPages = Math.max(maxDetectedPages, normalized.totalPages);
        for (const item of normalized.items) {
          if (q && !item.title.toLowerCase().includes(q.toLowerCase())) {
            continue;
          }
          if (!combinedMap.has(item.slug)) {
            combinedMap.set(item.slug, item);
          }
        }
      }
    }
  }

  for (const res of responses) {
    if (!res.text || res.text.length < 100) continue;
    const extracted = parseQmhListFromHtml(res.text, QMH_DOMAIN);
    for (const item of extracted) {
      if (q && !item.title.toLowerCase().includes(q.toLowerCase())) {
        continue;
      }
      if (!combinedMap.has(item.slug)) {
        combinedMap.set(item.slug, item);
      }
    }
  }

  if (combinedMap.size > 0 && combinedMap.size < 16 && !q) {
    const seedSlugs = [...combinedMap.keys()]
      .slice(0, 2)
      .map((s) => s.replace(/^qmh__/, ""));
    const watchSeeds = await Promise.all(
      seedSlugs.map((slug) =>
        fetchFastText(`${QMH_DOMAIN}/watch/${slug}`, qmhHeaders, 3500)
      )
    );
    for (const ws of watchSeeds) {
      if (!ws.text) continue;
      const extra = parseQmhListFromHtml(ws.text, QMH_DOMAIN);
      for (const item of extra) {
        if (!combinedMap.has(item.slug)) {
          combinedMap.set(item.slug, item);
        }
      }
    }
  }

  const finalItems = sortVideoItems([...combinedMap.values()], sortBy);
  if (finalItems.length > 0) {
    const sampleHtml = responses.find((r) => r.text.length > 500)?.text || "";
    const totalPages = Math.max(
      maxDetectedPages,
      extractTotalPagesFromHtml(sampleHtml, page, false)
    );
    return {
      items: finalItems,
      page,
      totalPages,
      total: totalPages * finalItems.length,
      categories: []
    };
  }

  return {
    items: [],
    page,
    totalPages: 1,
    total: 0,
    categories: []
  };
}

function extractQmhVideoStreamsFromHtml(rawHtml = "", realSlug = "") {
  const streams = [];
  const iframes = [];
  const seen = new Set();

  const text = unescapeNextRscText(rawHtml);

  const addCandidate = (rawUrl, forcedType = "") => {
    if (!rawUrl || typeof rawUrl !== "string") return;
    let u = rawUrl
      .trim()
      .replace(/^['"]+|['"]+$/g, "")
      .replace(/\\+/g, "");

    if (u.includes("url=") || u.includes("src=")) {
      try {
        const parsed = new URL(u, QMH_DOMAIN);
        const inner =
          parsed.searchParams.get("url") ||
          parsed.searchParams.get("src") ||
          parsed.searchParams.get("file");
        if (inner && /^https?:\/\//i.test(inner)) {
          u = inner;
        }
      } catch (_) {}
    }

    if (u.startsWith("//")) u = `https:${u}`;
    else if (u.startsWith("/")) u = `${QMH_DOMAIN}${u}`;

    if (!/^https?:\/\//i.test(u)) return;
    if (isStaticAsset(u)) return;

    const lower = u.toLowerCase();
    if (IGNORE_DOMAINS.some((d) => lower.includes(d))) return;

    if (
      lower.includes("/watch/") ||
      lower.includes("/api/videos") ||
      lower === `${QMH_DOMAIN.toLowerCase()}` ||
      lower === `${QMH_DOMAIN.toLowerCase()}/` ||
      lower.includes("/?tab=") ||
      lower.includes("/?category=") ||
      lower.includes("t.me/") ||
      lower.includes("telegram") ||
      lower.includes("/login") ||
      lower.includes("/register") ||
      lower.includes("preview") ||
      lower.includes("trailer")
    ) {
      return;
    }

    if (seen.has(u)) return;

    const isHls =
      forcedType === "hls" ||
      lower.includes(".m3u8") ||
      lower.includes("/hls/") ||
      lower.includes("/playlist") ||
      lower.includes("/master") ||
      lower.includes("mpegurl");

    const isMp4 =
      forcedType === "mp4" ||
      lower.includes(".mp4") ||
      lower.includes(".webm") ||
      lower.includes(".mov") ||
      lower.includes("googlevideo.com/videoplayback");

    if (isHls || isMp4) {
      seen.add(u);
      streams.push({ url: u, type: isMp4 ? "mp4" : "hls" });
      return;
    }

    const isKnownEmbed =
      DIRECT_IFRAME_HOSTS.some((h) => lower.includes(h)) ||
      PROXY_PREFERRED_HOSTS.filter((h) => h !== "qmhv3").some((h) =>
        lower.includes(h)
      ) ||
      /\/(?:embed|e|v|player|play)\/[a-zA-Z0-9_-]{4,}/i.test(u);

    if (isKnownEmbed) {
      seen.add(u);
      iframes.push({ url: u, type: "iframe" });
    }
  };

  const slugPattern = `"${realSlug}"`;
  let primaryScope = "";
  let searchPos = 0;

  while (true) {
    const idx = text.indexOf(slugPattern, searchPos);
    if (idx === -1) break;
    searchPos = idx + slugPattern.length;

    const start = Math.max(0, idx - 600);
    const afterChunk = text.slice(idx, Math.min(text.length, idx + 3500));
    const nextSlugRel = afterChunk
      .slice(slugPattern.length)
      .search(/"slug"\s*:/);
    const end =
      nextSlugRel !== -1
        ? idx + slugPattern.length + nextSlugRel
        : Math.min(text.length, idx + 3500);

    primaryScope += "\n" + text.slice(start, end);
  }

  const scopes = primaryScope ? [primaryScope, text] : [text];

  for (const scope of scopes) {
    const mediaTagRegex =
      /<(video|source|iframe)\b[^>]*?\b(?:src|data-src)=["']([^"']+)["'][^>]*>/gi;
    let m;
    while ((m = mediaTagRegex.exec(scope)) !== null) {
      const tag = m[1].toLowerCase();
      const src = m[2];
      if (tag === "iframe") {
        addCandidate(src, "iframe");
      } else {
        addCandidate(
          src,
          src.toLowerCase().includes(".mp4") ? "mp4" : "hls"
        );
      }
    }

    const fieldRegex =
      /"(?:videoUrl|video_url|streamUrl|stream_url|playUrl|play_url|hlsUrl|hls_url|m3u8Url|m3u8_url|mp4Url|mp4_url|file|source|videoSource|securedLink|contentUrl|embedUrl|embed_url|iframeUrl|iframe_url|src|url)"\s*:\s*"(https?:\/\/[^"\s]+|\/[^"\s]+)"/gi;
    while ((m = fieldRegex.exec(scope)) !== null) {
      const key = m[0].split(":")[0].toLowerCase();
      const val = m[1];
      if (isStaticAsset(val)) continue;
      if (key.includes("embed") || key.includes("iframe")) {
        addCandidate(val, "iframe");
      } else if (
        key.includes("hls") ||
        key.includes("m3u8") ||
        key.includes("stream") ||
        key.includes("play") ||
        key.includes("video") ||
        key.includes("file") ||
        key.includes("source")
      ) {
        addCandidate(
          val,
          val.toLowerCase().includes(".mp4")
            ? "mp4"
            : val.toLowerCase().includes(".m3u8")
            ? "hls"
            : ""
        );
      }
    }

    const directStreamRegex =
      /https?:\/\/[^\s"'<>\\`]+?\.(?:m3u8|mp4)(?:\?[^\s"'<>\\`]*)?/gi;
    while ((m = directStreamRegex.exec(scope)) !== null) {
      addCandidate(
        m[0],
        m[0].toLowerCase().includes(".mp4") ? "mp4" : "hls"
      );
    }

    if (streams.length > 0 || iframes.length > 0) {
      break;
    }
  }

  return { streams, iframes };
}

async function fetchQmhVideoDetail(cleanSlug = "") {
  const realSlug = cleanSlug.replace(/^qmh__/, "").replace(/^\/+|\/+$/g, "");
  const postLink = `${QMH_DOMAIN}/watch/${realSlug}`;
  const qmhHeaders = {
    ...BROWSER_HEADERS,
    Referer: `${QMH_DOMAIN}/`
  };
  const rscHeaders = {
    ...qmhHeaders,
    RSC: "1"
  };

  let title = realSlug.replace(/-/g, " ");
  let thumbnail = FALLBACK_THUMB;
  const allStreams = [];
  const allIframes = [];
  const customSources = [];
  const tags = [];
  const debugInfo = { baseDomain: QMH_DOMAIN, htmlVia: "none" };

  const unwrapQmhMediaUrl = (rawUrl = "") => {
    if (!rawUrl) return "";
    let u = unescapeNextRscText(String(rawUrl).trim());
    if (u.includes("url=") || u.includes("src=")) {
      try {
        const parsed = new URL(u, QMH_DOMAIN);
        const innerUrl =
          parsed.searchParams.get("url") || parsed.searchParams.get("src");
        if (innerUrl && innerUrl.startsWith("http")) {
          return innerUrl;
        }
      } catch (_) {}
    }
    if (u.startsWith("//")) return `https:${u}`;
    if (u.startsWith("/")) return `${QMH_DOMAIN}${u}`;
    return u;
  };

  const [htmlRes, rscRes] = await Promise.all([
    fetchFastText(postLink, qmhHeaders, 3200),
    fetchFastText(postLink, rscHeaders, 3000)
  ]);

  const watchCookies = htmlRes.cookies || rscRes.cookies || "";
  debugInfo.htmlVia = htmlRes.via;
  debugInfo.htmlLength = htmlRes.text.length;

  const addQmhSource = (
    rawUrl,
    type = "hls",
    label = "Server #1",
    refererOverride = "",
    embedCookies = ""
  ) => {
    const mediaUrl = unwrapQmhMediaUrl(rawUrl);
    if (!mediaUrl || !mediaUrl.startsWith("http")) return;

    const effectiveReferer = refererOverride || postLink;
    const mergedCookies = embedCookies || watchCookies;
    const cookieSuffix = mergedCookies
      ? `&cookie=${encodeURIComponent(mergedCookies)}`
      : "";

    const lower = mediaUrl.toLowerCase();
    const isDirectMedia =
      type === "hls" ||
      type === "mp4" ||
      lower.includes(".m3u8") ||
      lower.includes(".mp4") ||
      lower.includes("/hls/") ||
      lower.includes("mpegurl");

    if (isDirectMedia) {
      const streamType = lower.includes(".mp4") ? "mp4" : "hls";
      allStreams.push(mediaUrl);

      const fastHybridUrl = `/api/videos?rawProxy=1&url=${encodeURIComponent(mediaUrl)}&referer=${encodeURIComponent(effectiveReferer)}${cookieSuffix}`;
      const fullProxyUrl = `/api/videos?rawProxy=1&proxySegments=1&url=${encodeURIComponent(mediaUrl)}&referer=${encodeURIComponent(effectiveReferer)}${cookieSuffix}`;
      const standalonePlayerUrl = `/api/videos?qmhPlayerProxy=1&url=${encodeURIComponent(mediaUrl)}&postUrl=${encodeURIComponent(postLink)}&referer=${encodeURIComponent(effectiveReferer)}`;

      customSources.push({
        label: `${label} (VIP)`,
        name: `${label} (VIP)`,
        url: fastHybridUrl,
        src: fastHybridUrl,
        rawUrl: mediaUrl,
        backupUrl: standalonePlayerUrl,
        type: streamType,
        priority: 1
      });
      customSources.push({
        label: `${label} (Player Dự Phòng)`,
        name: `${label} (Player Dự Phòng)`,
        url: standalonePlayerUrl,
        src: standalonePlayerUrl,
        rawUrl: mediaUrl,
        backupUrl: fullProxyUrl,
        type: "iframe",
        priority: 2
      });
      customSources.push({
        label: `${label} (VIP Proxy 2)`,
        name: `${label} (VIP Proxy 2)`,
        url: fullProxyUrl,
        src: fullProxyUrl,
        rawUrl: mediaUrl,
        backupUrl: mediaUrl,
        type: streamType,
        priority: 3
      });
      customSources.push({
        label: `${label} (Trực tiếp)`,
        name: `${label} (Trực tiếp)`,
        url: mediaUrl,
        src: mediaUrl,
        rawUrl: mediaUrl,
        backupUrl: fastHybridUrl,
        type: streamType,
        priority: 4
      });
    } else {
      allIframes.push(mediaUrl);
      const proxyEmbedUrl = `/api/videos?embedProxy=1&url=${encodeURIComponent(mediaUrl)}&referer=${encodeURIComponent(effectiveReferer)}`;
      customSources.push({
        label: `${label} (Embed)`,
        name: `${label} (Embed)`,
        url: mediaUrl,
        src: mediaUrl,
        backupUrl: proxyEmbedUrl,
        type: "iframe",
        priority: 5
      });
      customSources.push({
        label: `${label} (Embed Proxy)`,
        name: `${label} (Embed Proxy)`,
        url: proxyEmbedUrl,
        src: proxyEmbedUrl,
        backupUrl: mediaUrl,
        type: "iframe",
        priority: 6
      });
    }
  };

  const combinedWatchText = `${htmlRes.text || ""}\n${rscRes.text || ""}`;
  if (combinedWatchText.trim()) {
    const cleanWatch = unescapeNextRscText(combinedWatchText);

    const titleM =
      cleanWatch.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) ||
      cleanWatch.match(/"title"\s*:\s*"([^"]{3,220})"/i) ||
      cleanWatch.match(/<title>([\s\S]*?)<\/title>/i);
    if (titleM) {
      title = cleanText(titleM[1]).replace(/\s*[-|–]\s*QMH.*$/i, "");
    }

    const ogImg =
      cleanWatch.match(
        /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i
      ) ||
      cleanWatch.match(
        /"(?:thumbnail|poster|thumb|cover)"\s*:\s*"(https?:\/\/[^"\s]+|\/[^"\s]+)"/i
      );
    if (ogImg && ogImg[1]) {
      thumbnail =
        normalizeQmhThumbUrl(ogImg[1], QMH_DOMAIN) || FALLBACK_THUMB;
    }

    const { streams: foundStreams, iframes: foundIframes } =
      extractQmhVideoStreamsFromHtml(combinedWatchText, realSlug);

    debugInfo.foundStreams = foundStreams;
    debugInfo.foundIframes = foundIframes;

    let srvIndex = 1;
    for (const s of foundStreams) {
      addQmhSource(s.url, s.type, `Server #${srvIndex++}`);
    }

    if (foundIframes.length > 0) {
      const resolvedList = await Promise.all(
        foundIframes.slice(0, 2).map((ifr) =>
          resolveEmbedPage(ifr.url, postLink).then((res) => ({
            ifr,
            ...res
          }))
        )
      );
      for (const item of resolvedList) {
        const label = `Server #${srvIndex++}`;
        for (const ds of item.directStreams || []) {
          addQmhSource(
            ds.url,
            ds.type,
            label,
            ds.referer || item.ifr.url,
            ds.embedCookies
          );
        }
        addQmhSource(item.ifr.url, "iframe", label);
      }
    }
  }

  customSources.sort((a, b) => (a.priority || 5) - (b.priority || 5));

  const uniqueSources = [];
  const seenUrls = new Set();
  for (const s of customSources) {
    if (!s.url || seenUrls.has(s.url)) continue;
    seenUrls.add(s.url);
    uniqueSources.push(s);
  }

  const streams = [...new Set(allStreams)];
  const iframes = [...new Set(allIframes)];
  const primarySource = uniqueSources[0] || null;
  const primaryUrl = primarySource?.url || streams[0] || iframes[0] || "";
  const primaryType = primarySource?.type || (streams[0] ? "hls" : "iframe");

  return {
    id: `qmh__${realSlug}`,
    slug: `qmh__${realSlug}`,
    title,
    category: "qmh-movie",
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
    sources: uniqueSources,
    _debug: debugInfo
  };
}

// =====================================================================
// HÀM PROXY LUỒNG DỮ LIỆU / HLS SIÊU TỐC (XỬ LÝ CẢ KEY VÀ FRAGMENT)
// =====================================================================
function rewriteM3u8Manifest(
  m3u8Text,
  basePlaylistUrl,
  buildProxyUrl,
  proxySegments
) {
  return m3u8Text
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith("#")) {
        return line.replace(/URI=["']([^"']+)["']/gi, (_, uri) => {
          if (uri.startsWith("data:") || uri.includes("/api/videos?")) {
            return `URI="${uri}"`;
          }
          try {
            const abs = new URL(uri, basePlaylistUrl).toString();
            if (!proxySegments) {
              return `URI="${abs}"`;
            }
            return `URI="${buildProxyUrl(abs, true, true)}"`;
          } catch (_) {
            return `URI="${uri}"`;
          }
        });
      }
      if (trimmed.includes("/api/videos?")) return trimmed;
      try {
        const abs = new URL(trimmed, basePlaylistUrl).toString();
        const lowerAbs = abs.toLowerCase().split("?")[0];
        const isSubPlaylist =
          lowerAbs.endsWith(".m3u8") ||
          lowerAbs.includes("/playlist") ||
          lowerAbs.includes("/chunklist") ||
          lowerAbs.includes("/index");

        if (isSubPlaylist || proxySegments) {
          return buildProxyUrl(abs, proxySegments, false);
        }
        return abs;
      } catch (_) {
        return line;
      }
    })
    .join("\n");
}

async function fetchBinaryRace(targetUrl, headers, timeoutMs = 4000) {
  const checkValidBinary = async (res) => {
    if (!res.ok && res.status !== 206) throw new Error("status_" + res.status);
    const buf = await res.arrayBuffer();
    if (!buf || buf.byteLength === 0) throw new Error("empty");
    const head = Buffer.from(buf.slice(0, 15)).toString("utf-8").toLowerCase();
    if (
      head.startsWith("<!doctype") ||
      head.startsWith("<html") ||
      head.includes("just a moment")
    ) {
      throw new Error("html_error_page");
    }
    return {
      buffer: buf,
      status: res.status,
      contentType: res.headers.get("content-type") || ""
    };
  };

  const candidates = [
    fetchWithTimeout(targetUrl, { headers }, timeoutMs).then(checkValidBinary),
    fetchWithTimeout(
      `https://cors.eu.org/${targetUrl}`,
      {
        headers: {
          "User-Agent": BROWSER_HEADERS["User-Agent"],
          Origin: QMH_DOMAIN,
          Referer: `${QMH_DOMAIN}/`
        }
      },
      timeoutMs
    ).then(checkValidBinary),
    fetchWithTimeout(
      `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`,
      {},
      timeoutMs
    ).then(checkValidBinary),
    fetchWithTimeout(
      `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
      {},
      timeoutMs
    ).then(checkValidBinary)
  ];

  try {
    return await Promise.any(candidates);
  } catch (_) {
    return null;
  }
}

async function handleRawProxy(req) {
  const sp = req.nextUrl.searchParams;
  const targetUrl = sp.get("url");
  const referer = sp.get("referer") || `${DEFAULT_DOMAIN}/`;
  const cookie = sp.get("cookie") || "";
  const proxySegments = sp.get("proxySegments") === "1";
  const isKeyRequest =
    sp.get("isKey") === "1" ||
    /\.(?:key|bin)(?:\?|$)|\/key(?:\?|$|\/)/i.test(targetUrl || "");

  if (!targetUrl) {
    return new NextResponse("Missing url", { status: 400, headers: CORS });
  }

  try {
    const isQmhTarget =
      targetUrl.includes("qmhv3.top") || referer.includes("qmhv3.top");
    let refOrigin = isQmhTarget ? QMH_DOMAIN : DEFAULT_DOMAIN;
    if (!isQmhTarget) {
      try {
        refOrigin = new URL(referer).origin;
      } catch (_) {}
    }

    const effectiveReferer = isQmhTarget ? `${QMH_DOMAIN}/` : referer;
    const method = (req.method || "GET").toUpperCase();
    const isMediaStream =
      isKeyRequest ||
      isQmhTarget ||
      /\.(?:m3u8|ts|mp4|webm|m4s|key)(?:\?|$)|\/hls\//i.test(targetUrl);

    const headers = {
      "User-Agent": BROWSER_HEADERS["User-Agent"],
      Accept: "*/*",
      "Accept-Language": BROWSER_HEADERS["Accept-Language"],
      Origin: refOrigin,
      Referer: effectiveReferer,
      ...(isQmhTarget
        ? {
            "Sec-Fetch-Site": "same-site",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Dest": "empty"
          }
        : {})
    };

    const reqContentType = req.headers.get("content-type");
    if (reqContentType) headers["Content-Type"] = reqContentType;

    if (!isMediaStream && (method === "POST" || targetUrl.includes("/api/"))) {
      headers["X-Requested-With"] =
        req.headers.get("x-requested-with") || "XMLHttpRequest";
    }

    const rangeHeader = req.headers.get("range");
    if (rangeHeader && !isKeyRequest) headers["Range"] = rangeHeader;

    if (cookie) headers["Cookie"] = cookie;

    const selfOrigin = req.nextUrl.origin;
    const buildProxyUrl = (absUrl, forceSegFlag = false, isKey = false) =>
      `${selfOrigin}/api/videos?rawProxy=1${
        forceSegFlag ? "&proxySegments=1" : ""
      }${isKey ? "&isKey=1" : ""}&url=${encodeURIComponent(
        absUrl
      )}&referer=${encodeURIComponent(effectiveReferer)}${
        cookie ? `&cookie=${encodeURIComponent(cookie)}` : ""
      }`;

    if (isKeyRequest) {
      const keyResult = await fetchBinaryRace(targetUrl, headers, 3500);
      if (keyResult && keyResult.buffer) {
        return new NextResponse(keyResult.buffer, {
          status: 200,
          headers: {
            ...CORS,
            "Content-Type": "application/octet-stream",
            "Cache-Control": "public, max-age=3600"
          }
        });
      }
      return new NextResponse("Key fetch failed", {
        status: 502,
        headers: CORS
      });
    }

    const lowerTarget = targetUrl.toLowerCase().split("?")[0];
    const isExplicitM3u8 =
      lowerTarget.endsWith(".m3u8") ||
      lowerTarget.includes("/playlist") ||
      lowerTarget.includes("/master");

    if (isExplicitM3u8) {
      const fastRes = await fetchFastText(targetUrl, headers, 3500);
      if (fastRes.text && fastRes.text.trim().startsWith("#EXTM3U")) {
        const rewritten = rewriteM3u8Manifest(
          fastRes.text,
          targetUrl,
          buildProxyUrl,
          proxySegments
        );
        return new NextResponse(rewritten, {
          status: 200,
          headers: {
            ...CORS,
            "Content-Type": "application/vnd.apple.mpegurl",
            "Cache-Control": "no-store"
          }
        });
      }
    }

    const fetchOpts = { method, headers };
    if (method !== "GET" && method !== "HEAD") {
      const bodyBuf = await req.arrayBuffer();
      if (bodyBuf && bodyBuf.byteLength > 0) {
        fetchOpts.body = bodyBuf;
      }
    }

    let upstream = null;
    try {
      upstream = await fetchWithTimeout(targetUrl, fetchOpts, 4000);
    } catch (_) {}

    if (!upstream || (!upstream.ok && upstream.status !== 206)) {
      const binFallback = await fetchBinaryRace(targetUrl, headers, 4500);
      if (binFallback && binFallback.buffer) {
        let outType = binFallback.contentType || "video/mp2t";
        if (
          lowerTarget.endsWith(".ts") ||
          (isQmhTarget && !lowerTarget.endsWith(".mp4"))
        ) {
          outType = "video/mp2t";
        }
        return new NextResponse(binFallback.buffer, {
          status: binFallback.status || 200,
          headers: {
            ...CORS,
            "Content-Type": outType,
            "Cache-Control": "public, max-age=3600"
          }
        });
      }
    }

    if (!upstream) {
      return new NextResponse("Upstream fetch failed", {
        status: 502,
        headers: CORS
      });
    }

    const finalTargetUrl = upstream.url || targetUrl;
    const contentType = (
      upstream.headers.get("content-type") || ""
    ).toLowerCase();

    const isPlaylistResponse =
      contentType.includes("mpegurl") ||
      (contentType.includes("text/") && !lowerTarget.endsWith(".ts"));

    if (!isPlaylistResponse && upstream.body) {
      let outContentType = upstream.headers.get("content-type") || "video/mp2t";
      if (
        lowerTarget.endsWith(".ts") ||
        (isQmhTarget &&
          lowerTarget.includes("/hls/") &&
          !lowerTarget.endsWith(".m3u8") &&
          !lowerTarget.endsWith(".mp4"))
      ) {
        outContentType = "video/mp2t";
      } else if (lowerTarget.endsWith(".mp4")) {
        outContentType = "video/mp4";
      } else if (lowerTarget.endsWith(".m4s")) {
        outContentType = "video/iso.segment";
      }

      const streamHeaders = {
        ...CORS,
        "Content-Type": outContentType,
        "Cache-Control": "public, max-age=3600"
      };
      const contentRange = upstream.headers.get("content-range");
      if (contentRange) streamHeaders["Content-Range"] = contentRange;
      const acceptRanges = upstream.headers.get("accept-ranges");
      if (acceptRanges) streamHeaders["Accept-Ranges"] = acceptRanges;
      const contentLen = upstream.headers.get("content-length");
      if (contentLen) streamHeaders["Content-Length"] = contentLen;

      return new NextResponse(upstream.body, {
        status: upstream.status,
        headers: streamHeaders
      });
    }

    const buffer = await upstream.arrayBuffer();
    const firstBytes = Buffer.from(buffer.slice(0, 16))
      .toString("utf-8")
      .trim();

    if (firstBytes.startsWith("#EXTM3U")) {
      const text = Buffer.from(buffer).toString("utf-8");
      const rewritten = rewriteM3u8Manifest(
        text,
        finalTargetUrl,
        buildProxyUrl,
        proxySegments
      );
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
        upstream.headers.get("content-type") || "video/mp2t",
      "Cache-Control": "public, max-age=3600"
    };
    const contentRange = upstream.headers.get("content-range");
    if (contentRange) resHeaders["Content-Range"] = contentRange;
    const acceptRanges = upstream.headers.get("accept-ranges");
    if (acceptRanges) resHeaders["Accept-Ranges"] = acceptRanges;

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
    .replace(/(?<![.\w$])window\.top\.location\b/g, "window.__fakeTopLoc")
    .replace(/(?<![.\w$])window\.parent\.location\b/g, "window.__fakeTopLoc")
    .replace(/(?<![.\w$])window\.location\b/g, "window.__fakeLoc")
    .replace(/(?<![.\w$])document\.location\b/g, "window.__fakeLoc")
    .replace(/(?<![.\w$])self\.location\b/g, "window.__fakeLoc")
    .replace(/(?<![.\w$])top\.location\b/g, "window.__fakeTopLoc")
    .replace(/(?<![.\w$])parent\.location\b/g, "window.__fakeTopLoc")
    .replace(
      /(?<![.\w$])location\.(href|hostname|host|origin|pathname|search|assign|replace|reload)\b/g,
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

  if (sp.get("rawProxy") === "1" || sp.get("hlsProxy") === "1") {
    return handleRawProxy(req);
  }

  // Trình phát Iframe Dự Phòng Độc Lập cho QMH (Bắt mọi domain CDN của cả Key và Fragment .ts)
  if (sp.get("qmhPlayerProxy") === "1") {
    const targetUrl = sp.get("url") || "";
    const referer = sp.get("referer") || `${QMH_DOMAIN}/`;
    const fastHybridUrl = `/api/videos?rawProxy=1&url=${encodeURIComponent(targetUrl)}&referer=${encodeURIComponent(referer)}`;

    const playerHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1" />
  <meta name="referrer" content="no-referrer" />
  <style>
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #000; overflow: hidden; }
    video { width: 100%; height: 100%; object-fit: contain; background: #000; }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.15/dist/hls.min.js"></script>
</head>
<body>
  <video id="v" controls autoplay playsinline referrerpolicy="no-referrer"></video>
  <script>
    (function() {
      var video = document.getElementById("v");
      var streamUrl = ${JSON.stringify(fastHybridUrl)};

      if (window.Hls && Hls.isSupported()) {
        var DefaultLoader = Hls.DefaultConfig.loader;
        function UniversalLoader(config) {
          this.inner = new DefaultLoader(config);
        }
        UniversalLoader.prototype.destroy = function() {
          if (this.inner) this.inner.destroy();
        };
        UniversalLoader.prototype.abort = function() {
          if (this.inner) this.inner.abort();
        };
        UniversalLoader.prototype.load = function(context, config, callbacks) {
          var url = context.url || "";
          var isBinary = context.responseType === "arraybuffer";
          var rawUrl = url;
          if (url.indexOf("/api/videos?") !== -1 && url.indexOf("url=") !== -1) {
            try {
              var uObj = new URL(url, window.location.origin);
              rawUrl = uObj.searchParams.get("url") || url;
            } catch (e) {}
          }
          if (isBinary && /^https?:\\/\\//i.test(rawUrl)) {
            var startTime = performance.now();
            var isKey = rawUrl.indexOf(".key") !== -1 || rawUrl.indexOf("/key") !== -1 || Boolean(context.decryptdata && !context.frag);
            var proxyFallback = "/api/videos?rawProxy=1" + (isKey ? "&isKey=1" : "&proxySegments=1") + "&url=" + encodeURIComponent(rawUrl) + "&referer=" + encodeURIComponent("https://qmhv3.top/");
            var corsEu = "https://cors.eu.org/" + rawUrl;

            var checkBuf = function(r) {
              if (!r.ok && r.status !== 206) throw new Error("status_" + r.status);
              return r.arrayBuffer().then(function(b) {
                if (!b || b.byteLength === 0) throw new Error("empty");
                return b;
              });
            };

            Promise.any([
              fetch(rawUrl, { referrerPolicy: "no-referrer", mode: "cors", credentials: "omit", cache: "no-store" }).then(checkBuf),
              fetch(proxyFallback, { cache: "no-store" }).then(checkBuf),
              fetch(corsEu, { referrerPolicy: "no-referrer", mode: "cors", credentials: "omit", cache: "no-store" }).then(checkBuf)
            ]).then(function(buf) {
              var now = performance.now();
              var stats = {
                aborted: false,
                loaded: buf.byteLength,
                total: buf.byteLength,
                retry: 0,
                chunkCount: 1,
                bwEstimate: 0,
                loading: { start: startTime, first: now, end: now },
                parsing: { start: now, end: now },
                buffering: { start: now, first: now, end: now }
              };
              callbacks.onSuccess({ url: rawUrl, data: buf }, stats, context, null);
            }).catch(function(err) {
              callbacks.onError({ code: 403, text: err.message }, context, null, {});
            });
            return;
          }
          this.inner.load(context, config, callbacks);
        };

        var hls = new Hls({
          enableWorker: false,
          lowLatencyMode: false,
          fLoader: UniversalLoader
        });
        hls.loadSource(streamUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, function() {
          video.play().catch(function(){});
        });
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = streamUrl;
        video.play().catch(function(){});
      }
    })();
  </script>
</body>
</html>`;

    return new NextResponse(playerHtml, {
      status: 200,
      headers: {
        ...CORS,
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store"
      }
    });
  }

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
        6000
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
        7000
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
            var RAW_PROXY = "/api/videos?rawProxy=1";
            var SCRIPT_PROXY = "/api/videos?scriptProxy=1";

            if (VIDEO_UUID && !window.videoId) {
              window.videoId = VIDEO_UUID;
            }

            function resolveTargetAbs(rawUrl) {
              if (!rawUrl || typeof rawUrl !== "string") return rawUrl;
              var u = rawUrl;
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

  // =================================================================
  // NHÁNH ĐỘC LẬP CHO NGUỒN QMHV3.TOP (`qmh-movie` / `qmh__...`)
  // =================================================================
  if (rawSlugParam) {
    const decodedSlugCheck = decodeSlug(rawSlugParam);
    if (decodedSlugCheck.startsWith("qmh__")) {
      const qmhVideo = await fetchQmhVideoDetail(decodedSlugCheck);
      return NextResponse.json(qmhVideo, { status: 200, headers: CORS });
    }
  }

  if (category === "qmh-movie" && !rawSlugParam) {
    const qmhList = await fetchQmhVideoList({ page, q, sortBy });
    return NextResponse.json(qmhList, { status: 200, headers: CORS });
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

  if (baseHost.includes("qmhv3")) {
    if (rawSlugParam) {
      const qmhVideo = await fetchQmhVideoDetail(decodeSlug(rawSlugParam));
      return NextResponse.json(qmhVideo, { status: 200, headers: CORS });
    }
    const qmhList = await fetchQmhVideoList({ page, q, sortBy });
    return NextResponse.json(qmhList, { status: 200, headers: CORS });
  }

  const reqHeaders = { ...BROWSER_HEADERS, Referer: `${baseDomain}/` };

  // =================================================================
  // TRƯỜNG HỢP 1: LẤY CHI TIẾT VIDEO VIET69 THEO SLUG
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
      let postLink = `${baseDomain}/${cleanSlug}/`;
      const allStreams = [];
      const allIframes = [];
      const customSources = [];
      const tags = [];
      const debugInfo = { baseDomain, wpStatus: 0, htmlVia: "none" };

      let fetchResult = await fetchHtmlWithFallback(
        postLink,
        reqHeaders,
        true,
        true
      );

      if (!fetchResult.html) {
        const barePostSlug = cleanSlug.replace(/^bai-viet\//i, "");
        const altCandidates = cleanSlug.startsWith("bai-viet/")
          ? [`${baseDomain}/${barePostSlug}/`]
          : [`${baseDomain}/bai-viet/${barePostSlug}/`];

        for (const altUrl of altCandidates) {
          const altRes = await fetchHtmlWithFallback(
            altUrl,
            reqHeaders,
            true,
            true
          );
          if (altRes.html) {
            fetchResult = altRes;
            postLink = altUrl;
            break;
          }
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
            backupUrl: mediaItem.url,
            proxyUrl: proxyStreamUrl,
            type: mediaItem.type,
            priority: isAlive ? 1 : 9
          });
          customSources.push({
            label: `${baseLabel} (Trực tiếp)`,
            name: `${baseLabel} (Trực tiếp)`,
            url: mediaItem.url,
            src: mediaItem.url,
            backupUrl: proxyStreamUrl,
            type: mediaItem.type,
            priority: isAlive ? 3 : 9
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

        const articleScopeMatch = pageHtml.match(
          /<article[\s\S]*?<\/article>/i
        );
        const tagScope = articleScopeMatch ? articleScopeMatch[0] : pageHtml;
        const tagRegex =
          /<a[^>]+href=["']?https?:\/\/[^"'\s>]+\/(tag\/[^"'/\s>]+)\/?["']?[^>]*>([\s\S]*?)<\/a>/gi;
        const seenTags = new Set();
        let tm;
        while ((tm = tagRegex.exec(tagScope)) !== null) {
          const tSlug = tm[1].replace(/^\/+|\/+$/g, "");
          const tName = cleanText(tm[2]);
          if (tName && !seenTags.has(tSlug) && tags.length < 20) {
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
              postLink
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

      customSources.sort((a, b) => (a.priority || 5) - (b.priority || 5));

      const uniqueSources = [];
      const seenUrls = new Set();
      for (const s of customSources) {
        if (!s.url || seenUrls.has(s.url)) continue;
        seenUrls.add(s.url);
        uniqueSources.push(s);
      }

      const streams = [...new Set(allStreams)];
      const iframes = [...new Set(allIframes)];
      const primarySource = uniqueSources[0] || null;
      const primaryUrl = primarySource?.url || streams[0] || iframes[0] || "";
      const primaryType = primarySource?.type || (streams[0] ? "hls" : "iframe");

      return NextResponse.json(
        {
          id: cleanSlug,
          slug: cleanSlug,
          title,
          category: cleanSlug.startsWith("bai-viet/")
            ? "video-cua-thanh-vien"
            : "movie",
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
  // TRƯỜNG HỢP 2: LẤY DANH SÁCH VIDEO VIET69
  // =================================================================
  try {
    const cleanCat = decodeSlug(category);
    const bareSlug = cleanCat.replace(/^(?:category|tag)\//i, "");
    const isMemberCat =
      bareSlug === "video-cua-thanh-vien" || bareSlug === "bai-viet";
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

      const { html } = await fetchHtmlWithFallback(
        targetUrl,
        reqHeaders,
        true,
        false
      );
      if (html) {
        const navCategories = extractNavCategories(html, baseDomain, baseHost);
        const rawItems = parseVideoListHtml(
          html,
          baseDomain,
          baseHost,
          "all"
        );
        const items = sortVideoItems(rawItems, sortBy);
        const totalPages = extractTotalPagesFromHtml(html, page, false);

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
      if (!navPathCache.has(bareSlug) && !navPathCache.has(cleanCat)) {
        try {
          const { html: homeHtml } = await fetchHtmlWithFallback(
            `${baseDomain}/`,
            reqHeaders,
            false,
            false
          );
          if (homeHtml) {
            extractNavCategories(homeHtml, baseDomain, baseHost);
          }
        } catch (_) {}
      }

      const candidateUrls = new Set();

      const addCandidateWithPagination = (basePath) => {
        const cleanP = String(basePath || "").replace(/^\/+|\/+$/g, "");
        if (!cleanP) return;
        if (
          !isMemberCat &&
          (cleanP === "bai-viet" || cleanP.includes("video-cua-thanh-vien"))
        ) {
          return;
        }
        if (page <= 1) {
          candidateUrls.add(appendSort(`${baseDomain}/${cleanP}/`));
        } else {
          candidateUrls.add(
            appendSort(`${baseDomain}/${cleanP}/page/${page}/`)
          );
          if (isMemberCat) {
            candidateUrls.add(
              appendSort(`${baseDomain}/${cleanP}/?trang=${page}`)
            );
            candidateUrls.add(
              appendSort(`${baseDomain}/${cleanP}/?paged=${page}`)
            );
          }
        }
      };

      const cachedPath =
        navPathCache.get(cleanCat) || navPathCache.get(bareSlug);
      if (cachedPath) {
        addCandidateWithPagination(cachedPath);
      }

      const mapped = CATEGORY_MAP[bareSlug];
      if (mapped && Array.isArray(mapped.paths)) {
        for (const p of mapped.paths) {
          addCandidateWithPagination(p);
        }
      }

      if (!isMemberCat) {
        if (cleanCat.startsWith("tag/") || cleanCat.startsWith("category/")) {
          addCandidateWithPagination(cleanCat);
        }
        addCandidateWithPagination(`category/${bareSlug}`);
        addCandidateWithPagination(`tag/${bareSlug}`);
        addCandidateWithPagination(bareSlug);
      }

      const urlList = [...candidateUrls].slice(0, 5);
      const parallelResults = await Promise.all(
        urlList.map(async (u) => {
          const { html } = await fetchHtmlWithFallback(
            u,
            reqHeaders,
            true,
            !isMemberCat
          );
          if (!html) return null;
          const navCategories = extractNavCategories(
            html,
            baseDomain,
            baseHost
          );
          const rawItems = parseVideoListHtml(
            html,
            baseDomain,
            baseHost,
            cleanCat
          );
          if (rawItems.length < 2) return null;
          return {
            items: sortVideoItems(rawItems, sortBy),
            totalPages: extractTotalPagesFromHtml(html, page, isMemberCat),
            categories: navCategories
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

      const fallbackKeyword =
        mapped?.keyword || bareSlug.replace(/-/g, " ");
      const searchFallbackUrl = appendSort(
        `${baseDomain}/${pageSuffix}?s=${encodeURIComponent(fallbackKeyword)}`
      );

      const { html: searchHtml } = await fetchHtmlWithFallback(
        searchFallbackUrl,
        reqHeaders,
        true,
        false
      );
      if (searchHtml) {
        const sNav = extractNavCategories(searchHtml, baseDomain, baseHost);
        const sItems = sortVideoItems(
          parseVideoListHtml(searchHtml, baseDomain, baseHost, cleanCat),
          sortBy
        );
        if (sItems.length > 0) {
          const sTotalPages = extractTotalPagesFromHtml(
            searchHtml,
            page,
            isMemberCat
          );
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
