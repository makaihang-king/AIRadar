/* ═════════════ views_rank.js — LLM 排行榜 ═════════════ */
"use strict";

const CN_ORGS = ["Alibaba", "Moonshot AI", "Z.ai", "DeepSeek", "MiniMax", "Baidu", "Tencent", "Xiaomi"];

const RankData = {
  meta: null, rows: [], loaded: false,
  async load() {
    if (this.loaded) return;
    try {
      const r = await fetch("data/leaderboard.json");
      const j = await r.json();
      this.meta = j.meta;
      this.rows = j.rows;
      this.loaded = true;
    } catch (e) { /* 静默失败，页面显示空态 */ }
  },
  isCN(org) { return CN_ORGS.includes(org); },
  isOpen(r) { return r.license === "open"; },
  ctxTokens(ctx) {
    if (!ctx) return 0;
    const m = String(ctx).match(/([\d.]+)\s*([KM])/i);
    if (!m) return 0;
    return parseFloat(m[1]) * (m[2].toUpperCase() === "M" ? 1e6 : 1e3);
  },
  priceText(r) {
    if (r.in === null || r.in === undefined) return "订阅制";
    if (r.in === 0 && r.out === 0) return "免费/自托管";
    return `$${r.in}/$${r.out}`;
  },
  valueScore(r) {
    if (!r.in && !r.out) return 0;
    const avg = ((r.in || 0) + (r.out || 0)) / 2;
    if (!avg) return 0;
    return r.elo / avg;
  },
  searchRows(q) {
    q = q.toLowerCase();
    return this.rows.filter(r =>
      r.model.toLowerCase().includes(q) || r.org.toLowerCase().includes(q));
  }
};

