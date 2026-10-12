/* ═════════════ views_models.js — 模型库 ═════════════ */
"use strict";

const ModelDB = {
  data: { models: [], note: "" },
  loaded: false,
  async load() {
    if (this.loaded) return;
    try {
      const r = await fetch("data/models.json");
      this.data = await r.json();
      this.loaded = true;
    } catch (e) { }
  },
  all() { return this.data.models || []; },
  search(q) {
    q = q.toLowerCase();
    return this.all().filter(m =>
      m.name.toLowerCase().includes(q) || m.org.toLowerCase().includes(q) ||
      (m.tags || []).some(t => t.includes(q)));
  },
  byId(id) { return this.all().find(m => m.id === id); },
  byArenaName(name) {
    const n = name.toLowerCase();
    return this.all().find(m =>
      n.includes(m.id.toLowerCase()) || m.id.toLowerCase().includes(n.split(" ")[0]) ||
      n.includes(m.name.toLowerCase().split(" ")[0].toLowerCase()) && m.name.toLowerCase().split(" ")[0].length > 3);
  }
};

const ModelsView = {
  filter: "all",
  compareSel: [],
  chips: [
    { id: "all", name: "全部" },
    { id: "open", name: "开源" },
    { id: "closed", name: "闭源" },
    { id: "local", name: "可本地部署" },
    { id: "cn", name: "国产" },
    { id: "multimodal", name: "多模态" },
    { id: "reason", name: "推理" }
  ],

  async init() {
    await ModelDB.load();
    const chips = $("#modelChips");
    chips.innerHTML = this.chips.map(c =>
      `<button class="chip${c.id === this.filter ? " active" : ""}" data-mf="${c.id}">${c.name}</button>`).join("");
    chips.onclick = e => {
      const b = e.target.closest("[data-mf]");
      if (!b) return;
      this.filter = b.dataset.mf;
      $$(".chip", chips).forEach(c => c.classList.toggle("active", c.dataset.mf === this.filter));
      this.renderGrid();
    };
    this.renderGrid();
    this.bindGrid($("#modelGrid"));
  },

  filtered() {
    const arr = ModelDB.all();
    const f = this.filter;
    if (f === "all") return arr;
    if (f === "open") return arr.filter(m => m.open);
    if (f === "closed") return arr.filter(m => !m.open);
    if (f === "local") return arr.filter(m => m.local);
    if (f === "cn") return arr.filter(m => (m.tags || []).includes("国产"));
    if (f === "multimodal") return arr.filter(m => (m.tags || []).includes("多模态"));
    if (f === "reason") return arr.filter(m => (m.tags || []).includes("推理"));
    return arr;
  },

  renderGrid() {
    const arr = this.filtered();
    $("#modelGrid").innerHTML = arr.map(m => this.cardHTML(m)).join("") ||
      `<div class="empty" style="grid-column:1/-1"><div class="empty-icon">📦</div><div class="empty-title">没有匹配的模型</div></div>`;
    this.updateCompareBar();
  },

  bindGrid(root) {
    root.addEventListener("click", e => {
      const card = e.target.closest("[data-mid]");
      if (!card) return;
      const id = card.dataset.mid;
      if (e.target.closest(".model-compare-cb")) {
        this.toggleCompare(id);
        return;
      }
      this.openDetail(id);
    });
  },

  cardHTML(m) {
    const on = this.compareSel.includes(m.id);
    const arena = m.arenaRank ? `Arena #${m.arenaRank}` : "";
    const price = m.api && m.api.priceIn != null && m.api.priceIn > 0 ? `$${m.api.priceIn}/$${m.api.priceOut}` : (m.open ? "免费自托管" : "订阅制");
    return `
    <div class="model-card" data-mid="${m.id}">
      <div class="model-compare-cb${on ? " on" : ""}">✓</div>
      <div class="model-org">${esc(m.org)}${arena ? ` · <span style="color:var(--accent)">${arena}</span>` : ""}</div>
      <div class="model-name">${esc(m.name)}</div>
      <div class="model-desc">${esc(m.desc)}</div>
      <div class="model-meta">
        <span class="mtag ${m.open ? "g" : ""}">${m.open ? "🔓 开源" : "🔒 闭源"}</span>
        <span class="mtag">${m.ctx} ctx</span>
        <span class="mtag b">${price}</span>
        ${(m.tags || []).slice(0, 2).filter(t => t !== "闭源" && t !== "开源").map(t => `<span class="mtag">${t}</span>`).join("")}
      </div>
    </div>`;
  },

  toggleCompare(id) {
    const i = this.compareSel.indexOf(id);
    if (i >= 0) this.compareSel.splice(i, 1);
    else {
      if (this.compareSel.length >= 3) { Toast.show("最多对比 3 个模型"); return; }
      this.compareSel.push(id);
    }
    this.renderGrid();
  },

  updateCompareBar() {
    let bar = $("#compareBar");
    if (!bar) {
      bar = el("div", "compare-bar hidden");
      bar.id = "compareBar";
      bar.innerHTML = `<div class="cb-names"></div><button class="clr">清空</button><button class="go">开始对比</button>`;
      bar.querySelector(".clr").onclick = () => { this.compareSel = []; this.renderGrid(); };
      bar.querySelector(".go").onclick = () => this.showCompare();
      $("#app").appendChild(bar);
    }
    const names = this.compareSel.map(id => ModelDB.byId(id) ? ModelDB.byId(id).name : "");
    bar.querySelector(".cb-names").textContent = names.join(" vs ");
    bar.classList.toggle("hidden", this.compareSel.length < 2);
  },

  showCompare() {
    const ms = this.compareSel.map(id => ModelDB.byId(id)).filter(Boolean);
    if (ms.length < 2) return;
    const rows = [
      ["厂商", m => m.org],
      ["开源", m => m.open ? "🔓 " + m.license : "🔒 闭源"],
      ["参数", m => m.params || "–"],
      ["上下文", m => m.ctx],
      ["Arena 排名", m => m.arenaRank ? "#" + m.arenaRank + "（ELO " + m.arenaElo + "）" : "–"],
      ["API 价格 $/M", m => m.api && m.api.priceIn > 0 ? `$${m.api.priceIn} / $${m.api.priceOut}` : (m.api ? m.api.official : "–")],
      ["标签", m => (m.tags || []).join("、")]
    ];
    Sheet.open(`
      <div style="font-weight:800;font-size:16px;margin-bottom:12px">⚖️ 模型对比（${ms.length} 个）</div>
      <div class="price-table-wrap"><div class="price-scroll"><table class="price-table">
        <tr><th>维度</th>${ms.map(m => `<th>${esc(m.name)}</th>`).join("")}</tr>
        ${rows.map(([label, fn]) => `<tr><td class="pt-muted">${label}</td>${ms.map(m => `<td class="pt-model" style="font-size:11.5px;white-space:normal">${fn(m)}</td>`).join("")}</tr>`).join("")}
      </table></div></div>
      <div class="note-box">${esc(ModelDB.data.note || "")}</div>
    `);
  },

  openDetail(id) {
    const m = ModelDB.byId(id);
    if (!m) return;
    const tabs = ["概览", "在线体验", "API 接入", "本地部署"];
    let cur = "概览";
    const renderTab = t => {
      const b = $("#mdBody");
      if (t === "概览") b.innerHTML = this.tabOverview(m);
      else if (t === "在线体验") b.innerHTML = this.tabPlay(m);
      else if (t === "API 接入") b.innerHTML = this.tabAPI(m);
      else b.innerHTML = this.tabLocal(m);
    };
    Sheet.open(`
      <div class="model-detail">
        <div class="md-head">
          <div class="md-logo">${esc(m.org.slice(0, 1))}</div>
          <div class="md-titles">
            <div class="md-name">${esc(m.name)}</div>
            <div class="md-org">${esc(m.org)} · ${m.open ? "🔓 " + m.license : "🔒 闭源"} ${m.arenaRank ? "· Arena #" + m.arenaRank : ""}</div>
          </div>
        </div>
        <div class="md-stats">
          <div class="md-stat"><div class="v" style="color:var(--accent)">${m.arenaElo || "–"}</div><div class="k">Arena ELO</div></div>
          <div class="md-stat"><div class="v">${m.arenaRank ? "#" + m.arenaRank : "–"}</div><div class="k">总榜排名</div></div>
          <div class="md-stat"><div class="v">${m.ctx}</div><div class="k">上下文</div></div>
          <div class="md-stat"><div class="v" style="font-size:12px">${m.api && m.api.priceIn ? `$${m.api.priceIn}/$${m.api.priceOut}` : (m.open ? "免费" : "订阅")}</div><div class="k">价格 $/M</div></div>
        </div>
        <div class="md-tabs">${tabs.map((t, i) => `<button class="md-tab${i === 0 ? " active" : ""}" data-t="${t}">${t}</button>`).join("")}</div>
        <div id="mdBody"></div>
      </div>
    `, () => {
      renderTab("概览");
      $("#sheetBody").querySelector(".md-tabs").addEventListener("click", e => {
        const b2 = e.target.closest("[data-t]");
        if (!b2) return;
        $$("#sheetBody .md-tab").forEach(x => x.classList.toggle("active", x === b2));
        renderTab(b2.dataset.t);
      });
    });
  },

  tabOverview(m) {
    return `
      <p style="font-size:13.5px;line-height:1.8">${esc(m.desc)}</p>
      <div class="badge-row">${(m.tags || []).map(t => `<span class="mtag">${t}</span>`).join("")}</div>
      <div class="kv-grid">
        <div class="kv"><div class="k">参数规模</div><div class="v">${esc(m.params)}</div></div>
        <div class="kv"><div class="k">许可证</div><div class="v">${esc(m.license)}</div></div>
        <div class="kv"><div class="k">发布时间</div><div class="v">${esc(m.release || "–")}</div></div>
        <div class="kv"><div class="k">上下文窗口</div><div class="v">${esc(m.ctx)}</div></div>
      </div>
      <button class="load-more" style="margin-top:10px" onclick="Sheet.close();SearchView.open('news','${esc(m.name.split(" ")[0])}')">🔍 搜该模型相关资讯</button>`;
  },

  tabPlay(m) {
    const plays = m.play || [{ name: "Arena 免费盲测", url: "https://arena.ai", note: "与各大模型对战" }];
    return `
      <div class="note-box">以下入口可直接在线体验该模型（部分需注册/订阅）</div>
      <div class="linklist">
        ${plays.map(p => `
          <div class="linkrow" onclick="Bridge.openUrl('${p.url}')">
            <div class="li-icon">💬</div>
            <div style="flex:1;min-width:0"><div class="li-t">${esc(p.name)}</div><div class="li-d">${esc(p.note || p.url)}</div></div>
            <div class="li-arrow">›</div>
          </div>`).join("")}
        <div class="linkrow" onclick="Bridge.openUrl('https://arena.ai')">
          <div class="li-icon">⚔️</div>
          <div style="flex:1"><div class="li-t">Arena 盲测对战</div><div class="li-d">免费 · 匿名对比两个模型</div></div>
          <div class="li-arrow">›</div>
        </div>
      </div>`;
  },

  tabAPI(m) {
    const a = m.api || {};
    const priceLine = a.priceIn > 0 ? `输入 $${a.priceIn} / 输出 $${a.priceOut} 每百万 tokens`
      : (a.priceIn === 0 ? "开源模型 · 自托管免费，第三方托管平台价格各异" : "订阅制 · 不单独提供 API");
    const modelKey = m.id;
    return `
      <div class="kv-grid">
        <div class="kv"><div class="k">官方渠道</div><div class="v">${esc(a.official || "–")}</div></div>
        <div class="kv"><div class="k">价格</div><div class="v" style="font-size:12px">${priceLine}</div></div>
      </div>
      ${(a.also && a.also.length) ? `<div class="badge-row" style="margin-top:8px"><span class="pt-muted" style="font-size:11px;color:var(--faint)">同时可用：</span>${a.also.map(x => `<span class="mtag b">${esc(x)}</span>`).join("")}</div>` : ""}
      ${a.site ? `<button class="load-more" style="margin-top:8px" onclick="Bridge.openUrl('${a.site}')">打开官方定价/文档页 ↗</button>` : ""}
      <h4 style="color:var(--accent);font-size:13px;margin:14px 0 4px">调用示例（OpenAI 兼容格式）</h4>
      <div class="codeblock"><button class="copy" onclick="Bridge.copy(this.nextElementSibling.textContent)">复制</button><code>curl \${BASE_URL}/chat/completions \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${modelKey}",
    "messages": [{"role":"user","content":"你好"}]
  }'</code></div>
      <div class="codeblock"><button class="copy" onclick="Bridge.copy(this.nextElementSibling.textContent)">复制</button><code>from openai import OpenAI

client = OpenAI(base_url=BASE_URL, api_key=KEY)
resp = client.chat.completions.create(
    model="${modelKey}",
    messages=[{"role": "user", "content": "你好"}]
)
print(resp.choices[0].message.content)</code></div>
      <div class="note-box">提示：密钥请存放于环境变量，切勿写入代码仓库。各平台 BASE_URL 与模型 ID 以官方文档为准。</div>`;
  },

  tabLocal(m) {
    if (!m.local && !m.open) {
      return `<div class="note-box">🔒 该模型为闭源模型，无法本地部署。可在「部署指南」查看同类开源模型的本地部署方案。</div>
        <button class="load-more" onclick="Sheet.close();Router.go('deploy')">查看本地部署指南</button>`;
    }
    const l = m.local || {};
    const ollamaCmd = l.ollama ? `ollama run ${l.ollama}` : "";
    const hfUrl = l.hf && l.hf.includes("/") ? "https://huggingface.co/" + l.hf : (l.hf ? "https://huggingface.co/" + l.hf : "");
    return `
      <div class="kv-grid">
        <div class="kv"><div class="k">HuggingFace</div><div class="v">${l.hf ? esc(l.hf) : "搜索 " + esc(m.name)}</div></div>
        <div class="kv"><div class="k">推荐工具</div><div class="v">Ollama / LM Studio</div></div>
      </div>
      ${hfUrl ? `<div class="linkrow" style="margin-top:8px" onclick="Bridge.openUrl('${hfUrl}')"><div class="li-icon">🤗</div><div style="flex:1"><div class="li-t">HuggingFace 模型页</div><div class="li-d">下载原始权重 / GGUF</div></div><div class="li-arrow">›</div></div>` : ""}
      <div class="linkrow" style="margin-top:8px" onclick="Bridge.openUrl('https://ollama.com/search?q=${encodeURIComponent(m.name.split(" ")[0])}')">
        <div class="li-icon">🦙</div><div style="flex:1"><div class="li-t">Ollama 库搜索</div><div class="li-d">一键 ollama run 拉取运行</div></div><div class="li-arrow">›</div>
      </div>
      ${ollamaCmd ? `
        <h4 style="color:var(--accent);font-size:13px;margin:12px 0 4px">Ollama 一行命令</h4>
        <div class="codeblock"><button class="copy" onclick="Bridge.copy(this.nextElementSibling.textContent)">复制</button><code># 安装 ollama 后执行（自动下载模型）
${ollamaCmd}</code></div>` : ""}
      <h4 style="color:var(--accent);font-size:13px;margin:12px 0 4px">显存需求速查（最大尺寸估算）</h4>
      <table class="vram-table">
        <tr><th>精度/量化</th><th>每参数比特</th><th>估算需求</th></tr>
        <tr><td>FP16 原始</td><td>16 bit</td><td>${VramCalc.estimateText(m.params, 16)}</td></tr>
        <tr><td>Q8 量化</td><td>~8.5 bit</td><td>${VramCalc.estimateText(m.params, 8.5)}</td></tr>
        <tr><td>Q4_K_M</td><td>~4.8 bit</td><td>${VramCalc.estimateText(m.params, 4.8)}</td></tr>
      </table>
      ${l.vramNote ? `<div class="note-box">📌 ${esc(l.vramNote)}</div>` : ""}
      <button class="load-more" onclick="Sheet.close();Router.go('deploy')">📖 完整部署教程（Ollama/LM Studio/vLLM）</button>`;
  }
};

