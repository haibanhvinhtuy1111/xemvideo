import { NextResponse } from "next/server";
import vm from "vm";
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
  if (isStaticAsset(u) || isViet69PageLink(u, baseHost)) return "";
  return u;
}

// Bóc tách các nút <button class="video2-btn" data-type="..." data-video="...">
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

  // Nếu không có nút .video2-btn nhưng có thẻ .movieLoader chứa sẵn data-movie
  if (servers.length === 0) {
    const loaderMatch = html.match(
      /<div[^>]*class=["'][^"']*movieLoader[^"']*["'][^>]*>/i
    );
    if (loaderMatch) {
      const tag = loaderMatch[0];
      const videoMatch = tag.match(/\bdata-(?:movie|video)=["']([^"']+)["']/i);
      const typeMatch = tag.match(/\bdata-type=["']([^"']+)["']/i);
      if (videoMatch && videoMatch[1]) {
        const rawVideo = videoMatch[1].trim();
        servers.push({
          label: "Server #1",
          dataType: typeMatch ? typeMatch[1].trim() : "1",
          rawVideo,
          decodedVideo: decodeBase64Safe(rawVideo) || rawVideo
        });
      }
    }
  }

  return servers;
}

// Thu thập tất cả script có liên quan tới playCoverVideo / movieLoader / video2-btn
async function collectPlayerScripts(html = "", baseDomain = "", reqHeaders = {}) {
  const inlineChunks = [];
  const externalUrls = [];

  const scriptTagRegex = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = scriptTagRegex.exec(html)) !== null) {
    const attrs = m[1] || "";
    const body = m[2] || "";

    const b64SrcMatch = attrs.match(
      /(?:data-src|src)\s*=\s*["']data:text\/javascript;base64,([^"']+)["']/i
    );
    if (b64SrcMatch && b64SrcMatch[1]) {
      const decodedJs = decodeBase64Safe(b64SrcMatch[1]);
      if (decodedJs) inlineChunks.push(decodedJs);
      continue;
    }

    const srcMatch = attrs.match(/(?:data-src|src)\s*=\s*["']([^"']+)["']/i);
    if (srcMatch && srcMatch[1]) {
      let sUrl = srcMatch[1].trim();
      if (sUrl.startsWith("//")) sUrl = `https:${sUrl}`;
      else if (sUrl.startsWith("/")) sUrl = `${baseDomain}${sUrl}`;
      if (
        sUrl.startsWith("http") &&
        !IGNORE_DOMAINS.some((d) => sUrl.includes(d)) &&
        !sUrl.includes("jquery.min.js") &&
        !sUrl.includes("wp-emoji")
      ) {
        externalUrls.push(sUrl);
      }
    }

    if (body.trim()) {
      inlineChunks.push(body);
    }
  }

  const relevantScripts = inlineChunks.filter(
    (c) =>
      c.includes("playCoverVideo") ||
      c.includes("movieLoader") ||
      c.includes("video2-btn") ||
      c.includes("admin-ajax.php")
  );

  // Kiểm tra xem đã có hàm định nghĩa playCoverVideo chưa; nếu nằm ở file JS ngoài thì tải về
  const hasPlayCoverDef = relevantScripts.some(
    (c) =>
      /function\s+playCoverVideo/.test(c) ||
      /playCoverVideo\s*=/.test(c) ||
      (c.includes("playCoverVideo") && c.includes("_0x"))
  );

  if (!hasPlayCoverDef && externalUrls.length > 0) {
    const fetched = await Promise.allSettled(
      externalUrls.slice(0, 8).map(async (u) => {
        const r = await fetchWithTimeout(u, { headers: reqHeaders }, 4500);
        return r.ok ? await r.text() : "";
      })
    );
    for (const res of fetched) {
      if (
        res.status === "fulfilled" &&
        res.value &&
        (res.value.includes("playCoverVideo") ||
          res.value.includes("movieLoader") ||
          res.value.includes("video2-btn"))
      ) {
        relevantScripts.unshift(res.value);
      }
    }
  }

  return relevantScripts;
}

