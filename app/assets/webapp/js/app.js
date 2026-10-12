/* ═════════════ app.js — 路由 / 初始化 / 刷新调度 ═════════════ */
"use strict";

const Router = {
  pages: ["home", "trending", "rank", "models", "mine",
    "pricing", "deploy", "fav", "history", "subs", "settings", "sources", "about"],
  mainTabs: ["home", "trending", "rank", "models", "mine"],
  cur: "home",
  go(page) {
    if (!this.pages.includes(page)) page = "home";
    this.cur = page;
    $$(".page").forEach(p => p.classList.toggle("active", p.id === "page-" + page));
    // 底部导航高亮（子页面归属对应主 tab）
    const belong = this.mainTabs.includes(page) ? page : this.belong(page);
    $$(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === belong));
    $("#main").scrollTo({ top: 0 });
    // 懒渲染
    if (page === "fav") MineView.renderFav();
    if (page === "history") MineView.renderHistory();
    if (page === "subs") MineView.renderSubs();
    if (page === "settings") MineView.renderSettings();
    if (page === "sources") MineView.renderSources();
    if (page === "about") MineView.renderAbout();
    if (page === "pricing") PricingView.init();
    if (page === "deploy") DeployView.init();
    if (page === "trending") TrendingView.render();
    if (page === "rank") RankView.init();
    location.hash = page;
  },
  belong(page) {
    if (["pricing", "deploy", "fav", "history", "subs", "settings", "sources", "about"].includes(page)) return "mine";
    return "home";
  },
  fromHash() {
    const h = (location.hash || "").replace("#", "");
    return this.pages.includes(h) ? h : "home";
  }
};

const App = {
  timer: null,
  booted: false,

  async boot() {
    Settings.load();
    await Feeds.loadRegistry();
    const hasCache = Feeds.loadCache();
    // 首屏渲染
    Router.go(Router.fromHash());
    HomeView.init();
    HomeView.bindCardEvents();
    TrendingView.init();
    MineView.init();
    SearchView.init();
    ModelsView.init();
    RankView.init();
    PricingView.init();
    DeployView.init();

    if (!hasCache) this.setStatus("首次启动 · 正在抓取全球 AI 资讯…", false);
    else this.setStatus("上次更新 " + timeAgo(Feeds.lastUpdate) + " · 正在增量更新…", true);

    // 首次刷新
    await this.refresh(false);
    this.booted = true;
    this.restartTimer();

    window.addEventListener("hashchange", () => { const p = Router.fromHash(); if (p !== Router.cur) Router.go(p); });
  },

  setStatus(text, live) {
    const el = $("#syncStatus");
    el.textContent = text;
    el.classList.toggle("live", !!live);
  },

  async refresh(manual) {
    const before = new Set(Feeds.items.map(i => i.id));
    const btn = $("#btnRefresh");
    btn.classList.add("spinning");
    Feeds.refresh((done, total, name) => {
      this.setStatus(`抓取中 ${done}/${total} · ${name}`, false);
    }).then(res => {
      btn.classList.remove("spinning");
      const fresh = Feeds.items.filter(i => !before.has(i.id) && Date.now() - i.ts < 86400e3).length;
      const okCount = Object.values(Feeds.state).filter(s => s.ok).length;
      this.setStatus(`已更新 ${Feeds.items.length} 条 · ${okCount} 源在线 · ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`, true);
      HomeView.updateHero();
      HomeView.renderList();
      TrendingView.render();
      MineView.renderMenu();
      MineView.updateReddot();
      if (manual) Toast.show(`✅ 已更新：${res.items} 条资讯（${res.ms / 1000 | 0}s）`);
      if (fresh > 0) HomeView.notifyNew(fresh);
    }).catch(e => {
      btn.classList.remove("spinning");
      this.setStatus("更新失败 · 请检查网络", false);
      if (manual) Toast.show("更新失败，请检查网络");
    });
  },

  manualRefresh() {
    if (Feeds.refreshing) { Toast.show("正在抓取中…"); return; }
    this.refresh(true);
  },

  restartTimer() {
    if (this.timer) clearInterval(this.timer);
    if (!Settings.get("autoRefresh")) return;
    const mins = Settings.get("refreshMins") || 5;
    this.timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;  // 仅前台刷新
      this.refresh(false);
    }, mins * 60e3);
  }
};

document.addEventListener("DOMContentLoaded", () => App.boot());