/* ---------- 显存计算器 ---------- */
const VramCalc = {
  parseParams(str) {
    if (!str) return null;
    const m = String(str).match(/([\d.]+)\s*(T|B)/i);
    if (!m) return null;
    const v = parseFloat(m[1]);
    return m[2].toUpperCase() === "T" ? v * 1000 : v;
  },
  estimateGB(paramsStr, bits) {
    const b = this.parseParams(paramsStr);
    if (!b) return null;
    return b * bits / 8 * 1.2; // 参数 + 20% 开销（KV缓存/激活）
  },
  fmtGB(g) {
    if (g == null) return "–";
    if (g >= 1024) return (g / 1024).toFixed(1) + " TB";
    return Math.round(g) + " GB";
  },
  estimateText(paramsStr, bits) {
    const g = this.estimateGB(paramsStr, bits);
    if (g == null) return "参数未公开";
    return this.fmtGB(g);
  },
  open() {
    Sheet.open(`
      <div style="font-weight:800;font-size:16px;margin-bottom:6px">🧮 显存 / 内存计算器</div>
      <div style="font-size:11.5px;color:var(--faint);margin-bottom:12px">估算本地运行大模型所需的显存（或统一内存）。公式：参数量 × 每参数比特 ÷ 8 × 1.2（含 KV 缓存与激活开销）</div>
      <div class="calc-box">
        <div class="calc-row"><label>参数量 (B)</label><input type="number" id="vcParams" value="32" min="0.5" step="0.5"></div>
        <div class="calc-row"><label>量化精度</label>
          <select id="vcBits">
            <option value="16">FP16 / BF16（16 bit）</option>
            <option value="8.5">Q8_0（~8.5 bit）</option>
            <option value="4.8" selected>Q4_K_M（~4.8 bit）· 推荐</option>
            <option value="4.2">IQ4_XS（~4.2 bit）</option>
            <option value="3.5">Q3_K_M（~3.5 bit）</option>
          </select>
        </div>
        <div class="calc-result">
          <div class="calc-big" id="vcResult">46 GB</div>
          <div class="calc-sub" id="vcHint"></div>
        </div>
      </div>
      <div class="note-box">💡 经验：MoE 模型按<b>总参数</b>占显存（所有专家都要装进显存），但推理速度取决于激活参数。长上下文会显著增加 KV 缓存占用；Mac 统一内存机型可用「内存换显存」。</div>
    `, () => {
      const calc = () => {
        const p = parseFloat($("#vcParams").value) || 0;
        const bits = parseFloat($("#vcBits").value);
        const gb = p * bits / 8 * 1.2;
        $("#vcResult").textContent = this.fmtGB(gb);
        let hint;
        if (gb <= 8) hint = "核显 / 8GB 显卡（RTX 3050/4060）可跑";
        else if (gb <= 12) hint = "RTX 3060 12G / 4070 12G / 16GB 内存 Mac";
        else if (gb <= 16) hint = "RTX 4080/4090 16G+ / 32GB 内存 Mac 流畅";
        else if (gb <= 24) hint = "RTX 3090/4090 24G / 48GB 内存 Mac";
        else if (gb <= 48) hint = "双卡 4090 / Mac 64GB+ / 云 GPU（A100 40G+）";
        else if (gb <= 96) hint = "RTX 6000Ada / Mac 128GB+ / 云 H100";
        else hint = "服务器集群 / Mac 192-512GB 统一内存";
        $("#vcHint").textContent = "参考硬件：" + hint;
      };
      $("#vcParams").oninput = calc;
      $("#vcBits").onchange = calc;
      calc();
    });
  }
};