// Chạy trực tiếp script playCoverVideo của Viet69 trong VM Sandbox để lấy link iframe / m3u8 thật
async function runViet69Sandbox({
  scripts = [],
  servers = [],
  postLink = "",
  baseDomain = "",
  baseHost = "",
  postId = "",
  reqHeaders = {}
}) {
  const resolvedSources = [];
  let debugSnippet = "";

  if (scripts.length === 0 || servers.length === 0) {
    return { resolvedSources, debugSnippet };
  }

  const state = {
    attrs: {
      "data-movie": servers[0]?.rawVideo || "",
      "data-video": servers[0]?.rawVideo || "",
      "data-type": String(servers[0]?.dataType || "1"),
      "data-id": String(postId || "")
    },
    currentBtnAttrs: {
      "data-video": servers[0]?.rawVideo || "",
      "data-type": String(servers[0]?.dataType || "1")
    },
    outputs: [],
    ajaxCalls: [],
    clickHandlers: [],
    readyCallbacks: []
  };

  const recordOutput = (val) => {
    if (!val) return;
    if (typeof val === "string") {
      state.outputs.push(val);
    } else if (typeof val === "object") {
      if (val.src) state.outputs.push(String(val.src));
      if (val.file) state.outputs.push(String(val.file));
      if (val.innerHTML) state.outputs.push(String(val.innerHTML));
      if (val.outerHTML) state.outputs.push(String(val.outerHTML));
    }
  };

  const makeJqObject = (selector) => {
    const isBtn =
      selector === "this" ||
      (typeof selector === "string" && selector.includes("video2-btn"));

    const obj = {
      length: 1,
      0: {
        tagName: "DIV",
        innerHTML: "",
        style: {},
        dataset: new Proxy(
          {},
          {
            get: (_, prop) => {
              const key = `data-${String(prop).toLowerCase()}`;
              return isBtn ? state.currentBtnAttrs[key] : state.attrs[key];
            },
            set: (_, prop, val) => {
              const key = `data-${String(prop).toLowerCase()}`;
              state.attrs[key] = String(val);
              return true;
            }
          }
        ),
        getAttribute: (name) =>
          isBtn ? state.currentBtnAttrs[name] : state.attrs[name],
        setAttribute: (name, val) => {
          state.attrs[name] = String(val);
          if (name === "src" || name === "data-src") recordOutput(val);
        }
      },
      attr(name, val) {
        if (arguments.length === 1) {
          if (isBtn) {
            return (
              state.currentBtnAttrs[name] ??
              state.attrs[name] ??
              ""
            );
          }
          if (name === "data-movie" || name === "data-video") {
            return state.attrs["data-movie"] || state.attrs["data-video"] || "";
          }
          return state.attrs[name] ?? "";
        }
        state.attrs[name] = String(val ?? "");
        if (name === "data-video") state.attrs["data-movie"] = String(val ?? "");
        if (name === "src" || name === "data-src" || name === "file") {
          recordOutput(val);
        }
        return obj;
      },
      data(name, val) {
        const key = `data-${name}`;
        if (arguments.length === 1) {
          return obj.attr(key);
        }
        return obj.attr(key, val);
      },
      prop(name, val) {
        if (arguments.length >= 2 && name === "src") recordOutput(val);
        return obj;
      },
      val(v) {
        return arguments.length === 0 ? "" : obj;
      },
      html(val) {
        if (arguments.length === 0) {
          return state.outputs[state.outputs.length - 1] || "";
        }
        recordOutput(val);
        return obj;
      },
      text() {
        return obj;
      },
      append(val) {
        recordOutput(val);
        return obj;
      },
      prepend(val) {
        recordOutput(val);
        return obj;
      },
      replaceWith(val) {
        recordOutput(val);
        return obj;
      },
      find(subSel) {
        if (typeof subSel === "string" && subSel.includes("video2-btn")) {
          return makeJqObject(".video2-btn");
        }
        return obj;
      },
      first() {
        return obj;
      },
      last() {
        return obj;
      },
      eq() {
        return obj;
      },
      parent() {
        return obj;
      },
      parents() {
        return [obj, obj, obj];
      },
      children() {
        return obj;
      },
       closest() {
        return obj;
      },
       siblings() {
        return obj;
      },
      addClass() {
        return obj;
      },
      removeClass() {
        return obj;
      },
      toggleClass() {
        return obj;
      },
      removeAttr() {
        return obj;
      },
      css() {
        return obj;
      },
      show() {
        return obj;
      },
      hide() {
        return obj;
      },
      slideToggle() {
        return obj;
      },
      fadeIn() {
        return obj;
      },
      fadeOut() {
        return obj;
      },
      empty() {
        return obj;
      },
      remove() {
        return obj;
      },
      click(fn) {
        if (typeof fn === "function" && isBtn) {
          state.clickHandlers.push(fn);
        }
        return obj;
      },
      on(evt, selOrFn, maybeFn) {
        const fn = typeof maybeFn === "function" ? maybeFn : selOrFn;
        if (typeof evt === "string" && evt.includes("click") && typeof fn === "function") {
          state.clickHandlers.push(fn);
        }
        return obj;
      },
      ready(fn) {
        if (typeof fn === "function") state.readyCallbacks.push(fn);
        return obj;
      },
      each(fn) {
        if (typeof fn === "function") {
          try {
            fn.call(obj, 0, obj[0]);
          } catch (_) {}
        }
        return obj;
      }
    };
    return obj;
  };

  const jq = function (sel, ctx) {
    if (typeof sel === "function") {
      state.readyCallbacks.push(sel);
      return makeJqObject("document");
    }
    if (typeof sel === "string" && sel.trim().startsWith("<")) {
      recordOutput(sel);
      if (ctx && typeof ctx === "object" && ctx.src) {
        recordOutput(ctx.src);
      }
    }
    if (sel && sel.__isBtnMock) {
      return makeJqObject("this");
    }
    return makeJqObject(typeof sel === "string" ? sel : "element");
  };

  jq.ajax = function (urlOrOpts, maybeOpts) {
    const opts =
      typeof urlOrOpts === "string"
        ? { url: urlOrOpts, ...(maybeOpts || {}) }
        : urlOrOpts || {};
    state.ajaxCalls.push(opts);
    return {
      done(cb) {
        opts._done = cb;
        return this;
      },
      fail() {
        return this;
      },
      always() {
        return this;
      },
      then(cb) {
        opts._done = cb;
        return this;
      }
    };
  };

  jq.post = function (url, data, success) {
    const cb = typeof data === "function" ? data : success;
    const payload = typeof data === "function" ? {} : data;
    return jq.ajax({ url, type: "POST", data: payload, success: cb });
  };

  jq.get = function (url, data, success) {
    const cb = typeof data === "function" ? data : success;
    const payload = typeof data === "function" ? {} : data;
    return jq.ajax({ url, type: "GET", data: payload, success: cb });
  };

  jq.getJSON = jq.get;
  jq.fn = {};
  jq.extend = Object.assign;

  const locationMock = {
    href: postLink,
    origin: baseDomain,
    protocol: "https:",
    host: baseHost,
    hostname: baseHost,
    pathname: new URL(postLink).pathname,
    search: "",
    hash: "",
    assign(u) {
      recordOutput(u);
    },
    replace(u) {
      recordOutput(u);
    },
    reload() {},
    toString() {
      return postLink;
    }
  };

  const domEvents = [];
  const addEventListenerMock = (evt, fn) => {
    if (typeof fn === "function") {
      domEvents.push({ evt, fn });
    }
  };

  const documentMock = {
    domain: baseHost,
    URL: postLink,
    documentURI: postLink,
    referrer: `${baseDomain}/`,
    title: "",
    cookie: "",
    readyState: "complete",
    location: locationMock,
    addEventListener: addEventListenerMock,
    removeEventListener() {},
    createElement(tag) {
      const el = {
        tagName: String(tag).toUpperCase(),
        style: {},
        dataset: {},
        setAttribute(k, v) {
          this[k] = v;
          if (k === "src" || k === "data-src" || k === "href") recordOutput(v);
        },
        getAttribute(k) {
          return this[k] || "";
        },
        appendChild(child) {
          recordOutput(child);
          return child;
        }
      };
      return new Proxy(el, {
        set(target, prop, value) {
          target[prop] = value;
          if (
            prop === "src" ||
            prop === "innerHTML" ||
            prop === "outerHTML" ||
            prop === "file"
          ) {
            recordOutput(value);
          }
          return true;
        }
      });
    },
    getElementById() {
      return makeJqObject(".movieLoader")[0];
    },
    querySelector() {
      return makeJqObject(".movieLoader")[0];
    },
    querySelectorAll() {
      return [makeJqObject(".movieLoader")[0]];
    },
    getElementsByClassName() {
      return [makeJqObject(".movieLoader")[0]];
    },
    getElementsByTagName() {
      return [makeJqObject(".movieLoader")[0]];
    },
    write(str) {
      recordOutput(str);
    },
    body: {
      appendChild(c) {
        recordOutput(c);
      },
      removeChild() {},
      style: {}
    },
    head: {
      appendChild(c) {
        recordOutput(c);
      },
      removeChild() {}
    },
    documentElement: { style: {} }
  };

  const sandbox = {
    console: { log() {}, warn() {}, error() {}, info() {}, debug() {}, clear() {} },
    location: locationMock,
    document: documentMock,
    navigator: {
      userAgent: BROWSER_HEADERS["User-Agent"],
      language: "vi-VN",
      languages: ["vi-VN", "vi", "en-US", "en"],
      platform: "Win32",
      webdriver: false
    },
    screen: { width: 1920, height: 1080 },
    history: { pushState() {}, replaceState() {} },
    localStorage: {
      getItem() {
        return null;
      },
      setItem() {},
      removeItem() {}
    },
    sessionStorage: {
      getItem() {
        return null;
      },
      setItem() {},
      removeItem() {}
    },
    jQuery: jq,
    $: jq,
    atob: (b64) => decodeBase64Safe(b64),
    btoa: (str) => Buffer.from(String(str), "utf-8").toString("base64"),
    setTimeout: (fn, ms) => {
      // Chỉ chạy ngay các callback ngắn (bỏ qua timer 5000ms khóa nút của Viet69)
      if (typeof fn === "function" && (!ms || ms < 1000)) {
        try {
          fn();
        } catch (_) {}
      }
      return 1;
    },
    clearTimeout() {},
    setInterval: () => 1,
    clearInterval() {},
    requestAnimationFrame: (fn) => {
      if (typeof fn === "function") {
        try {
          fn();
        } catch (_) {}
      }
      return 1;
    },
    addEventListener: addEventListenerMock,
    removeEventListener() {},
    fetch: (url, opts = {}) => {
      state.ajaxCalls.push({
        url,
        type: opts.method || "GET",
        data: opts.body,
        headers: opts.headers
      });
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
        text: () => Promise.resolve("")
      });
    },
    XMLHttpRequest: function () {
      const req = { url: "", type: "GET", data: null };
      this.open = (method, url) => {
        req.type = method;
        req.url = url;
      };
      this.setRequestHeader = () => {};
      this.send = (body) => {
        req.data = body;
        req.success = (res) => {
          this.responseText = typeof res === "string" ? res : JSON.stringify(res);
          this.status = 200;
          this.readyState = 4;
          if (typeof this.onload === "function") this.onload();
          if (typeof this.onreadystatechange === "function")
            this.onreadystatechange();
        };
        state.ajaxCalls.push(req);
      };
    },
    jwplayer: () => ({
      setup(cfg) {
        recordOutput(JSON.stringify(cfg));
        return this;
      },
      on() {
        return this;
      },
      load() {
        return this;
      },
      play() {
        return this;
      }
    }),
    Hls: function () {
      this.loadSource = (u) => recordOutput(u);
      this.attachMedia = () => {};
      this.on = () => {};
    },
    Plyr: function () {},
    Artplayer: function (cfg) {
      if (cfg && cfg.url) recordOutput(cfg.url);
    },
    Math,
    Date,
    JSON,
    RegExp,
    Array,
    Object,
    String,
    Number,
    Boolean,
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
    escape,
    unescape,
    Map,
    Set,
    Promise,
    Symbol,
    Uint8Array
  };

  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.top = sandbox;
  sandbox.parent = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.Hls.isSupported = () => true;

  const context = vm.createContext(sandbox);

  // Chạy từng script trong VM; mở khóa biến guard `if (!_0xa13qc9) return;` ở khối jQuery cuối
  for (const rawScript of scripts) {
    let codeToRun = rawScript;

    // Đảm bảo có dấu chấm phẩy trước `(function($)` và ép biến khóa `_0xa13qc9 = true`
    codeToRun = codeToRun.replace(
      /\)\s*(\(function\s*\(\s*\$\s*\)\s*\{)/g,
      ");\n$1"
    );
    codeToRun = codeToRun.replace(
      /if\s*\(\s*!(_0x[a-zA-Z0-9_]+)\s*\)\s*return\s*;/g,
      "try { $1 = true; } catch(_) {}"
    );

    try {
      vm.runInContext(codeToRun, context, { timeout: 1200 });
    } catch (_) {
      // Nếu lỗi cú pháp do ghép块, thử chạy riêng phần định nghĩa trước `(function($)`
      const splitIdx = codeToRun.indexOf("(function($)");
      if (splitIdx > 0) {
        try {
          vm.runInContext(codeToRun.slice(0, splitIdx), context, {
            timeout: 1000
          });
        } catch (_) {}
        try {
          vm.runInContext(codeToRun.slice(splitIdx), context, {
            timeout: 1000
          });
        } catch (_) {}
      }
    }
  }

  // Kích hoạt toàn bộ callback DOMContentLoaded / load / jQuery.ready đã đăng ký
  for (const ev of domEvents) {
    try {
      ev.fn({
        type: ev.evt,
        target: documentMock,
        currentTarget: sandbox
      });
    } catch (_) {}
  }
  for (const rcb of state.readyCallbacks) {
    try {
      rcb(jq);
    } catch (_) {}
  }

  // Tự động giải mã mã nguồn playCoverVideo bằng các hàm _0x... đã nạp trong VM (phục vụ cả debug & fallback)
  for (const s of scripts) {
    if (s.includes("playCoverVideo") || s.includes("video2-btn")) {
      let readable = s;
      try {
        // Tìm các cặp alias `const _0x... = _0x...`
        const aliasMap = {};
        const aliasRegex = /\b(_0x[a-f0-9]+)\s*=\s*(_0x[a-f0-9]+)\b/gi;
        let am;
        while ((am = aliasRegex.exec(s)) !== null) {
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

        readable = readable.replace(
          /\b(_0x[a-f0-9]{4,})\(\s*(0x[a-f0-9]+|\d+)\s*\)/gi,
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
      } catch (_) {}

      const pIdx = readable.indexOf("function playCoverVideo");
      const vIdx = readable.indexOf("playCoverVideo");
      const start = pIdx !== -1 ? pIdx : vIdx !== -1 ? Math.max(0, vIdx - 300) : 0;
      debugSnippet = readable.slice(start, start + 1400);
    }
  }

  // Hàm phụ trích xuất URL từ chuỗi HTML/URL thu được
  const extractUrlsFromOutputs = (outList) => {
    const found = [];
    const combined = outList.join("\n");
    const media = extractMedia(combined, baseDomain, baseHost);
    found.push(...media.streams, ...media.iframes);

    for (const item of outList) {
      const clean = normalizeUrl(item, baseDomain, baseHost);
      if (clean && !found.includes(clean)) {
        found.push(clean);
      }
    }
    return found;
  };

  // Lặp qua từng nút Server #1, Server #2... và kích hoạt playCoverVideo
  for (const srv of servers) {
    state.outputs = [];
    state.ajaxCalls = [];
    state.attrs["data-movie"] = srv.rawVideo;
    state.attrs["data-video"] = srv.rawVideo;
    state.attrs["data-type"] = String(srv.dataType);
    state.currentBtnAttrs["data-video"] = srv.rawVideo;
    state.currentBtnAttrs["data-type"] = String(srv.dataType);

    // 1. Gọi click handler của nút .video2-btn
    for (const handler of state.clickHandlers) {
      try {
        handler.call({ __isBtnMock: true }, { preventDefault() {}, stopPropagation() {} });
      } catch (_) {}
    }

    // 2. Gọi trực tiếp playCoverVideo('.movieLoader', 1) và ('.movieLoader', 0)
    if (typeof sandbox.playCoverVideo === "function") {
      try {
        sandbox.playCoverVideo(".movieLoader", 1);
      } catch (_) {}
      if (state.outputs.length === 0 && state.ajaxCalls.length === 0) {
        try {
          sandbox.playCoverVideo(".movieLoader", 0);
        } catch (_) {}
      }
    }

    // 3. Nếu playCoverVideo thực hiện gọi AJAX, thực thi request thật và truyền kết quả vào callback
    if (state.outputs.length === 0 && state.ajaxCalls.length > 0) {
      for (const req of state.ajaxCalls.slice(0, 3)) {
        try {
          let ajaxUrl = req.url || `${baseDomain}/wp-admin/admin-ajax.php`;
          if (ajaxUrl.startsWith("//")) ajaxUrl = `https:${ajaxUrl}`;
          else if (ajaxUrl.startsWith("/")) ajaxUrl = `${baseDomain}${ajaxUrl}`;

          const method = (req.type || req.method || "POST").toUpperCase();
          let bodyStr = "";
          if (req.data) {
            if (typeof req.data === "string") {
              bodyStr = req.data;
            } else if (typeof req.data === "object") {
              bodyStr = new URLSearchParams(req.data).toString();
            }
          }

          const fetchUrl =
            method === "GET" && bodyStr
              ? `${ajaxUrl}${ajaxUrl.includes("?") ? "&" : "?"}${bodyStr}`
              : ajaxUrl;

          const ajaxRes = await fetchWithTimeout(
            fetchUrl,
            {
              method,
              headers: {
                ...reqHeaders,
                ...(method === "POST"
                  ? {
                      "Content-Type":
                        "application/x-www-form-urlencoded; charset=UTF-8"
                    }
                  : {}),
                "X-Requested-With": "XMLHttpRequest"
              },
              ...(method === "POST" && bodyStr ? { body: bodyStr } : {})
            },
            5000
          );

          if (ajaxRes.ok) {
            const resText = await ajaxRes.text();
            state.outputs.push(resText);
            let parsed = resText;
            try {
              parsed = JSON.parse(resText);
            } catch (_) {}
            if (typeof req.success === "function") {
              try {
                req.success(parsed);
              } catch (_) {}
            }
            if (typeof req._done === "function") {
              try {
                req._done(parsed);
              } catch (_) {}
            }
          }
        } catch (_) {}
      }
    }

    // 4. Nếu trong debugSnippet (đã giải mã _0x...) có mẫu URL theo data-type mà VM chưa bắt được
    if (state.outputs.length === 0 && debugSnippet) {
      const built = buildUrlFromDecodedSnippet(
        debugSnippet,
        srv.dataType,
        srv.decodedVideo,
        srv.rawVideo
      );
      if (built) state.outputs.push(built);
    }

    const urls = extractUrlsFromOutputs(state.outputs);
    for (const u of urls) {
      const isStream = u.includes(".m3u8") || u.includes(".mp4");
      resolvedSources.push({
        label: srv.label,
        name: srv.label,
        url: u,
        src: u,
        type: isStream ? (u.includes(".m3u8") ? "hls" : "mp4") : "iframe"
      });
    }
  }

  return { resolvedSources, debugSnippet };
}

function buildUrlFromDecodedSnippet(
  decodedJs = "",
  dataType = "",
  decodedVideo = "",
  rawVideo = ""
) {
  if (!decodedJs) return "";
  const cleanJs = decodedJs.replace(/\\\//g, "/");
  const numType = parseInt(dataType, 10);
  const hexType = !isNaN(numType) ? `0x${numType.toString(16)}` : "";

  const patterns = [
    new RegExp(
      `(?:case\\s*(?:["']?${dataType}["']?|${hexType || dataType})\\s*:|===?\\s*(?:["']?${dataType}["']?|${hexType || dataType}))[\\s\\S]{0,500}`,
      "i"
    )
  ];

  for (const pat of patterns) {
    const m = cleanJs.match(pat);
    if (m) {
      const block = m[0];
      const uMatch = block.match(/["'`](https?:\/\/[^"'`\s+$]+)["'`]/i);
      if (uMatch && uMatch[1]) {
        const prefix = uMatch[1];
        const after = block.slice(block.indexOf(prefix) + prefix.length);
        const suffixM = after.match(
          /\+\s*["'`](\/[^"'`<>\s]+|\.m3u8[^"'`<>\s]*|\.mp4[^"'`<>\s]*|\.html[^"'`<>\s]*)["'`]/i
        );
        const suffix = suffixM ? suffixM[1] : "";
        const token = decodedVideo.includes("-") ? decodedVideo : rawVideo;
        return `${prefix}${token}${suffix}`;
      }
    }
  }

  const anyEmbed = cleanJs.match(
    /["'`](https?:\/\/(?![^"'`]*viet69)[^"'`\s+$]+)["'`]/i
  );
  if (anyEmbed && anyEmbed[1]) {
    const base = anyEmbed[1].replace(/\/+$/, "");
    return `${base}/${decodedVideo}`;
  }

  return "";
}

function extractMedia(html = "", baseDomain = "", baseHost = "") {
  if (!html) return { streams: [], iframes: [] };

  const buffer = String(html)
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
      /(?:\/embed|\/e\/|\/v\/|\/play|\/player|player\.|embed\.|hydrax|abyss|dood|ok\.ru|helvid|vhstream|goostream|cd-vs)/i.test(
        lower
      )
    ) {
      iframes.add(u);
    }
  };

  const embedTags =
    buffer.match(/<(?:iframe|embed|video|source)\b[^>]*>/gi) || [];
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

        // 1. Quét media tĩnh có sẵn trong HTML
        const media = extractMedia(pageHtml, baseDomain, baseHost);
        allStreams.push(...media.streams);
        allIframes.push(...media.iframes);

        // 2. Bóc tách nút .video2-btn và chạy playCoverVideo trong VM Sandbox
        const servers = extractViet69Buttons(pageHtml);
        debugInfo.servers = servers;

        if (servers.length > 0) {
          const playerScripts = await collectPlayerScripts(
            pageHtml,
            baseDomain,
            reqHeaders
          );

          const { resolvedSources, debugSnippet } = await runViet69Sandbox({
            scripts: playerScripts,
            servers,
            postLink,
            baseDomain,
            baseHost,
            postId,
            reqHeaders
          });

          if (debugSnippet) {
            debugInfo.playerSnippet = debugSnippet;
          }

          for (const srcItem of resolvedSources) {
            customSources.push(srcItem);
            if (srcItem.type === "iframe") {
              allIframes.push(srcItem.url);
            } else {
              allStreams.push(srcItem.url);
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
