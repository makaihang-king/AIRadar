/* ═════════════ views_main.js — 首页 / 热榜 / 阅读器 / 搜索 ═════════════ */
"use strict";

/* ---------- 首页 ---------- */
const HomeView = {
  cat: "all", sort: "hot", range: 0, page: 1,
  perPage: 20, pending: 0,

  /* ----- 翻译状态：单条 _showZh 优先，其次全局设置 ----- */
  showZh(it) {
    if (it.lang !== "en") return false;
    return it._showZh != null ? it._showZh : Settings.get("translateNews");
  },
  titleText(it) { return this.showZh(it) && it._zh && it._zh.title ? it._zh.title : it.title; },
  summaryText(it) { return this.showZh(it) && it._zh && it._zh.summary ? it._zh.summary : it.summary; },

  initTransBtn() {
    const b = $("#transToggle");
    if (!b) return;
    const on = Settings.get("translateNews");
    b.classList.toggle("has-filter", on);
    b.textContent = on ? "🌐 译中·开" : "🌐 译中·关";
  },

  toggleGlobalTrans() {
    const v = !Settings.get("translateNews");
    Settings.set("translateNews", v);
    Feeds.items.forEach(i => { i._showZh = null; });
    this.initTransBtn();
    this.renderList();
    Toast.show(v ? "🌐 已开启英文自动翻译（译文本地缓存）" : "已切换为原文显示");
  },

  async toggleItemTrans(it) {
    if (it.lang !== "en") return;
    if (!it._zh) {
      Toast.show("翻译中…");
      try { await Translator.translateItem(it); }
      catch (e) { Toast.show(e.message || "翻译失败，请稍后再试"); return; }
    }
    it._showZh = !this.showZh(it);
    this.renderList();
  },

  debRender: null,

  maybeAutoTranslate(show) {
    if (!Settings.get("translateNews")) return;
    let fired = 0;
    for (const it of show) {
      if (it.lang === "en" && this.showZh(it) && !it._zh && !it._zhPending && fired < 8) {
        fired++;
        it._zhPending = 1;
        Translator.translateItem(it).catch(() => { }).finally(() => {
          it._zhPending = 0;
          HomeView.debRender();
        });
      }
    }
  },

  init() {
    // 分区 chips
    const chipBox = $("#catChips");
    chipBox.innerHTML = CATS.map(c =>
      `<button class="chip${c.id === this.cat ? " active" : ""}" data-cat="${c.id}">${CAT_ICON[c.id] || ""} ${c.name}</button>`
    ).join("");
    chipBox.onclick = e => {
      const b = e.target.closest("[data-cat]");
      if (!b) return;
      this.cat = b.dataset.cat; this.page = 1;
      $$(".chip", chipBox).forEach(c => c.classList.toggle("active", c.dataset.cat === this.cat));
      this.renderList();
    };
    // 排序
    $("#sortSeg").onclick = e => {
      const b = e.target.closest("[data-sort]");
      if (!b) return;
      this.sort = b.dataset.sort; this.page = 1;
      $$("#sortSeg .seg-btn").forEach(x => x.classList.toggle("active", x === b));
      this.renderList();
    };
    // 时间范围
    $("#rangeSeg").onclick = e => {
      const b = e.target.closest("[data-range]");
      if (!b) return;
      this.range = +b.dataset.range; this.page = 1;
      $$("#rangeSeg .seg-btn").forEach(x => x.classList.toggle("active", x === b));
      this.renderList();
    };
    this.initTransBtn();
    this.debRender = debounce(() => this.renderList(), 700);
    this.renderList();
    this.bindPullRefresh();
  },

  filtered() {
    const dis = Settings.get("disabledSources") || [];
    const cutoff = this.range ? Date.now() - this.range * 3600e3 : 0;
    let arr = Feeds.items.filter(it =>
      (this.cat === "all" || it.cat === this.cat) &&
      it.ts >= cutoff && !dis.includes(it.sourceId));
    if (this.sort === "hot") arr.sort((a, b) => (b.score ? b.score.total : 0) - (a.score ? a.score.total : 0));
    else arr.sort((a, b) => b.ts - a.ts);
    return arr;
  },

  renderList() {
    const box = $("#newsList");
    const arr = this.filtered();
    const show = arr.slice(0, this.page * this.perPage);
    $("#newsEmpty").classList.toggle("hidden", arr.length > 0);
    $("#loadMoreBtn").classList.toggle("hidden", show.length >= arr.length);
    if (!arr.length) {
      box.innerHTML = "";
      $(".empty-desc").textContent = `当前筛选无结果（共 ${Feeds.items.length} 条）。试试切换分区或时间范围，或点击右上角刷新。`;
      return;
    }
    const favs = Store.get("favs", {});
    box.innerHTML = show.map(it => this.cardHTML(it, !!favs[it.id])).join("");
    this.maybeAutoTranslate(show);
  },

  loadMore() { this.page++; this.renderList(); },

  cardHTML(it, faved) {
    const sc = it.score ? it.score.total : 0;
    const hot = sc >= 72;
    const cat = CATS.find(c => c.id === it.cat);
    const acts = [];
    if (it.lang === "en") {
      const zh = this.showZh(it);
      acts.push(`<button class="nact${zh ? " on" : ""}" data-act="tr" data-id="${it.id}">🌐 ${zh ? "原文" : "译文"}</button>`);
    }
    acts.push(`<button class="nact${faved ? " on" : ""}" data-act="fav" data-id="${it.id}">${faved ? "★" : "☆"} 收藏</button>`);
    acts.push(`<button class="nact" data-act="heat" data-id="${it.id}">🔥 分析</button>`);
    acts.push(`<button class="nact" data-act="share" data-id="${it.id}">↗ 分享</button>`);
    const engTag = it.lang === "en" ? '<span class="eng-tag">EN</span>' : "";
    const title = this.titleText(it);
    const summary = this.summaryText(it);
    const discuss = it.discuss ? `<a class="nact" href="javascript:void(0)" data-act="discuss" data-id="${it.id}">💬 ${fmtNum(it.comments)}</a>` :
      (it.comments ? `<span class="comments-n">💬 ${fmtNum(it.comments)}</span>` : "");
    return `
    <div class="news-card" data-id="${it.id}">
      <div class="news-top">
        <div class="heat-badge${hot ? " lv-hot" : ""}">
          <div class="hb-fire">${hot ? "🔥" : "⚡"}</div>
          <div class="hb-num">${sc}</div>
        </div>
        <div class="news-main">
          <div class="news-title" data-act="open" data-id="${it.id}">${esc(title)}</div>
          ${summary ? `<div class="news-summary">${esc(summary)}</div>` : ""}
          <div class="news-meta">
            <span class="src-tag">${esc(it.source)}</span>
            <span class="news-time">${timeAgo(it.ts)}</span>
            ${engTag}
            <span class="cat-tag">${CAT_ICON[it.cat] || ""} ${cat ? cat.name : it.cat}</span>
            ${it.points ? `<span class="news-time">▲ ${fmtNum(it.points)}</span>` : ""}
          </div>
          <div class="news-actions">${discuss}${acts.join("")}</div>
        </div>
      </div>
    </div>`;
  },

  bindCardEvents() {
    // 全局事件委托：首页列表、搜索结果、通知浮层中的新闻卡统一响应
    document.body.addEventListener("click", e => {
      const t = e.target.closest(".news-card [data-act]");
      if (!t) return;
      const it = Feeds.items.find(x => x.id === t.dataset.id);
      if (!it) return;
      const act = t.dataset.act;
      if (act === "open") { ReaderView.open(it); }
      else if (act === "fav") { MineView.toggleFav(it); HomeView.renderList(); }
      else if (act === "tr") { HomeView.toggleItemTrans(it); }
      else if (act === "share") { Bridge.share(it.title, it.url); }
      else if (act === "heat") { HomeView.showHeat(it); }
      else if (act === "discuss") { Bridge.openUrl(it.discuss); }
    });
  },

  showHeat(it) {
    const s = it.score || { total: 0, fresh: 0, eng: 0, src: 0, boost: 1 };
    const max = 42;
    Modal.open(`
      <div style="font-weight:800;font-size:16px;margin-bottom:4px">🔥 热度分析</div>
      <div style="font-size:12.5px;color:var(--muted);margin-bottom:12px">${esc(it.title)}</div>
      ${[
        ["综合热度", s.total, 100, "分"],
        ["新鲜度", s.fresh, 42, ""],
        ["互动热度", s.eng, 26, ""],
        ["来源权重", s.src, 14, ""]
      ].map(([n, v, m]) => `
        <div class="rh-row">
          <div class="rh-label">${n}</div>
          <div class="rh-bar"><i style="width:${Math.min(100, v / m * 100)}%"></i></div>
          <div class="rh-val">${v}</div>
        </div>`).join("")}
      <div class="rh-row"><div class="rh-label">话题加成</div><div style="color:var(--accent);font-size:12.5px;font-weight:700">×${s.boost}</div></div>
      <div class="note-box" style="margin-top:12px">热度 = (新鲜度 + 互动热度 + 来源权重) × 话题加成。互动数据来自 Hacker News / Reddit / HuggingFace 实时数据；RSS 源使用中性基准。</div>
    `);
  },

  openSourceSheet() {
    const dis = Settings.get("disabledSources") || [];
    const rows = Feeds.sources.filter(s => s.type !== "hftrending").map(s => {
      const st = Feeds.state[s.id];
      const dot = !st ? "off" : st.ok ? "ok" : "fail";
      return `
      <div class="src-row" data-sid="${s.id}">
        <div class="src-dot ${dot}"></div>
        <div style="flex:1;min-width:0">
          <div class="src-name">${esc(s.name)} <span style="font-size:10px;color:var(--faint)">${s.lang === "zh" ? "中文" : "EN"}</span></div>
          <div class="src-meta">${esc(s.desc || "")}${st ? (st.ok ? " · " + st.count + "条" : " · 失败") : ""}</div>
        </div>
        <div class="switch${dis.includes(s.id) ? "" : " on"}"></div>
      </div>`;
    }).join("");
    Sheet.open(`
      <div style="font-weight:800;font-size:16px;margin-bottom:10px">数据源筛选</div>
      <div style="font-size:11.5px;color:var(--faint);margin-bottom:8px">点击开关启用/禁用数据源（绿色=正常，红色=抓取失败，灰色=未抓取）</div>
      <div>${rows}</div>
      <button class="load-more" style="margin-top:10px" onclick="Sheet.close();App.manualRefresh()">完成并刷新</button>
    `, body => {
      body.querySelectorAll(".src-row").forEach(row => {
        row.onclick = () => {
          const sid = row.dataset.sid;
          let d = Settings.get("disabledSources") || [];
          if (d.includes(sid)) d = d.filter(x => x !== sid);
          else d.push(sid);
          Settings.set("disabledSources", d);
          const sw = row.querySelector(".switch");
          sw.classList.toggle("on", !d.includes(sid));
        };
      });
    });
  },

  applyNewItems() {
    this.pending = 0;
    $("#newItemsPill").classList.add("hidden");
    this.page = 1;
    this.renderList();
    $("#main").scrollTo({ top: 0, behavior: "smooth" });
  },

  notifyNew(n) {
    if (n <= 0) return;
    if ($("#page-home").classList.contains("active")) {
      this.pending = n;
      $("#newItemsCount").textContent = n;
      $("#newItemsPill").classList.remove("hidden");
    } else {
      this.renderList();
    }
  },

  /* 下拉刷新 */
  bindPullRefresh() {
    const m = $("#main");
    let startY = 0, pulling = false, dist = 0;
    let hint = null;
    m.addEventListener("touchstart", e => {
      if (m.scrollTop <= 0) { startY = e.touches[0].clientY; pulling = true; dist = 0; }
    }, { passive: true });
    m.addEventListener("touchmove", e => {
      if (!pulling) return;
      dist = e.touches[0].clientY - startY;
      if (dist > 60 && !hint) {
        hint = el("div", "toast", "↓ 释放即可刷新");
        $("#toastRoot").appendChild(hint);
      }
    }, { passive: true });
    m.addEventListener("touchend", () => {
      if (hint) { hint.remove(); hint = null; }
      if (pulling && dist > 60) App.manualRefresh();
      pulling = false;
    });
  },

  updateHero() {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todays = Feeds.items.filter(i => i.ts >= today.getTime());
    $("#statItems").textContent = fmtNum(todays.length);
    const okSrc = Object.values(Feeds.state).filter(s => s.ok).length;
    $("#statSources").textContent = okSrc + "/" + Feeds.enabledSources().length;
    const maxScore = Feeds.items.reduce((m, i) => Math.max(m, i.score ? i.score.total : 0), 0);
    $("#statHot").textContent = maxScore || "–";
    $("#heroDate").textContent = fmtDate(Date.now());
    const words = HotWords.extract(Feeds.items, 2).slice(0, 6);
    $("#heroWords").innerHTML = words.map(w =>
      `<span class="hero-word" onclick="SearchView.open('news','${esc(w.word)}')">${esc(w.word)} <b>${w.n}</b></span>`).join("")
      || '<span class="hero-word">等待数据…</span>';
  }
};