const RankView = {
  dim: "all",      // all | open | cn | value | ctx | hf
  sel: "all",      // 筛选：all | open | cn
  maxElo: 1525,

  dims: [
    { id: "all", name: "综合榜" },
    { id: "open", name: "开源榜" },
    { id: "cn", name: "国产榜" },
    { id: "value", name: "性价比" },
    { id: "ctx", name: "长上下文" },
    { id: "hf", name: "HF 实时热榜" }
  ],

  async init() {
    await RankData.load();
    $("#rankDate").textContent = RankData.meta ? "（" + RankData.meta.date + " 快照，完整榜共 " + RankData.meta.total + " 个模型）" : "";
    const chips = $("#rankChips");
    chips.innerHTML = this.dims.map(d =>
      `<button class="chip${d.id === this.dim ? " active" : ""}" data-dim="${d.id}">${d.name}</button>`).join("");
    chips.onclick = e => {
      const b = e.target.closest("[data-dim]");
      if (!b) return;
      this.dim = b.dataset.dim;
      $$(".chip", chips).forEach(c => c.classList.toggle("active", c.dataset.dim === this.dim));
      this.render();
    };
    $("#rankCtxSeg").onclick = e => {
      const b = e.target.closest("[data-rsel]");
      if (!b) return;
      this.sel = b.dataset.rsel;
      $$("#rankCtxSeg .seg-btn").forEach(x => x.classList.toggle("active", x === b));
      this.render();
    };
    $("#rankBody").addEventListener("click", e => {
      const t = e.target.closest("[data-rank-open]");
      if (!t) return;
      const r = RankData.rows.find(x => String(x.rank) === t.dataset.rankOpen);
      if (r) this.showDetail(r);
    });
    this.render();
  },

  currentRows() {
    let rows = RankData.rows.slice();
    if (this.dim === "open") rows = rows.filter(r => RankData.isOpen(r));
    else if (this.dim === "cn") rows = rows.filter(r => RankData.isCN(r.org));
    else if (this.dim === "value") rows = rows.filter(r => (r.in || 0) > 0).sort((a, b) => RankData.valueScore(b) - RankData.valueScore(a));
    else if (this.dim === "ctx") rows = rows.sort((a, b) => RankData.ctxTokens(b.ctx) - RankData.ctxTokens(a.ctx));
    if (this.sel === "open") rows = rows.filter(r => RankData.isOpen(r));
    if (this.sel === "cn") rows = rows.filter(r => RankData.isCN(r.org));
    return rows;
  },

  render() {
    const body = $("#rankBody");
    if (this.dim === "hf") { this.renderHF(body); return; }
    const rows = this.currentRows();
    if (!rows.length) {
      body.innerHTML = `<div class="empty"><div class="empty-icon">🏆</div><div class="empty-title">暂无榜单数据</div><div class="empty-desc">榜单快照未加载，请重启应用</div></div>`;
      return;
    }
    const max = RankView.maxElo = Math.max(...rows.map(r => r.elo));
    const idxOffset = 0;
    body.innerHTML = rows.map((r, i) => this.rowHTML(r, this.dim === "all" ? r.rank : i + 1, max)).join("")
      + `<div class="note-box" style="margin-top:12px">💡 榜单说明：${esc(RankData.meta ? RankData.meta.note : "")}</div>`;
  },

  rowHTML(r, rank, max) {
    const elo = r.elo;
    const w = Math.max(8, (elo - 1280) / (max - 1280) * 100);
    const orgCls = RankData.isOpen(r) ? "open" : (RankData.isCN(r.org) ? "cn" : "");
    const orgTxt = RankData.isOpen(r) ? "开源" : (RankData.isCN(r.org) ? "国产" : "闭源");
    const votes = r.votes ? `· ${fmtNum(r.votes)} 票` : "";
    return `
    <div class="rank-row" data-rank-open="${r.rank}">
      <div class="rank-no ${rank <= 3 ? "r" + rank : ""}">${rank}</div>
      <div class="rank-model">
        <div class="rank-name">${esc(r.model)}</div>
        <div class="rank-org">${esc(r.org)} <span class="org-badge ${orgCls}">${orgTxt}</span> <span class="rank-votes">${votes}</span></div>
      </div>
      <div class="rank-scorewrap">
        <div class="rank-elo">${elo} <small>ELO</small></div>
        <div class="rank-bar"><i style="width:${w}%"></i></div>
        <div class="rank-price">${RankData.priceText(r)} · ${r.ctx} 上下文</div>
      </div>
    </div>`;
  },

  renderHF(body) {
    const tr = Feeds.hfTrending;
    if (!tr.length) {
      body.innerHTML = `<div class="empty"><div class="empty-icon">📊</div><div class="empty-title">还没有 HF 实时数据</div><div class="empty-desc">下拉刷新首页或点击右上角刷新，抓取 Hugging Face 实时热门模型</div>
        <button class="load-more" style="margin-top:14px" onclick="App.manualRefresh()">立即抓取</button></div>`;
      return;
    }
    const maxDl = Math.max(...tr.map(m => m.downloads || 0), 1);
    body.innerHTML = `<div class="rank-note"><span class="rank-note-badge">实时</span>来自 Hugging Face API · 最近 30 天下载量与趋势分</div>` +
      tr.slice(0, 40).map((m, i) => `
      <div class="rank-row" onclick="Bridge.openUrl('https://huggingface.co/${esc(m.id)}')">
        <div class="rank-no ${i < 3 ? "r" + (i + 1) : ""}">${i + 1}</div>
        <div class="rank-model">
          <div class="rank-name">${esc(m.id)}</div>
          <div class="rank-org">${esc(m.pipeline || "model")} <span class="rank-votes">· ❤️ ${fmtNum(m.likes)} · 趋势分 ${m.trending || 0}</span></div>
        </div>
        <div class="rank-scorewrap">
          <div class="rank-elo">${fmtNum(m.downloads)} <small>下载</small></div>
          <div class="rank-bar"><i style="width:${Math.max(6, Math.log10(1 + m.downloads) / Math.log10(1 + maxDl) * 100)}%"></i></div>
        </div>
      </div>`).join("");
  },

  showDetail(r) {
    const m = (typeof ModelDB !== "undefined") ? ModelDB.byArenaName(r.model) : null;
    const price = RankData.priceText(r);
    const newsBtn = `<button class="load-more" style="margin-top:12px" onclick="Modal.close();SearchView.open('news','${esc(r.model.split(" ")[0].split("(")[0])}')">🔍 搜相关资讯</button>`;
    let modelCard = "";
    if (m) {
      modelCard = `<button class="load-more" style="margin-top:10px" onclick="Modal.close();ModelsView.openDetail('${m.id}')">📦 查看模型卡（下载/API/部署）</button>`;
    }
    Modal.open(`
      <div class="md-head">
        <div class="md-logo">${esc(r.org.slice(0, 1))}</div>
        <div class="md-titles">
          <div class="md-name">${esc(r.model)}</div>
          <div class="md-org">${esc(r.org)} · Arena 总榜第 ${r.rank} 名</div>
        </div>
      </div>
      <div class="md-stats">
        <div class="md-stat"><div class="v" style="color:var(--accent)">${r.elo}</div><div class="k">Arena ELO</div></div>
        <div class="md-stat"><div class="v">${fmtNum(r.votes)}</div><div class="k">投票数</div></div>
        <div class="md-stat"><div class="v">${r.ctx}</div><div class="k">上下文</div></div>
        <div class="md-stat"><div class="v" style="font-size:12px">${price}</div><div class="k">API 价格 $/M</div></div>
        <div class="md-stat"><div class="v">${RankData.isOpen(r) ? "开源权重" : "闭源"}</div><div class="k">许可</div></div>
      </div>
      ${this.dim === "value" ? `<div class="kv-grid"><div class="kv"><div class="k">性价比指数</div><div class="v">${RankData.valueScore(r).toFixed(1)} ELO/$</div></div></div>` : ""}
      <div class="note-box">ELO 由真实用户盲测投票产生（Bradley-Terry 模型）。价格来自厂商官方定价页，单位为美元/百万 tokens（输入/输出）。</div>
      ${modelCard}
      ${newsBtn}
      <button class="load-more" style="margin-top:8px" onclick="Bridge.openUrl('https://arena.ai/leaderboard/text')">查看 Arena 实时榜单 ↗</button>
    `);
  }
};
