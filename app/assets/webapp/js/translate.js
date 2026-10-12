/* ═════════════ translate.js — 英文资讯翻译（免密钥公共接口，双源容错） ═════════════ */
"use strict";

/**
 * 翻译引擎：
 *  1) Google gtx 公共端点（translate.googleapis.com，无需 Key，走应用安全代理）
 *  2) MyMemory 备用源（CORS 开放）
 * 译文缓存在 localStorage（上限 800 条），长文自动分块逐段翻译。
 */
const Translator = {
  cache: Store.get("trCache", {}),
  order: Object.keys(Store.get("trCache", {})),

  /** 判断是否以英文为主（拉丁字母占比 > 60%） */
  isEn(text) {
    const s = String(text || "").replace(/[^A-Za-z\u4e00-\u9fa5]/g, "");
    if (!s) return false;
    const en = (s.match(/[A-Za-z]/g) || []).length;
    const zh = (s.match(/[\u4e00-\u9fa5]/g) || []).length;
    return en / (en + zh) > 0.6;
  },

  key(text) { return hashStr(String(text).slice(0, 240)); },
  getCached(text) { return this.cache[this.key(text)] || null; },
  putCache(text, out) {
    if (!out) return;
    const k = this.key(text);
    this.cache[k] = out;
    this.order.push(k);
    while (this.order.length > 800) delete this.cache[this.order.shift()];
    try { Store.set("trCache", this.cache); } catch (e) { this.cache = {}; this.order = []; }
  },

  async viaGoogle(text) {
    const url = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&q=" +
      encodeURIComponent(text);
    const raw = await Bridge.fetchText(url, 12000);
    const j = JSON.parse(raw);
    if (!j || !Array.isArray(j[0])) throw new Error("gtx bad response");
    const out = j[0].map(x => (x && x[0]) ? x[0] : "").join("");
    if (!out.trim()) throw new Error("gtx empty");
    return out;
  },

  async viaMyMemory(text) {
    const url = "https://api.mymemory.translated.net/get?q=" +
      encodeURIComponent(text.slice(0, 460)) + "&langpair=en|zh-CN";
    const j = await Bridge.fetchJSON(url, 12000);
    const t = j && j.responseData && j.responseData.translatedText;
    if (!t || /^(PLEASE SELECT|QUERY LENGTH|INVALID)/i.test(t)) throw new Error("mm bad");
    return t;
  },

  /** 长文按段落/句子切块（≤1200 字符） */
  chunk(text, max = 1200) {
    const paras = String(text).split(/\n+/);
    const out = [];
    let cur = "";
    const push = () => { if (cur.trim()) out.push(cur); cur = ""; };
    for (const p of paras) {
      let seg = p;
      // 超长段落先按句切
      while (seg.length > max) {
        let cut = seg.lastIndexOf(". ", max);
        if (cut < max * 0.4) cut = seg.lastIndexOf(" ", max);
        if (cut < max * 0.4) cut = max;
        push(); out.push(seg.slice(0, cut + 1));
        seg = seg.slice(cut + 1);
      }
      if ((cur + "\n" + seg).length > max) push();
      cur = cur ? cur + "\n" + seg : seg;
    }
    push();
    return out;
  },

  /** 翻译一段文本（自动分块 + 缓存） */
  async translate(text) {
    text = String(text || "").trim();
    if (!text || !this.isEn(text)) return text;
    const c = this.getCached(text);
    if (c) return c;
    if (text.length > 1300) {
      const outs = [];
      for (const ch of this.chunk(text)) outs.push(await this.translateOne(ch));
      const joined = outs.join("\n");
      this.putCache(text, joined);
      return joined;
    }
    return await this.translateOne(text);
  },

  async translateOne(text) {
    const c = this.getCached(text);
    if (c) return c;
    let out = null;
    try { out = await this.viaGoogle(text); }
    catch (e) {
      try { out = await this.viaMyMemory(text); }
      catch (e2) { throw new Error("翻译服务暂不可用"); }
    }
    this.putCache(text, out);
    return out;
  },

  /** 新闻条目：并行翻译标题与摘要，结果挂在 item._zh */
  async translateItem(it) {
    if (it._zh) return it._zh;
    const results = await Promise.all([
      this.translate(it.title),
      it.summary ? this.translate(it.summary) : Promise.resolve("")
    ]);
    it._zh = { title: results[0], summary: results[1] };
    return it._zh;
  },

  /** 缓存管理：清空翻译缓存 */
  clear() {
    this.cache = {}; this.order = [];
    Store.set("trCache", {});
  }
};