/* ---------- 热榜页 ---------- */
const TrendingView = {
  tab: "hot",
  init() {
    $("#trendSeg").onclick = e => {
      const b = e.target.closest("[data-ttab]");
      if (!b) return;
      this.tab = b.dataset.ttab;
      $$("#trendSeg .seg-btn").forEach(x => x.classList.toggle("active", x === b));
      this.render();
    };
    this.render();
  },
  render() {
    const body = $("#trendBody");
    if (this.tab === "words") { body.innerHTML = this.wordsHTML(); this.drawCloud(); return; }
    let list = Feeds.items.filter(i => i.ts >= Date.now() - 7 * 86400e3);
    list.sort((a, b) => (b.score ? b.score.total : 0) - (a.score ? a.score.total : 0));
    if (this.tab === "rising") {
      // 热度速度榜：当前热度 ÷ 首次监测到的小时数，新晋条目标 NEW
      list = list.map(it => {
        const sinceMs = Math.max(30 * 60e3, Date.now() - (it.fetchedAt || it.ts));
        const hours = sinceMs / 3600e3;
        const nowScore = Score.compute(it).total;
        return { it, velocity: nowScore / hours, isNew: sinceMs < 45 * 60e3 };
      });
      list.sort((a, b) => b.velocity - a.velocity);
      list = list.slice(0, 40);
      body.innerHTML = `<div class="subtip">🆕 按热度上升速度排名（当前热度 ÷ 监测时长）；「NEW」为最近 45 分钟新抓取的条目。</div>` +
        `<div class="rising-list">` + list.map((x, i) => this.rowHTML(x.it, i, x.velocity, null, x.isNew)).join("") + `</div>`;
    } else {
      list = list.slice(0, 50);
      const max = list.length ? (list[0].score ? list[0].score.total : 1) : 1;
      body.innerHTML = list.map((it, i) => this.rowHTML(it, i, null, max)).join("");
    }
    body.onclick = e => {
      const t = e.target.closest("[data-open]");
      if (!t) return;
      const it = Feeds.items.find(x => x.id === t.dataset.open);
      if (it) ReaderView.open(it);
    };
  },
  rowHTML(it, i, delta, max, isNew) {
    const sc = it.score ? it.score.total : 0;
    const w = max ? Math.max(6, sc / max * 100) : Math.min(100, Math.max(6, (delta || 0) * 8));
    const rk = i < 3 ? "r" + (i + 1) : "";
    const deltaHtml = isNew
      ? '<div class="trend-delta new">NEW</div>'
      : (delta != null ? `<div class="trend-delta up">▲ 速度 ${delta.toFixed(1)}/时</div>` : "");
    return `
    <div class="trend-row" data-open="${it.id}">
      <div class="trend-rank ${rk}">${i + 1}</div>
      <div class="trend-info">
        <div class="trend-title">${esc(HomeView.titleText(it))}</div>
        <div class="trend-sub">${esc(it.source)} · ${timeAgo(it.ts)}${it.points ? " · ▲" + fmtNum(it.points) : ""}</div>
      </div>
      <div class="trend-barwrap">
        <div class="trend-score">${sc}</div>
        <div class="trend-bar"><i style="width:${w}%"></i></div>
        ${delta !== null || this.tab === "rising" ? deltaHtml : ""}
      </div>
    </div>`;
  },
  wordsHTML() {
    const words = HotWords.extract(Feeds.items, 3);
    if (!words.length) return `<div class="empty"><div class="empty-icon">🗒️</div><div class="empty-title">暂无热词数据</div></div>`;
    return `
      <div class="wordcloud-wrap"><canvas id="cloudCanvas"></canvas></div>
      <div class="section-title" style="margin-top:14px">热词指数榜</div>
      ${words.slice(0, 20).map((w, i) => `
        <div class="trend-row" onclick="SearchView.open('news','${esc(w.word)}')">
          <div class="trend-rank ${i < 3 ? "r" + (i + 1) : ""}">${i + 1}</div>
          <div class="trend-info"><div class="trend-title">${esc(w.word)}</div></div>
          <div class="trend-barwrap"><div class="trend-score">${w.n}</div><div class="trend-bar"><i style="width:${Math.min(100, w.n / words[0].n * 100)}%"></i></div></div>
        </div>`).join("")}`;
  },
  drawCloud() {
    const cv = $("#cloudCanvas");
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    const W = cv.clientWidth || 340, H = 380;
    cv.width = W * dpr; cv.height = H * dpr;
    const ctx = cv.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);
    const words = HotWords.extract(Feeds.items, 3).slice(0, 42);
    if (!words.length) return;
    const max = words[0].n, min = words[words.length - 1].n;
    const colors = ["#22d3ee", "#818cf8", "#f472b6", "#facc15", "#34d399", "#e8edfb", "#a5b4fc"];
    const placed = [];
    const cx = W / 2, cy = H / 2;
    words.forEach((w, idx) => {
      const t = (w.n - min) / Math.max(1, max - min);
      const size = 12 + t * 26;
      ctx.font = `800 ${size}px system-ui, sans-serif`;
      const tw = ctx.measureText(w.word).width;
      let angle = 0, r = 0, x = cx, y = cy, ok = false;
      for (let step = 0; step < 400; step++) {
        angle = step * 0.45;
        r = 4 + step * 0.55;
        x = cx + Math.cos(angle) * r * 1.15;
        y = cy + Math.sin(angle) * r * 0.62;
        if (x < 4 || x + tw > W - 4 || y < size || y > H - 6) continue;
        const box = { x: x - 3, y: y - size, w: tw + 6, h: size + 6 };
        if (!placed.some(p => !(box.x + box.w < p.x || p.x + p.w < box.x || box.y + box.h < p.y || p.y + p.h < box.y))) {
          ok = true; placed.push(box); break;
        }
      }
      if (!ok) return;
      ctx.fillStyle = colors[idx % colors.length];
      ctx.globalAlpha = 0.55 + t * 0.45;
      ctx.fillText(w.word, x, y);
      ctx.globalAlpha = 1;
    });
  }
};

