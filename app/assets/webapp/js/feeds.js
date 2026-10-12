/* ═════════════ feeds.js — 聚合引擎：抓取/解析/去重/评分 ═════════════ */
"use strict";

const Feeds = {
  sources: [],
  items: [],
  state: {},        // sourceId -> {ok, msg, count, ms}
  hfTrending: [],   // HF 热门模型（供模型库页用）
  lastUpdate: 0,
  refreshing: false,
  prevScores: Store.get("prevScores", {}),   // id -> {score, ts} 用于"上升最快"
  matchedSubs: Store.get("matchedSubs", {}), // 关键词订阅命中

  async loadRegistry() {
    try {
      const r = await fetch("data/sources.json");
      const j = await r.json();
      this.sources = j.sources || [];
    } catch (e) {
      this.sources = [];
    }
    return this.sources;
  },

  enabledSources() {
    const dis = Settings.get("disabledSources") || [];
    return this.sources.filter(s => s.type !== "hftrending" && !dis.includes(s.id));
  },

  loadCache() {
    const c = Store.get("newsCache", null);
    if (c && c.items && c.items.length) {
      this.items = c.items;
      this.lastUpdate = c.ts;
      this.state = c.state || {};
      this.hfTrending = c.hf || [];
      return true;
    }
    // 无缓存：加载离线引导数据（联网抓取成功后自动清除）
    try {
      const seedReq = new XMLHttpRequest();
      seedReq.open("GET", "data/seed_news.json", false);
      seedReq.send();
      const seeds = JSON.parse(seedReq.responseText);
      this.items = (seeds.items || []).map(it => Object.assign({ score: { total: 20, fresh: 0, eng: 0, src: 8, boost: 1 } }, it));
    } catch (e) { this.items = []; }
    return false;
  },

  saveCache() {
    const cutoff = Date.now() - 30 * 86400e3;
    // 剥离翻译等运行时私有字段，避免缓存膨胀（译文单独存于 trCache）
    const items = this.items.filter(i => i.ts >= cutoff).map(i => {
      const c = Object.assign({}, i);
      delete c._zh; delete c._zhBody; delete c._zhPending; delete c._zhBodyP; delete c._showZh;
      return c;
    }).slice(0, 900);
    try {
      Store.set("newsCache", { ts: this.lastUpdate, items, state: this.state, hf: this.hfTrending.slice(0, 40) });
    } catch (e) {
      Store.set("newsCache", { ts: this.lastUpdate, items: items.slice(0, 400), state: this.state, hf: [] });
    }
  },

  /** 并发刷新全部数据源，onProgress(done,total,name) */
  async refresh(onProgress) {
    if (this.refreshing) return;
    this.refreshing = true;
    const t0 = Date.now();
    const list = this.enabledSources();
    let done = 0;
    const jobs = list.map(src => (async () => {
      const t1 = Date.now();
      try {
        const got = await this.fetchSource(src);
        this.state[src.id] = { ok: true, count: got, ms: Date.now() - t1, ts: Date.now() };
      } catch (e) {
        this.state[src.id] = { ok: false, msg: String(e.message || e).slice(0, 60), ms: Date.now() - t1, ts: Date.now() };
      }
      done++;
      if (onProgress) onProgress(done, list.length, src.name);
    })());
    await Promise.all(jobs);
    // 真实数据到达后清除引导条目
    const realCount = this.items.filter(i => !i.seed).length;
    if (realCount > 10) this.items = this.items.filter(i => !i.seed);
    this.dedupe();
    this.items.forEach(it => { it.score = Score.compute(it); });
    this.recordPrev();
    this.checkSubs();
    this.lastUpdate = Date.now();
    this.saveCache();
    this.refreshing = false;
    return { items: this.items.length, ms: Date.now() - t0 };
  },

  recordPrev() {
    // 每小时记录一次分数快照（供上升最快）
    const now = Date.now();
    const last = Store.get("prevScoresTs", 0);
    if (now - last > 3600e3) {
      const snap = {};
      this.items.slice(0, 120).forEach(it => { snap[it.id] = { score: Math.round(it.score.total), ts: now }; });
      this.prevScores = Object.assign(this.prevScores, snap);
      const keys = Object.keys(this.prevScores);
      if (keys.length > 600) keys.slice(0, keys.length - 600).forEach(k => delete this.prevScores[k]);
      Store.set("prevScores", this.prevScores);
      Store.set("prevScoresTs", now);
    }
  },

  checkSubs() {
    const subs = Store.get("subs", []);
    if (!subs.length) { this.matchedSubs = {}; Store.set("matchedSubs", {}); return; }
    const seen = Store.get("seenSubIds", {});
    const matched = Store.get("matchedSubs", {});
    let changed = false;
    for (const it of this.items) {
      const text = (it.title + " " + it.summary).toLowerCase();
      for (const kw of subs) {
        if (text.includes(kw.toLowerCase()) && !seen[it.id + "|" + kw]) {
          seen[it.id + "|" + kw] = 1;
          (matched[kw] = matched[kw] || []).push({ id: it.id, title: it.title, url: it.url, ts: it.ts });
          changed = true;
        }
      }
    }
    if (changed) {
      Object.keys(matched).forEach(k => { matched[k] = matched[k].slice(-30); });
      this.matchedSubs = matched;
      Store.set("matchedSubs", matched);
      Store.set("seenSubIds", seen);
    }
  },

  /* ---------- 单源抓取 ---------- */
  async fetchSource(src) {
    if (src.type === "rss" || src.type === "atom") {
      const xml = await Bridge.fetchText(src.url, 18000);
      const items = this.parseFeedXML(xml, src);
      this.merge(items, src);
      return items.length;
    }
    if (src.type === "hn") return await this.fetchHN(src);
    if (src.type === "hfpapers") return await this.fetchHFPapers(src);
    if (src.type === "arxiv") return await this.fetchArxiv(src);
    if (src.type === "reddit") return await this.fetchReddit(src);
    if (src.type === "hftrending") return await this.fetchHFTrending();
    throw new Error("unknown type");
  },

  async fetchHN(src) {
    const queries = [
      "https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=60",
      "https://hn.algolia.com/api/v1/search_by_date?query=LLM&tags=story&hitsPerPage=40",
      "https://hn.algolia.com/api/v1/search_by_date?query=OpenAI&tags=story&hitsPerPage=30",
      "https://hn.algolia.com/api/v1/search_by_date?query=Claude&tags=story&hitsPerPage=30"
    ];
    const aiRe = /ai\b|a\.i\.|llm|gpt|claude|gemini|openai|anthropic|deepseek|qwen|llama|machine learning|neural|transformer|chatbot|agent|model weights/i;
    const map = {};
    for (const q of queries) {
      try {
        const j = await Bridge.fetchJSON(q, 12000);
        (j.hits || []).forEach(h => {
          if (!h.title) return;
          if (q.includes("front_page") && !aiRe.test(h.title + " " + (h.url || ""))) return;
          map[h.objectID] = h;
        });
      } catch (e) { /* 单查询失败不影响整源 */ }
    }
    const items = Object.values(map).map(h => this.normalize({
      title: h.title,
      url: h.url || ("https://news.ycombinator.com/item?id=" + h.objectID),
      summary: this.decodeEntities((h.story_text || "").replace(/<[^>]+>/g, " ")).slice(0, 220) || "Hacker News 讨论",
      ts: new Date(h.created_at || Date.now()).getTime(),
      points: h.points || 0,
      comments: h.num_comments || 0,
      discuss: "https://news.ycombinator.com/item?id=" + h.objectID
    }, src));
    this.merge(items, src);
    return items.length;
  },

  async fetchHFPapers(src) {
    const j = await Bridge.fetchJSON("https://huggingface.co/api/daily-papers", 12000);
    const items = (Array.isArray(j) ? j : []).slice(0, 30).map(p => this.normalize({
      title: (p.paper && p.paper.title) || p.title || "无题论文",
      url: "https://huggingface.co/papers/" + (p.paper && (p.paper.id || p.paper.arxiv_id) || p.paper_id),
      summary: "🔥 " + (p.paper && p.paper.upvotes || 0) + " 次推荐 · " + ((p.paper && p.paper.summary) || "今日 AI 热门论文").slice(0, 160),
      ts: new Date((p.paper && p.paper.publishedAt) || p.published_at || Date.now()).getTime(),
      points: (p.paper && p.paper.upvotes) || 0,
      comments: 0
    }, src));
    this.merge(items, src);
    return items.length;
  },

  async fetchArxiv(src) {
    const xml = await Bridge.fetchText("https://export.arxiv.org/api/query?search_query=cat:cs.AI+OR+cat:cs.CL&sortBy=submittedDate&sortOrder=descending&max_results=25", 18000);
    const doc = new DOMParser().parseFromString(xml, "text/xml");
    const items = Array.from(doc.getElementsByTagName("entry")).map(en => {
      const g = t => { const n = en.getElementsByTagName(t)[0]; return n ? n.textContent : ""; };
      const linkEl = Array.from(en.getElementsByTagName("link")).find(l => l.getAttribute("type") === "text/html") || en.getElementsByTagName("link")[0];
      return this.normalize({
        title: g("title").replace(/\s+/g, " ").trim(),
        url: linkEl ? linkEl.getAttribute("href") : g("id"),
        summary: g("summary").replace(/\s+/g, " ").trim().slice(0, 220),
        ts: new Date(g("updated") || g("published") || Date.now()).getTime(),
        points: 0, comments: 0
      }, src);
    });
    this.merge(items, src);
    return items.length;
  },

  async fetchReddit(src) {
    const j = await Bridge.fetchJSON(src.url, 12000);
    const items = (j.data && j.data.children || []).map(c => {
      const d = c.data || {};
      return this.normalize({
        title: d.title,
        url: d.url && /^https?:/.test(d.url) && !d.url.includes("reddit.com") ? d.url : "https://www.reddit.com" + d.permalink,
        summary: "r/" + src.name.replace(/^r\//, "") + " 社区讨论",
        ts: d.created_utc ? d.created_utc * 1000 : Date.now(),
        points: d.score || 0,
        comments: d.num_comments || 0,
        discuss: "https://www.reddit.com" + (d.permalink || "")
      }, src);
    });
    this.merge(items, src);
    return items.length;
  },

  async fetchHFTrending() {
    const j = await Bridge.fetchJSON("https://huggingface.co/api/models?sort=trendingScore&direction=-1&limit=40", 12000);
    this.hfTrending = (Array.isArray(j) ? j : []).map(m => ({
      id: m.id || m.modelId,
      likes: m.likes || 0,
      downloads: m.downloads || 0,
      trending: m.trendingScore || 0,
      pipeline: m.pipeline_tag || "",
      ts: m.createdAt || 0
    }));
    return this.hfTrending.length;
  },

  /* ---------- RSS / Atom 解析 ---------- */
  parseFeedXML(xml, src) {
    const doc = new DOMParser().parseFromString(xml, "text/xml");
    if (doc.getElementsByTagName("parsererror").length) {
      doc = new DOMParser().parseFromString(xml, "text/html");
    }
    const out = [];
    // RSS item
    let nodes = Array.from(doc.getElementsByTagName("item"));
    if (!nodes.length) nodes = Array.from(doc.getElementsByTagName("entry")); // Atom
    for (const n of nodes.slice(0, 40)) {
      const g = t => { const m = n.getElementsByTagName(t)[0]; return m ? m.textContent.trim() : ""; };
      let link = g("link");
      if (!link) {
        const l = Array.from(n.getElementsByTagName("link")).find(x => x.getAttribute && (x.getAttribute("rel") === "alternate" || !x.getAttribute("rel")));
        if (l) link = l.getAttribute("href") || "";
      }
      if (!link) link = g("guid");
      const title = g("title").replace(/\s+/g, " ");
      if (!title || !/^https?:\/\//.test(link)) continue;
      let desc = g("description") || g("summary") || g("content");
      desc = this.decodeEntities(desc.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
      let ts = Date.now();
      const dRaw = g("pubDate") || g("published") || g("updated") || g("dc:date");
      const dp = Date.parse(dRaw);
      if (!isNaN(dp)) ts = dp;
      out.push(this.normalize({
        title, url: link, summary: desc.slice(0, 240), ts, points: 0, comments: 0
      }, src));
    }
    return out;
  },

  /* ---------- HTML 实体解码 ---------- */
  decodeEntities(s) {
    return String(s || "")
      .replace(/&(?:x([0-9a-f]+)|#(\d+));/gi, (_, hex, dec) => String.fromCharCode(parseInt(hex || dec, hex ? 16 : 10)))
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  },

  /* ---------- 归一化 / 分类 ---------- */
  normalize(raw, src) {
    const item = {
      id: "n_" + hashStr(raw.url),
      title: this.decodeEntities(raw.title).replace(/\s+/g, " ").slice(0, 200),
      summary: this.decodeEntities(raw.summary || "").slice(0, 260),
      url: raw.url,
      source: src.name,
      sourceId: src.id,
      lang: src.lang,
      weight: src.weight,
      ts: Math.min(raw.ts || Date.now(), Date.now()),
      points: raw.points || 0,
      comments: raw.comments || 0,
      discuss: raw.discuss || "",
      fetchedAt: Date.now()
    };
    item.cat = Classifier.guess(item.title, item.summary, src);
    return item;
  },

  merge(items, src) {
    const map = {};
    for (const it of this.items) map[it.id] = it;
    for (const it of items) {
      const old = map[it.id];
      if (old) {
        // 已存在：更新互动数据与热度
        old.points = Math.max(old.points, it.points);
        old.comments = Math.max(old.comments, it.comments);
        old.ts = Math.min(old.ts, it.ts);
      } else {
        map[it.id] = it;
      }
    }
    this.items = Object.values(map);
  },

  dedupe() {
    // 标题级去重（不同源转发同一新闻）
    const seen = {};
    const out = [];
    const sorted = this.items.slice().sort((a, b) => b.ts - a.ts);
    for (const it of sorted) {
      const key = Classifier.titleKey(it.title);
      if (seen[key]) {
        // 合并互动数到保留项
        const keep = seen[key];
        keep.points = Math.max(keep.points, it.points);
        keep.comments = Math.max(keep.comments, it.comments);
        continue;
      }
      seen[key] = it;
      out.push(it);
    }
    this.items = out.sort((a, b) => b.ts - a.ts);
  }
};

/* ═════════════ 分类器 ═════════════ */
const Classifier = {
  rules: [
    ["fund", /融资|完成.*轮|估值|亿美元|斥资|收购|并购|IPO|投资|raises?|funding|valuation|acquisit|billion|million|VC |seed round|Series [A-E]/i],
    ["policy", /监管|法案|合规|备案|政策|禁令|起诉|诉讼|版权|侵权|隐私|数据安全|regulat|lawsuit|ban ned|bans?\b|privacy|copyright|antitrust|AI Act|治理/i],
    ["chip", /芯片|算力|显卡|GPU|NPU|TPU|英伟达|Nvidia|AMD|台积电|TSMC|数据中心|晶圆|H100|B200|GB300|CUDA|制程|wafer|datacenter|silicon|semiconductor/i],
    ["safety", /安全|对齐|越狱|幻觉|深度伪造|滥用|风险|alignment|safety|jailbreak|hallucinat|deepfake|misuse|interpretab|可解释|监督/i],
    ["oss", /开源|开放权重|open.?source|open.?weight|权重|Apache|MIT 许可|Hugging ?Face|Ollama|llama\.cpp|vLLM|GGUF|量化|quantiz|LoRA|微调|fine-?tun|ComfyUI|Stable Diffusion/i],
    ["paper", /论文|研究|arXiv|发表|benchmark|基准|SOTA|评测|paper|research|state-of-the-art|study find|实验/i],
    ["model", /模型|大模型|GPT-?\d|ChatGPT|o\d|Claude|Gemini|Llama|Qwen|通义|千问|文心|ERNIE|GLM|智谱|Kimi|月之暗面|DeepSeek|深度求索|Mistral|Grok|xAI|豆包|Doubao|MiniMax|海螺|混元|Hunyuan|Nova|LLM|大语言模型|多模态|multimodal|frontier|inference|推理模型|reasoning|旗舰/i],
    ["product", /发布|上线|推出|更新|功能|应用|助手|智能体|机器人| copilot|agent|chatbot|app|launch|release|update|integrat|工具|平台|Sora|视频生成|文生图|image gen/i],
    ["opinion", /观点|为什么|评论|分析|解读|洞察|预测|访谈|观点|opinion|analysis|essay|why |how |the future|预测|趋势/i]
  ],
  guess(title, summary, src) {
    const text = title + " " + (summary || "");
    for (const [cat, re] of this.rules) {
      if (re.test(title)) return cat;
    }
    for (const [cat, re] of this.rules) {
      if (re.test(text)) return cat;
    }
    return (src.cats && src.cats[0]) || "product";
  },
  titleKey(title) {
    return title.toLowerCase()
      .replace(/[\s\|\-—·:：,，。！!?？'"'"]+/g, "")
      .replace(/\d{4,}/g, "#")
      .slice(0, 46);
  }
};

/* ═════════════ 热度评分 ═════════════ */
const Score = {
  hotTerms: [
    "gpt-6", "gpt-5.6", "gpt-5", "claude", "opus", "sonnet", "gemini", "argon",
    "grok", "llama", "muse", "qwen", "通义", "glm", "智谱", "kimi", "deepseek",
    "openai", "anthropic", "ollama", "开源", "免费", "降价", "融资", "估值",
    "突破", "sota", "agent", "智能体", "机器人", "robot", "芯片", "gpu",
    "发布", "首发", "实测", "benchmark", "deep research", "多模态"
  ],

  compute(it) {
    const ageH = Math.max(0, (Date.now() - it.ts) / 3600e3);
    // 新鲜度：48 小时半衰
    const fresh = 40 * Math.exp(-ageH / 42);
    // 互动度（HN/Reddit/HF 有真实数据；RSS 用中性基准）
    let eng;
    if (it.points || it.comments) {
      eng = Math.log10(1 + it.points) * 13 + Math.log10(1 + it.comments) * 8;
      eng = Math.min(eng, 26);
    } else {
      eng = 7;
    }
    // 源权重
    const srcW = (it.weight || 1) * 9;
    // 话题热度加成
    const text = it.title.toLowerCase();
    let hits = 0;
    for (const t of this.hotTerms) if (text.includes(t)) hits++;
    const boost = 1 + Math.min(hits * 0.06, 0.3);
    const total = Math.min(100, (fresh + eng + srcW) * boost);
    return {
      total: Math.round(total),
      fresh: Math.round(fresh),
      eng: Math.round(eng),
      src: Math.round(srcW),
      boost: boost.toFixed(2)
    };
  }
};

/* ═════════════ 热词 ═════════════ */
const HotWords = {
  dict: [
    "GPT-6", "GPT-5.6", "ChatGPT", "OpenAI", "Claude", "Anthropic", "Opus", "Sonnet",
    "Gemini", "Google", "DeepMind", "Grok", "xAI", "Llama", "Meta", "Qwen", "通义千问",
    "阿里", "GLM", "智谱", "Kimi", "月之暗面", "DeepSeek", "MiniMax", "腾讯混元",
    "字节", "豆包", "百度", "文心", "Mistral", "Nvidia", "英伟达", "GPU", "算力",
    "开源", "免费", "降价", "涨价", "融资", "估值", "IPO", "收购", "发布", "上线",
    "突破", "SOTA", "Benchmark", "Agent", "智能体", "机器人", "人形机器人", "自动驾驶",
    "多模态", "视频生成", "文生图", "语音", "编程", "Copilot", "Cursor", "Ollama",
    "Hugging Face", "监管", "AI法案", "安全", "对齐", "幻觉", "上下文", "推理模型",
    "Deep Research", "AGI", "Scaling", "蒸馏", "量化", "微调", "RAG", "MCP"
  ],
  extract(items, days) {
    const cutoff = Date.now() - (days || 2) * 86400e3;
    const freq = {};
    for (const it of items) {
      if (it.ts < cutoff) continue;
      for (const w of this.dict) {
        if (it.title.includes(w) || it.title.toLowerCase().includes(w.toLowerCase())) {
          const k = w;
          freq[k] = (freq[k] || 0) + Math.max(1, Math.round(it.score ? it.score.total / 22 : 1));
        }
      }
    }
    return Object.entries(freq)
      .map(([word, n]) => ({ word, n }))
      .sort((a, b) => b.n - a.n);
  }
};
