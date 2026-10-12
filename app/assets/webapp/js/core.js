/* ═════════════ core.js — 工具 / 存储 / 原生桥 ═════════════ */
"use strict";

/* ---------- DOM 工具 ---------- */
const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function fmtNum(n) {
  n = Number(n) || 0;
  if (n >= 1e8) return (n / 1e8).toFixed(1).replace(/\.0$/, "") + "亿";
  if (n >= 1e4) return (n / 1e4).toFixed(1).replace(/\.0$/, "") + "万";
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "k";
  return String(n);
}
function timeAgo(ts) {
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return "刚刚";
  if (diff < 3600) return Math.floor(diff / 60) + " 分钟前";
  if (diff < 86400) return Math.floor(diff / 3600) + " 小时前";
  if (diff < 86400 * 30) return Math.floor(diff / 86400) + " 天前";
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
function fmtDate(ts) {
  const d = new Date(ts);
  const p = x => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function debounce(fn, ms) {
  let t;
  return function (...a) { clearTimeout(t); t = setTimeout(() => fn.apply(this, a), ms); };
}
function hashStr(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/* ---------- Toast ---------- */
const Toast = {
  show(msg, ms) {
    const root = $("#toastRoot");
    const t = el("div", "toast", esc(msg));
    root.appendChild(t);
    setTimeout(() => { t.style.opacity = "0"; t.style.transition = ".3s"; setTimeout(() => t.remove(), 320); }, ms || 2200);
  }
};

/* ---------- Sheet / Modal ---------- */
const Sheet = {
  open(html, onOpen) {
    $("#sheetBody").innerHTML = html;
    $("#sheetRoot").classList.remove("hidden");
    $("#sheetMask").classList.remove("hidden");
    if (onOpen) onOpen($("#sheetBody"));
  },
  close() {
    $("#sheetRoot").classList.add("hidden");
    $("#sheetMask").classList.add("hidden");
  }
};
const Modal = {
  open(html) {
    $("#modalBody").innerHTML = html;
    $("#modalRoot").classList.remove("hidden");
    $("#modalMask").classList.remove("hidden");
  },
  close() {
    $("#modalRoot").classList.add("hidden");
    $("#modalMask").classList.add("hidden");
  }
};

/* ---------- 本地存储 ---------- */
const Store = {
  get(key, def) {
    try {
      const v = localStorage.getItem("ar_" + key);
      return v == null ? def : JSON.parse(v);
    } catch (e) { return def; }
  },
  set(key, val) {
    try { localStorage.setItem("ar_" + key, JSON.stringify(val)); } catch (e) { }
  },
  remove(key) { try { localStorage.removeItem("ar_" + key); } catch (e) { } }
};

/* 设置项（含默认值） */
const Settings = {
  data: null,
  defaults: {
    theme: "dark",          // dark | light | auto
    autoRefresh: true,      // 前台自动刷新
    refreshMins: 5,         // 刷新间隔（分钟）
    fontScale: 1,           // 阅读器字号
    disabledSources: [],    // 禁用的数据源 id
    hideEnglish: false,     // 折叠纯英文资讯开关（保留数据）
    translateNews: false    // 英文资讯默认显示中文译文
  },
  load() {
    this.data = Object.assign({}, this.defaults, Store.get("settings", {}));
    this.applyTheme();
  },
  save() { Store.set("settings", this.data); },
  get(k) { return this.data[k]; },
  set(k, v) { this.data[k] = v; this.save(); },
  applyTheme() {
    let t = this.data.theme;
    if (t === "auto") {
      t = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    }
    document.documentElement.setAttribute("data-theme", t);
    const meta = document.querySelector('meta[name=theme-color]');
    if (meta) meta.setAttribute("content", t === "light" ? "#f2f5fc" : "#0b1020");
  }
};

/* ---------- 原生桥（APK 内走 /__proxy；纯浏览器走 CORS 直连） ---------- */
const Bridge = {
  native: !!(window.AIRadarNative && window.AIRadarNative.platform),

  _checkUrl(url) {
    // JS 层镜像一份基础校验：仅 http/https、拒绝本地/内网主机
    let u;
    try { u = new URL(url); } catch (e) { return null; }
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (u.port && u.port !== "80" && u.port !== "443") return null;
    const h = (u.hostname || "").toLowerCase();
    if (!h) return null;
    if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".onion")) return null;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(":")) return null; // IP 直连一律走原生再校验
    return u.href;
  },

  /** 抓取任意 URL 文本：优先原生代理（无 CORS），浏览器环境回退直连 */
  async fetchText(url, timeoutMs) {
    const checked = this._checkUrl(url);
    if (!checked) throw new Error("blocked url");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs || 20000);
    try {
      if (this.native) {
        const r = await fetch("/__proxy?url=" + encodeURIComponent(checked), { signal: ctrl.signal });
        if (!r.ok) throw new Error("proxy " + r.status);
        return await r.text();
      }
      // 纯浏览器（开发预览）：仅能访问 CORS 开放的 JSON API
      const r = await fetch(checked, { signal: ctrl.signal, mode: "cors" });
      if (!r.ok) throw new Error("http " + r.status);
      return await r.text();
    } finally { clearTimeout(timer); }
  },

  async fetchJSON(url, timeoutMs) {
    const txt = await this.fetchText(url, timeoutMs);
    return JSON.parse(txt);
  },

  /** POST 请求（供 AI 概括调用）：APK 内走原生异步代理，浏览器回退直连 fetch */
  _postHandlers: {},
  _nextPostId: 1,
  httpPost(url, headers, body, timeoutMs) {
    if (this.native && window.AIRadarNative.httpPost) {
      return new Promise((resolve, reject) => {
        const id = "p" + (this._nextPostId++);
        const timer = setTimeout(() => {
          delete this._postHandlers[id];
          reject(new Error("请求超时（" + Math.round((timeoutMs || 100000) / 1000) + "s）"));
        }, timeoutMs || 100000);
        this._postHandlers[id] = { resolve, reject, timer };
        try {
          window.AIRadarNative.httpPost(id, url, JSON.stringify(headers || []), body || "");
        } catch (e) {
          clearTimeout(timer); delete this._postHandlers[id];
          reject(e);
        }
      });
    }
    // 浏览器预览：直接 fetch（多数 LLM 服务商允许 CORS）
    const hdrs = {};
    (headers || []).forEach(h => { hdrs[h.name] = h.value; });
    return fetch(url, { method: "POST", headers: hdrs, body })
      .then(async r => ({ code: r.status, body: await r.text() }))
      .catch(e => { throw new Error("网络错误：" + (e.message || e)); });
  },

  /** 原生 POST 完成回调（Java 侧 evaluateJavascript 调用）。
   *  无论业务状态码如何都 resolve，把 code/body 交给调用方处理；
   *  仅超时/原生异常走 reject。 */
  _onNativePostDone(o) {
    const h = this._postHandlers[o.id];
    if (!h) return;
    clearTimeout(h.timer);
    delete this._postHandlers[o.id];
    h.resolve({ code: o.code, body: o.body || "" });
  },

  /** 是否处于代理可用环境（APK 或本地调试服务器） */
  canProxy() { return this.native; },

  openUrl(url) {
    if (!/^https?:\/\//i.test(url)) return;
    if (this.native && window.AIRadarNative.openUrl) { window.AIRadarNative.openUrl(url); return; }
    window.open(url, "_blank");
  },
  share(title, url) {
    if (this.native && window.AIRadarNative.share) { window.AIRadarNative.share(String(title || ""), String(url || "")); return; }
    if (navigator.share) { navigator.share({ title, url }).catch(() => { }); }
    else Toast.show("已复制链接");
  },
  toast(msg) {
    if (this.native && window.AIRadarNative.toast) { window.AIRadarNative.toast(String(msg)); return; }
    Toast.show(msg);
  },
  copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => Toast.show("已复制"), () => this._copyFallback(text));
    } else this._copyFallback(text);
  },
  _copyFallback(text) {
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); Toast.show("已复制"); } catch (e) { Toast.show("复制失败"); }
    ta.remove();
  }
};

/* 原生 POST 代理回调入口 */
window.__nativeHttpPostDone = function (payloadJson) {
  try {
    const o = typeof payloadJson === "string" ? JSON.parse(payloadJson) : payloadJson;
    Bridge._onNativePostDone(o);
  } catch (e) { }
};

/* ---------- 分类体系 ---------- */
const CATS = [
  { id: "all", name: "全部" },
  { id: "model", name: "大模型" },
  { id: "oss", name: "开源" },
  { id: "paper", name: "学术" },
  { id: "chip", name: "芯片算力" },
  { id: "policy", name: "政策监管" },
  { id: "product", name: "产品应用" },
  { id: "fund", name: "投融资" },
  { id: "safety", name: "安全对齐" },
  { id: "opinion", name: "观点" }
];
const CAT_ICON = {
  model: "🧠", oss: "🔓", paper: "📄", chip: "🔌", policy: "⚖️",
  product: "🚀", fund: "💰", safety: "🛡️", opinion: "💬", all: "🌐"
};