/* ---------- 阅读器 ---------- */
const ReaderView = {
  cur: null, fontScale: 1, showZh: false, curText: null,

  open(it) {
    this.cur = it;
    this.curText = null;
    this.showZh = HomeView.showZh(it);
    $("#readerSrc").textContent = it.source;
    $("#readerTransBtn").textContent = this.showZh ? "原文" : "译";
    $("#readerTransBtn").style.display = it.lang === "en" ? "" : "none";
    $("#readerBody").innerHTML = `<div class="skel"><div class="skel-line t"></div><div class="skel-line m"></div><div class="skel-line m"></div><div class="skel-line s"></div></div><p style="color:var(--faint);font-size:12px;margin-top:12px">正在抓取原文…</p>`;
    $("#readerOverlay").classList.remove("hidden");
    this.applyFont();
    MineView.pushHistory(it);
    this.load(it);
  },

  async load(it) {
    try {
      const html = await Bridge.fetchText(it.url, 18000);
      const text = this.extract(html);
      if (!(text && text.length > 120)) throw new Error("empty");
      this.curText = text;
      this.renderContent(false);
      if (this.showZh) this.translateBody();
    } catch (e) {
      this.curText = null;
      this.renderContent(true);
    }
  },

  /** 统一渲染：原文 / 译文 / 抓取失败三种形态 */
  renderContent(failed) {
    const it = this.cur;
    const useZh = this.showZh && it.lang === "en";
    const title = useZh && it._zh && it._zh.title ? it._zh.title : it.title;
    const head = `
      <h1>${esc(title)}${useZh && it._zh && it._zh.title ? ' <span class="eng-tag" style="vertical-align:middle">译</span>' : ""}</h1>
      <div class="reader-meta">
        <span class="src-tag">${esc(it.source)}</span> · ${timeAgo(it.ts)} · 热度 <b style="color:var(--accent)">${it.score ? it.score.total : "–"}</b>
        ${it.points ? ` · ▲${fmtNum(it.points)} 💬${fmtNum(it.comments)}` : ""}
      </div>
      ${this.heatBox(it)}`;
    let contentHTML;
    if (failed || !this.curText) {
      const summary = useZh && it._zh && it._zh.summary ? it._zh.summary : it.summary;
      contentHTML = `
        <div class="note-box">⚠️ 原文抓取失败（网站可能限制访问或需要登录）。${summary ? "以下是摘要：" : ""}</div>
        ${summary ? `<p>${esc(summary)}</p>` : ""}
        <button class="load-more" onclick="Bridge.openUrl('${esc(it.url)}')">在浏览器中打开原文 ↗</button>`;
    } else if (useZh) {
      const zhBody = it._zhBody || "⏳ 正在翻译全文，长文约需数秒…（可先点「原文」阅读）";
      contentHTML = zhBody.split("\n").filter(p => p.trim()).map(p => `<p>${esc(p)}</p>`).join("");
    } else {
      contentHTML = this.curText.split("\n").filter(p => p.trim()).map(p => `<p>${esc(p)}</p>`).join("");
    }
    $("#readerBody").innerHTML = head +
      (it._aiSum && !it._aiSumHidden ? AISummary.aiBoxHTML(it._aiSum) : "") +
      contentHTML;
  },

  /** 后台翻译全文（标题复用 _zh，正文分块翻译挂到 _zhBody） */
  async translateBody() {
    const it = this.cur;
    if (!it || it.lang !== "en" || !this.curText || it._zhBody || it._zhBodyP) return;
    it._zhBodyP = 1;
    if (!it._zh) {
      try { $("#readerBody").insertAdjacentHTML("afterbegin", '<p id="trNote" style="color:var(--faint);font-size:12px">⏳ 正在翻译…</p>'); } catch (e) { }
    }
    try {
      if (!it._zh) await Translator.translateItem(it);
      it._zhBody = await Translator.translate(this.curText);
    } catch (e) {
      it._zhBody = null;
      Toast.show(e.message || "翻译失败，已显示原文");
    }
    it._zhBodyP = 0;
    if (this.cur === it) {
      const n = $("#trNote"); if (n) n.remove();
      this.renderContent(false);
    }
  },

  toggleTrans() {
    if (!this.cur || this.cur.lang !== "en") return;
    this.showZh = !this.showZh;
    $("#readerTransBtn").textContent = this.showZh ? "原文" : "译";
    this.renderContent(false);
    if (this.showZh) this.translateBody();
  },
  extract(html) {
    try {
      const doc = new DOMParser().parseFromString(html, "text/html");
      doc.querySelectorAll("script,style,nav,header,footer,aside,form,iframe,svg,noscript,button").forEach(n => n.remove());
      const cands = Array.from(doc.querySelectorAll("article, main, [itemtype*='Article'], .article-content, .post-content, #content, .content, .entry-content, body"));
      let best = "", bestLen = 0;
      for (const c of cands) {
        const ps = Array.from(c.querySelectorAll("p, li"));
        const txt = ps.map(p => p.textContent.trim()).filter(t => t.length > 24).join("\n");
        if (txt.length > bestLen) { bestLen = txt.length; best = txt; }
      }
      return bestLen > 300 ? best.slice(0, 24000) : (doc.body ? doc.body.textContent.replace(/\s{3,}/g, "\n").trim().slice(0, 20000) : "");
    } catch (e) { return ""; }
  },
  heatBox(it) {
    const s = it.score || { fresh: 0, eng: 0, src: 0, boost: 1, total: 0 };
    return `
    <div class="reader-heat">
      <div class="rh-title">🔥 热度 ${s.total} · 构成</div>
      ${[["新鲜度", s.fresh, 42], ["互动热度", s.eng, 26], ["来源权重", s.src, 14]].map(([n, v, m]) => `
      <div class="rh-row"><div class="rh-label">${n}</div><div class="rh-bar"><i style="width:${Math.min(100, v / m * 100)}%"></i></div><div class="rh-val">${v}</div></div>`).join("")}
    </div>`;
  },
  applyFont() { $("#readerBody").style.fontSize = (16 * this.fontScale) + "px"; },
  fontUp() { this.fontScale = Math.min(1.6, this.fontScale + 0.1); this.applyFont(); },
  fontDown() { this.fontScale = Math.max(0.8, this.fontScale - 0.1); this.applyFont(); },
  openExternal() { if (this.cur) Bridge.openUrl(this.cur.url); },
  close() { $("#readerOverlay").classList.add("hidden"); }
};

