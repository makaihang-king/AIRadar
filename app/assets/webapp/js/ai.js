/* ═════════════ ai.js — AI 信息整合概括（用户自配大模型 API） ═════════════ */
"use strict";

/**
 * 用户在设置中填写任意 OpenAI 兼容接口（URL + API Key + 模型名），
 * 即可使用「今日 AI 简报」与「单文 AI 概括」。
 * - API Key 仅保存在设备本地（localStorage），请求直连所填服务商
 * - 出于安全，接口地址仅支持公网 http/https（本机/内网地址会被拒绝）
 */
const AISummary = {
  busy: false,

  loadCfg() { return Store.get("aiConfig", { url: "", key: "", model: "" }); },
  saveCfg(c) { Store.set("aiConfig", c); Toast.show("✅ AI 接口配置已保存（仅存本机）"); },
  configured() { const c = this.loadCfg(); return !!(c.url && c.key && c.model); },

  /** OpenAI 兼容 chat 调用；返回助手回复文本 */
  async chat(messages, temperature) {
    const c = this.loadCfg();
    if (!this.configured()) { const e = new Error("NOT_CONFIGURED"); e.code = "NOCONF"; throw e; }
    if (!Bridge._checkUrl(c.url)) {
      throw new Error("接口地址不合法：仅支持公网 http/https 地址（本机/内网地址出于安全不允许）");
    }
    const headers = [
      { name: "Content-Type", value: "application/json" },
      { name: "Authorization", value: "Bearer " + c.key }
    ];
    const payload = JSON.stringify({
      model: c.model, messages, stream: false,
      temperature: temperature == null ? 0.3 : temperature
    });
    const r = await Bridge.httpPost(c.url, headers, payload, 100000);
    let j = null;
    try { j = JSON.parse(r.body); } catch (e) { }
    if (r.code >= 200 && r.code < 400 && j && j.choices && j.choices[0]) {
      const msg = j.choices[0].message || {};
      const txt = msg.content || msg.reasoning_content || "";
      if (txt && txt.trim()) return txt.trim();
      throw new Error("模型返回内容为空，请检查模型名是否正确");
    }
    let detail = (j && j.error && (j.error.message || j.error.code)) || (r.body || "").slice(0, 140);
    if (r.code === 401) throw new Error("API Key 无效或未授权（401）：" + detail);
    if (r.code === 404) throw new Error("接口地址或模型名不存在（404）：" + detail);
    if (r.code === 429) throw new Error("请求过于频繁或额度不足（429）：" + detail);
    if (r.code === -1) throw new Error("网络错误：" + detail);
    throw new Error("请求失败（HTTP " + r.code + "）：" + detail);
  },

  async testConnection() {
    const t = await this.chat([{ role: "user", content: "请只回复两个字：成功" }], 0);
    return t.replace(/\s+/g, " ").slice(0, 40);
  },

  /* ---------- 今日 AI 简报（信息整合概括） ---------- */
  async dailyBrief(force) {
    if (this.busy) { Toast.show("正在生成中，请稍候…"); return; }
    if (!this.configured()) { this.openConfig("生成 AI 简报前，请先配置你的大模型 API（任意 OpenAI 兼容接口）"); return; }
    this.busy = true;
    const items = Feeds.items
      .filter(i => !i.seed && i.ts >= Date.now() - 86400e3)
      .sort((a, b) => (b.score ? b.score.total : 0) - (a.score ? a.score.total : 0))
      .slice(0, 25);
    const fallback = items.length ? null : Feeds.items
      .filter(i => !i.seed).sort((a, b) => (b.score ? b.score.total : 0) - (a.score ? a.score.total : 0)).slice(0, 25);
    const use = items.length ? items : fallback;
    if (!use || !use.length) { Toast.show("暂无资讯可概括，请先刷新"); this.busy = false; return; }
    Sheet.open(`
      <div style="font-weight:800;font-size:16px;margin-bottom:2px">✨ 今日 AI 简报</div>
      <div style="font-size:11px;color:var(--faint);margin-bottom:10px">整合最近${items.length ? " 24 小时" : " 7 天"}热度 Top${use.length} 资讯 · 由你配置的模型生成（${esc(this.loadCfg().model)}）</div>
      <div id="aiBriefBody"><div class="skel"><div class="skel-line t"></div><div class="skel-line m"></div><div class="skel-line m"></div><div class="skel-line s"></div><div class="skel-line m"></div></div>
      <p style="color:var(--faint);font-size:12px;margin-top:10px">🧠 正在整合概括，通常需要 5-30 秒…</p></div>
    `);
    const listText = use.map((i, idx) => {
      const zhOn = HomeView.showZh(i) && i._zh;
      const title = zhOn ? i._zh.title : i.title;
      const summary = ((zhOn ? i._zh.summary : i.summary) || "").slice(0, 90);
      return `${idx + 1}. [${i.source}] ${title}${summary ? " — " + summary : ""}`;
    }).join("\n");
    const sys = "你是一位专业的 AI 行业分析师。用户将提供多条 AI 领域资讯，请把它们整合成一份高质量中文简报。要求：\n" +
      "1. 使用 Markdown 输出，依次包含三个小节：## 🔥 今日焦点（3-5 条最重要新闻，每条「**一句话概括** + 一句影响分析」）；## 📈 趋势洞察（2-3 条跨新闻的共性趋势/信号）；## 👀 值得关注（1-2 条容易被忽略但重要的消息）\n" +
      "2. 只基于给定资讯，严禁编造；同一事件的重复报道要合并\n3. 语言精炼有信息量，总长度控制在 500 字以内";
    try {
      const out = await this.chat([
        { role: "system", content: sys },
        { role: "user", content: "以下是按热度排序的最新 AI 资讯：\n" + listText }
      ], 0.3);
      Store.set("lastBrief", { ts: Date.now(), md: out, n: use.length });
      $("#aiBriefBody").innerHTML = this.briefHTML(out, use.length);
    } catch (e) {
      $("#aiBriefBody").innerHTML = this.errHTML(e, "AISummary.dailyBrief(true)");
    } finally { this.busy = false; }
  },

  briefHTML(md, n) {
    return `
      <div class="md-lite">${this.mdLite(md)}</div>
      <div class="ai-sum-actions">
        <button onclick="Bridge.copy(document.getElementById('aiMdSrc').textContent)">复制全文</button>
        <button onclick="AISummary.dailyBrief(true)">重新生成</button>
      </div>
      <div style="display:none" id="aiMdSrc">${esc(md)}</div>`;
  },

  errHTML(e, retryExpr) {
    const noConf = e.code === "NOCONF";
    return `
      <div class="note-box">⚠️ ${esc(e.message || "生成失败")}</div>
      ${noConf
        ? `<button class="load-more" onclick="AISummary.openConfig()">前往配置大模型 API</button>`
        : `<div class="ai-sum-actions"><button onclick="${retryExpr}">重试</button>
           <button onclick="AISummary.openConfig()">修改接口配置</button></div>
           <div class="note-box" style="margin-top:10px">排查：① Key 是否有效/有额度 ② URL 是否为完整 chat/completions 地址 ③ 模型名拼写。常见地址：api.deepseek.com/chat/completions、api.openai.com/v1/chat/completions、open.bigmodel.cn/api/paas/v4/chat/completions</div>`}`;
  },

  /* ---------- 阅读器单文概括 ---------- */
  async summarizeReader(force) {
    const it = ReaderView.cur;
    if (!it) return;
    if (it._aiSum && !force) { ReaderView.renderContent(false); Toast.show("已显示 AI 概括"); return; }
    if (this.busy) { Toast.show("正在生成中，请稍候…"); return; }
    if (!this.configured()) { this.openConfig("使用 AI 概括前，请先配置你的大模型 API"); return; }
    this.busy = true;
    Toast.show("🧠 AI 概括中…");
    const text = (ReaderView.curText || it.summary || "").slice(0, 9000);
    try {
      const out = await this.chat([
        { role: "system", content: "你是资深新闻编辑。请把用户提供的文章概括为中文：先给 3-5 句核心内容概括，然后另起一行列出 3-5 个关键词（用「」包裹，顿号分隔）。若原文为英文，同样输出中文概括。只基于原文，严禁编造，总长 250 字以内。" },
        { role: "user", content: "标题：" + it.title + "\n\n正文：\n" + (text || "（正文不可用，请基于标题与摘要概括）") + (it.summary ? "\n\n摘要：" + it.summary : "") }
      ], 0.2);
      it._aiSum = out;
      if (ReaderView.cur === it) ReaderView.renderContent(false);
    } catch (e) {
      if (e.code === "NOCONF") this.openConfig("使用 AI 概括前，请先配置你的大模型 API");
      else Toast.show(e.message || "概括失败");
    } finally { this.busy = false; }
  },

  aiBoxHTML(txt) {
    return `<div class="ai-sum-box">
      <div class="ai-sum-title">✨ AI 概括<button class="ai-sum-x" onclick="AISummary.hideAISum()">收起</button></div>
      <div class="ai-sum-body">${esc(txt).replace(/\n/g, "<br>")}</div>
    </div>`;
  },
  hideAISum() {
    if (ReaderView.cur) { ReaderView.cur._aiSumHidden = true; ReaderView.renderContent(false); }
  },

  /* ---------- 配置界面 ---------- */
  openConfig(tip) {
    Sheet.open(`
      <div style="font-weight:800;font-size:16px;margin-bottom:2px">✨ AI 概括 · 接口配置</div>
      <div style="font-size:11.5px;color:var(--faint);margin-bottom:12px">${esc(tip || "填写任意 OpenAI 兼容接口，用于「今日 AI 简报」与「单文概括」")}</div>
      <div id="aiCfgBox">${this.configFormHTML()}</div>
    `, () => this.bindConfigForm($("#aiCfgBox")));
  },

  configFormHTML() {
    const c = this.loadCfg();
    return `
      <div class="cfg-row">
        <label>接口地址</label>
        <input id="cfgUrl" type="url" placeholder="https://api.deepseek.com/chat/completions" value="${esc(c.url)}" autocomplete="off">
      </div>
      <div class="cfg-row">
        <label>API Key</label>
        <input id="cfgKey" type="password" placeholder="sk-…（仅保存在本机）" value="${esc(c.key)}" autocomplete="off">
      </div>
      <div class="cfg-row">
        <label>模型名</label>
        <input id="cfgModel" placeholder="如 deepseek-chat / glm-5.3-flash / gpt-5.2" value="${esc(c.model)}" autocomplete="off">
      </div>
      <div class="cfg-hint">常见 OpenAI 兼容地址：DeepSeek <b>api.deepseek.com/chat/completions</b> · OpenAI <b>api.openai.com/v1/chat/completions</b> · 智谱 <b>open.bigmodel.cn/api/paas/v4/chat/completions</b> · 月之暗面 <b>api.moonshot.cn/v1/chat/completions</b>（其他兼容服务商均可）</div>
      <div class="ai-sum-actions">
        <button id="cfgSave">保存</button>
        <button id="cfgTest">测试连接</button>
      </div>
      <div id="cfgTestResult" style="font-size:12px;margin-top:8px"></div>
      <div class="note-box" style="margin-top:10px">🔒 API Key 仅保存在你的设备本地，请求直连你填写的服务商、不经任何第三方；出于安全，接口地址仅支持公网 http/https（本机/内网地址会被拒绝）。清空浏览数据不会清除本配置。</div>`;
  },

  bindConfigForm(root) {
    if (!root || root.dataset.bound) return;
    root.dataset.bound = "1";
    root.querySelector("#cfgSave").onclick = () => {
      const cfg = {
        url: root.querySelector("#cfgUrl").value.trim(),
        key: root.querySelector("#cfgKey").value.trim(),
        model: root.querySelector("#cfgModel").value.trim()
      };
      if (!cfg.url || !cfg.key || !cfg.model) { Toast.show("三项都需填写"); return; }
      this.saveCfg(cfg);
      const r = root.querySelector("#cfgTestResult");
      r.innerHTML = '<span style="color:var(--green)">已保存 ✓（可点「测试连接」验证）</span>';
    };
    root.querySelector("#cfgTest").onclick = async () => {
      const cfg = {
        url: root.querySelector("#cfgUrl").value.trim(),
        key: root.querySelector("#cfgKey").value.trim(),
        model: root.querySelector("#cfgModel").value.trim()
      };
      if (!cfg.url || !cfg.key || !cfg.model) { Toast.show("三项都需填写"); return; }
      this.saveCfg(cfg);
      const r = root.querySelector("#cfgTestResult");
      r.innerHTML = '<span style="color:var(--muted)">连接中…</span>';
      try {
        const reply = await this.testConnection();
        r.innerHTML = `<span style="color:var(--green)">✅ 连接成功，模型回复：「${esc(reply)}」</span>`;
      } catch (e) {
        r.innerHTML = `<span style="color:var(--red)">❌ ${esc(e.message || "连接失败")}</span>`;
      }
    };
  },

  /** 极简 Markdown 渲染（## 标题 / 列表 / 加粗），输入已转义 */
  mdLite(md) {
    const lines = esc(md).split("\n");
    let html = "", inList = false;
    const closeList = () => { if (inList) { html += "</ul>"; inList = false; } };
    for (const ln of lines) {
      if (/^#{1,4}\s+/.test(ln)) { closeList(); html += "<h3>" + ln.replace(/^#{1,4}\s+/, "") + "</h3>"; }
      else if (/^[-*•]\s+/.test(ln)) {
        if (!inList) { html += "<ul>"; inList = true; }
        html += "<li>" + ln.replace(/^[-*•]\s+/, "") + "</li>";
      } else if (ln.trim() === "") { closeList(); }
      else { closeList(); html += "<p>" + ln + "</p>"; }
    }
    closeList();
    return html
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/「\*\*([^*]+)\*\*」/g, "「<strong>$1</strong>」");
  }
};
