/* ═════════════ views_mine.js — 我的 / 收藏 / 历史 / 订阅 / 设置 ═════════════ */
"use strict";

const MineView = {
  init() {
    this.renderMenu();
    this.updateProfile();
    this.updateReddot();
  },

  renderMenu() {
    $("#mineMenu").innerHTML = [
      { icon: "💰", name: "价格与套餐", desc: "API/订阅/Agent 全对比", go: "pricing" },
      { icon: "💻", name: "本地部署指南", desc: "Ollama/vLLM 从零到一", go: "deploy" },
      { icon: "⭐", name: "我的收藏", desc: this.favCount() + " 条收藏", go: "fav" },
      { icon: "🕘", name: "浏览历史", desc: this.histCount() + " 条记录", go: "history" }
    ].map(m => `
      <div class="menu-card" onclick="Router.go('${m.go}')">
        <div class="menu-icon">${m.icon}</div>
        <div class="menu-name">${m.name}</div>
        <div class="menu-desc">${m.desc}</div>
      </div>`).join("");
    $("#mineTools").innerHTML = [
      { icon: "🔔", name: "关键词订阅", go: "subs" },
      { icon: "⚙️", name: "设置", go: "settings" },
      { icon: "📡", name: "数据源", go: "sources" },
      { icon: "ℹ️", name: "关于", go: "about" }
    ].map(m => `
      <div class="menu-card" onclick="Router.go('${m.go}')">
        <div class="menu-icon">${m.icon}</div>
        <div class="menu-name" style="font-size:12px">${m.name}</div>
      </div>`).join("");
  },

  updateProfile() {
    const first = Store.get("firstOpenTs", 0);
    if (!first) Store.set("firstOpenTs", Date.now());
    const days = Math.max(1, Math.ceil((Date.now() - (first || Date.now())) / 86400e3));
    $("#profileDesc").textContent = `已陪伴 ${days} 天 · 累计抓取 ${Feeds.items.length} 条资讯`;
  },

  favCount() { return Object.keys(Store.get("favs", {})).length; },
  histCount() { return Store.get("history", []).length; },

  updateReddot() {
    const m = Feeds.matchedSubs || {};
    const n = Object.values(m).reduce((s, arr) => s + arr.length, 0);
    $("#subReddot").classList.toggle("hidden", n === 0);
  },

  /* ---------- 收藏 ---------- */
  toggleFav(it) {
    const favs = Store.get("favs", {});
    if (favs[it.id]) { delete favs[it.id]; Toast.show("已取消收藏"); }
    else { favs[it.id] = { id: it.id, title: it.title, url: it.url, source: it.source, ts: it.ts, savedAt: Date.now() }; Toast.show("⭐ 已收藏"); }
    Store.set("favs", favs);
    this.renderMenu();
  },

  renderFav() {
    const favs = Object.values(Store.get("favs", {})).sort((a, b) => b.savedAt - a.savedAt);
    $("#favBody").innerHTML = favs.length ? `
      <div class="news-list">${favs.map(f => `
        <div class="news-card">
          <div class="news-top">
            <div class="heat-badge"><div class="hb-fire">⭐</div><div class="hb-num" style="font-size:12px">${timeAgo(f.savedAt).replace("前", "")}</div></div>
            <div class="news-main">
              <div class="news-title" onclick="Bridge.openUrl('${esc(f.url)}')">${esc(f.title)}</div>
              <div class="news-meta"><span class="src-tag">${esc(f.source)}</span><span class="news-time">${timeAgo(f.ts)}</span></div>
              <div class="news-actions">
                <button class="nact" onclick="MineView.openFav('${f.id}')">📖 阅读</button>
                <button class="nact" onclick="MineView.shareFav('${f.id}')">↗ 分享</button>
                <button class="nact on" onclick='MineView.removeFav("${f.id}")'>★ 取消</button>
              </div>
            </div>
          </div>
        </div>`).join("")}</div>`
      : `<div class="empty"><div class="empty-icon">⭐</div><div class="empty-title">还没有收藏</div><div class="empty-desc">在资讯卡片上点 ☆ 收藏，离线也能看</div></div>`;
  },

  removeFav(id) {
    const favs = Store.get("favs", {});
    delete favs[id];
    Store.set("favs", favs);
    this.renderFav();
    this.renderMenu();
  },

  shareFav(id) {
    const f = Store.get("favs", {})[id];
    if (f) Bridge.share(f.title, f.url);
  },

  openFav(id) {
    const f = Store.get("favs", {})[id];
    if (!f) return;
    // 优先从实时数据打开（可抓全文），否则外开
    const live = Feeds.items.find(x => x.id === id);
    if (live) ReaderView.open(live);
    else Bridge.openUrl(f.url);
  },

  /* ---------- 历史 ---------- */
  pushHistory(it) {
    let h = Store.get("history", []).filter(x => x.id !== it.id);
    h.unshift({ id: it.id, title: it.title, url: it.url, source: it.source, ts: it.ts, at: Date.now() });
    Store.set("history", h.slice(0, 100));
  },
  renderHistory() {
    const h = Store.get("history", []);
    $("#historyBody").innerHTML = h.length ? `
      <div class="news-list">${h.map(x => `
        <div class="news-card" onclick="MineView.openHist('${x.id}')">
          <div class="news-top">
            <div class="heat-badge"><div class="hb-fire">🕘</div></div>
            <div class="news-main">
              <div class="news-title">${esc(x.title)}</div>
              <div class="news-meta"><span class="src-tag">${esc(x.source)}</span><span class="news-time">${timeAgo(x.at)}</span></div>
            </div>
          </div>
        </div>`).join("")}</div>`
      : `<div class="empty"><div class="empty-icon">🕘</div><div class="empty-title">暂无浏览记录</div></div>`;
  },
  openHist(id) {
    const live = Feeds.items.find(x => x.id === id);
    if (live) { ReaderView.open(live); return; }
    const h = Store.get("history", []).find(x => x.id === id);
    if (h) Bridge.openUrl(h.url);
  },
  clearHistory() { Store.set("history", []); this.renderHistory(); Toast.show("已清空"); },

  /* ---------- 关键词订阅 ---------- */
  addSub() {
    const inp = $("#subInput");
    const kw = inp.value.trim();
    if (!kw) return;
    let subs = Store.get("subs", []);
    if (subs.includes(kw)) { Toast.show("已存在"); return; }
    subs.push(kw);
    Store.set("subs", subs);
    inp.value = "";
    this.renderSubs();
    Feeds.checkSubs();
    this.updateReddot();
    Toast.show("已订阅「" + kw + "」");
  },
  removeSub(kw) {
    let subs = Store.get("subs", []);
    subs = subs.filter(k => k !== kw);
    Store.set("subs", subs);
    this.renderSubs();
    this.updateReddot();
  },
  removeSubIdx(i) {
    const subs = Store.get("subs", []);
    if (i >= 0 && i < subs.length) this.removeSub(subs[i]);
  },
  renderSubs() {
    const subs = Store.get("subs", []);
    const matched = Feeds.matchedSubs || {};
    $("#subsBody").innerHTML = subs.length ? `
      <div class="sub-chip-row" style="margin-bottom:16px">
        ${subs.map((k, i) => `
          <span class="sub-chip">${esc(k)}
            ${matched[k] && matched[k].length ? `<span class="cnt">${matched[k].length}</span>` : ""}
            <i class="x" onclick="MineView.removeSubIdx(${i})">×</i>
          </span>`).join("")}
      </div>
      ${subs.map(k => (matched[k] || []).length ? `
        <div class="section-title">🔔 ${esc(k)}（${matched[k].length} 条命中）</div>
        <div class="news-list">${matched[k].slice().reverse().map(m => `
          <div class="news-card" onclick="MineView.openSubItemById('${esc(m.id)}')">
            <div class="news-top"><div class="news-main">
              <div class="news-title">${esc(m.title)}</div>
              <div class="news-meta"><span class="news-time">${timeAgo(m.ts)}</span></div>
            </div></div>
          </div>`).join("")}</div>` : "").join("")}`
      : `<div class="empty"><div class="empty-icon">🔔</div><div class="empty-title">还没有订阅关键词</div><div class="empty-desc">例如：Qwen、开源、融资、机器人、监管</div></div>`;
  },
  openSubItem(url, id) {
    const live = Feeds.items.find(x => x.id === id);
    if (live) ReaderView.open(live);
    else Bridge.openUrl(url);
  },
  openSubItemById(id) {
    const live = Feeds.items.find(x => x.id === id);
    if (live) { ReaderView.open(live); return; }
    for (const arr of Object.values(Feeds.matchedSubs || {})) {
      const m = arr.find(x => x.id === id);
      if (m) { Bridge.openUrl(m.url); return; }
    }
  },

  /* ---------- 设置 ---------- */
  renderSettings() {
    const s = Settings.data;
    $("#settingsBody").innerHTML = `
      <div class="set-group">
        <div class="set-row"><div class="grow"><div class="set-name">外观主题</div><div class="set-desc">深空暗色 / 浅色 / 跟随系统</div></div>
          <div class="theme-opts">
            ${["dark", "light", "auto"].map(t => `<button class="theme-opt${s.theme === t ? " active" : ""}" data-theme="${t}">${t === "dark" ? "暗色" : t === "light" ? "浅色" : "自动"}</button>`).join("")}
          </div>
        </div>
        <div class="set-row"><div class="grow"><div class="set-name">前台自动刷新</div><div class="set-desc">应用打开时按间隔自动抓取最新资讯</div></div>
          <div class="switch${s.autoRefresh ? " on" : ""}" data-set="autoRefresh"></div>
        </div>
        <div class="set-row"><div class="grow"><div class="set-name">刷新间隔</div><div class="set-desc">分钟（手动刷新不受影响）</div></div>
          <div class="theme-opts">
            ${[3, 5, 10, 15].map(v => `<button class="theme-opt${s.refreshMins === v ? " active" : ""}" data-mins="${v}">${v}</button>`).join("")}
          </div>
        </div>
        <div class="set-row"><div class="grow"><div class="set-name">🌐 自动翻译英文资讯</div><div class="set-desc">列表与阅读器默认显示中文译文，可随时切回原文；译文缓存在本地</div></div>
          <div class="switch${s.translateNews ? " on" : ""}" data-set="translateNews"></div>
        </div>
      </div>
      <div class="set-group">
        <div class="set-row" style="flex-direction:column;align-items:stretch">
          <div style="display:flex;align-items:center">
            <div class="set-name">✨ AI 概括 · 自定义大模型 API</div>
            <span style="margin-left:auto;font-size:10.5px;${AISummary.configured() ? "color:var(--green)" : "color:var(--faint)"};font-weight:700">${AISummary.configured() ? "● 已配置" : "○ 未配置"}</span>
          </div>
          <div class="set-desc" style="margin:4px 0 10px">配置任意 OpenAI 兼容接口（URL + API Key + 模型名），即可使用首页「✨ AI 简报」与阅读器「AI 概括」。Key 仅保存在本机。</div>
          <div id="aiCfgBox">${AISummary.configFormHTML()}</div>
        </div>
      </div>
      <div class="set-group">
        <div class="set-row"><div class="grow"><div class="set-name">清理资讯缓存</div><div class="set-desc">清除已抓取的资讯数据（不影响收藏）</div></div>
          <button class="theme-opt" onclick="MineView.clearNewsCache()">清理</button>
        </div>
        <div class="set-row"><div class="grow"><div class="set-name">清空浏览数据</div><div class="set-desc">历史、搜索记录、订阅命中记录</div></div>
          <button class="theme-opt" onclick="MineView.clearBrowsing()">清空</button>
        </div>
      </div>
      <div class="note-box">🌐 本应用所有数据仅保存在你的设备本地（localStorage），不注册、不上传、不收集任何个人信息。</div>`;
    AISummary.bindConfigForm($("#aiCfgBox"));
    $("#settingsBody").addEventListener("click", e => {
      const th = e.target.closest("[data-theme]");
      if (th) {
        Settings.set("theme", th.dataset.theme);
        Settings.applyTheme();
        $$("#settingsBody .theme-opt[data-theme]").forEach(x => x.classList.toggle("active", x === th));
        return;
      }
      const mi = e.target.closest("[data-mins]");
      if (mi) {
        Settings.set("refreshMins", +mi.dataset.mins);
        App.restartTimer();
        $$("#settingsBody .theme-opt[data-mins]").forEach(x => x.classList.toggle("active", x === mi));
        return;
      }
      const sw = e.target.closest("[data-set]");
      if (sw) {
        const key = sw.dataset.set;
        Settings.set(key, !Settings.get(key));
        sw.classList.toggle("on", Settings.get(key));
        if (key === "autoRefresh") App.restartTimer();
        if (key === "translateNews") {
          Feeds.items.forEach(i => { i._showZh = null; });
          HomeView.initTransBtn();
          HomeView.renderList();
        }
      }
    });
  },
  clearNewsCache() {
    Store.remove("newsCache");
    Toast.show("已清理，下次启动重新抓取");
  },
  clearBrowsing() {
    ["history", "recentSearch", "matchedSubs", "seenSubIds", "prevScores"].forEach(k => Store.remove(k));
    if (typeof Translator !== "undefined") Translator.clear();
    Toast.show("已清空浏览数据");
  },

  /* ---------- 数据源页 ---------- */
  renderSources() {
    const dis = Settings.get("disabledSources") || [];
    $("#sourcesBody").innerHTML = Feeds.sources.map(src => {
      const st = Feeds.state[src.id];
      const dot = !st ? "off" : st.ok ? "ok" : "fail";
      return `
      <div class="src-row" onclick="MineView.toggleSource('${src.id}')">
        <div class="src-dot ${dot}"></div>
        <div style="flex:1;min-width:0">
          <div class="src-name">${esc(src.name)} <span style="font-size:10px;color:var(--faint)">${src.lang === "zh" ? "中文" : "EN"} · 权重 ${src.weight}</span></div>
          <div class="src-meta">${esc(src.desc || "")}${st ? (st.ok ? " · 最近 " + st.count + " 条 / " + st.ms + "ms" : " · 上次失败") : ""}</div>
        </div>
        <div class="switch${dis.includes(src.id) ? "" : " on"}"></div>
      </div>`;
    }).join("") + `<div class="note-box">共 ${Feeds.sources.length} 个数据源（RSS/Atom/JSON API），禁用后不再抓取。部分海外源在国内网络下可能不稳定，失败不影响其他源。</div>`;
  },
  toggleSource(id) {
    let d = Settings.get("disabledSources") || [];
    if (d.includes(id)) d = d.filter(x => x !== id);
    else d.push(id);
    Settings.set("disabledSources", d);
    this.renderSources();
  },

  /* ---------- 关于 ---------- */
  renderAbout() {
    $("#aboutBody").innerHTML = `
      <div class="hero-card" style="text-align:center;margin-bottom:16px">
        <div style="font-size:44px;margin-bottom:4px">📡</div>
        <div class="app-name" style="font-size:20px">AI雷达 <span class="app-sub">AIRadar</span></div>
        <div style="font-size:12px;color:var(--muted);margin-top:4px">v1.0.0 · 全球 AI 资讯与模型情报站</div>
      </div>
      <div class="set-group">
        <div class="set-row"><div class="grow"><div class="set-name">实时聚合</div><div class="set-desc">24 个全球数据源（HN/媒体/论文/社区/厂商博客），每 5 分钟增量抓取</div></div></div>
        <div class="set-row"><div class="grow"><div class="set-name">热度算法</div><div class="set-desc">新鲜度 + 互动信号（HN票数/Reddit分/HF推荐）+ 源权重 + 话题加成</div></div></div>
        <div class="set-row"><div class="grow"><div class="set-name">榜单来源</div><div class="set-desc">Arena（原 LMArena）官方总榜快照 + HuggingFace 实时趋势</div></div></div>
        <div class="set-row"><div class="grow"><div class="set-name">价格数据</div><div class="set-desc">各厂商官方定价页人工汇总（2026-10），仅供参考</div></div></div>
      </div>
      <div class="section-title">数据来源鸣谢</div>
      <div class="set-group">
        ${[
          ["Arena (LMArena)", "https://arena.ai/leaderboard/text"],
          ["Hacker News (Algolia API)", "https://hn.algolia.com"],
          ["Hugging Face", "https://huggingface.co"],
          ["arXiv", "https://arxiv.org"],
          ["机器之心", "https://www.jiqizhixin.com"],
          ["量子位", "https://www.qbitai.com"],
          ["TechCrunch / The Verge / VentureBeat", "https://techcrunch.com"],
          ["OpenAI / Anthropic / Google 官方博客", "https://openai.com/news"]
        ].map(([n, u]) => `
          <div class="src-row" onclick="Bridge.openUrl('${u}')">
            <div class="src-dot ok"></div>
            <div style="flex:1"><div class="src-name">${n}</div><div class="src-meta">${u}</div></div>
            <div class="li-arrow">›</div>
          </div>`).join("")}
      </div>
      <div class="note-box">⚖️ 免责声明：本应用聚合公开互联网信息，版权归原出处所有；榜单与价格数据仅供参考，以官方页面为准。应用无账号系统、不上传任何用户数据。</div>`;
  }
};