/* ---------- 全局搜索 ---------- */
const SearchView = {
  tab: "news",
  open(tab, keyword) {
    $("#searchOverlay").classList.remove("hidden");
    const inp = $("#searchInput");
    if (keyword) inp.value = keyword;
    if (tab) {
      this.tab = tab;
      $$("#searchTabs .seg-btn").forEach(b => b.classList.toggle("active", b.dataset.stab === tab));
    }
    setTimeout(() => inp.focus(), 60);
    if (inp.value) this.run();
    else this.renderRecent();
  },
  close() { $("#searchOverlay").classList.add("hidden"); },
  init() {
    $("#searchTabs").onclick = e => {
      const b = e.target.closest("[data-stab]");
      if (!b) return;
      this.tab = b.dataset.stab;
      $$("#searchTabs .seg-btn").forEach(x => x.classList.toggle("active", x === b));
      if ($("#searchInput").value) this.run();
    };
    $("#searchInput").addEventListener("keydown", e => { if (e.key === "Enter") this.run(); });
    $("#searchInput").addEventListener("input", debounce(() => { if ($("#searchInput").value.trim()) this.run(); }, 350));
  },
  renderRecent() {
    const rec = Store.get("recentSearch", []);
    $("#searchBody").innerHTML = rec.length ? `
      <div class="section-title">最近搜索</div>
      <div class="sub-chip-row">${rec.map(k => `<span class="sub-chip" onclick="$('#searchInput').value='${esc(k)}';SearchView.run()">${esc(k)} <i class="x">×</i></span>`).join("")}</div>`
      : `<div class="empty"><div class="empty-icon">🔍</div><div class="empty-title">搜索一切 AI</div><div class="empty-desc">资讯标题 / 模型名称 / 榜单排名</div></div>`;
  },
  run() {
    const q = $("#searchInput").value.trim();
    if (!q) { this.renderRecent(); return; }
    let rec = Store.get("recentSearch", []).filter(k => k !== q);
    rec.unshift(q); Store.set("recentSearch", rec.slice(0, 10));
    const terms = q.toLowerCase().split(/\s+/);
    const hit = s => { const t = (s || "").toLowerCase(); return terms.every(w => t.includes(w)); };
    const body = $("#searchBody");
    if (this.tab === "news") {
      const arr = Feeds.items.filter(i => hit(i.title + " " + i.summary)).slice(0, 40);
      body.innerHTML = arr.length
        ? `<div class="news-list">${arr.map(it => HomeView.cardHTML(it, !!Store.get("favs", {})[it.id])).join("")}</div>`
        : `<div class="empty"><div class="empty-icon">🫙</div><div class="empty-title">没有相关资讯</div><div class="empty-desc">试试其他关键词</div></div>`;
    } else if (this.tab === "models") {
      const arr = (typeof ModelDB !== "undefined" ? ModelDB.search(q) : []);
      body.innerHTML = arr.length ? `<div class="model-grid" style="grid-template-columns:1fr">${arr.map(m => ModelsView.cardHTML(m)).join("")}</div>`
        : `<div class="empty"><div class="empty-icon">🫙</div><div class="empty-title">没有匹配模型</div></div>`;
      ModelsView.bindGrid(body);
    } else {
      const arr = (typeof RankData !== "undefined" ? RankData.searchRows(q) : []);
      body.innerHTML = arr.length ? arr.map((r, i) => RankView.rowHTML(r, r.rank || i, 1525)).join("")
        : `<div class="empty"><div class="empty-icon">🫙</div><div class="empty-title">榜单中没有该模型</div></div>`;
    }
  }
};
