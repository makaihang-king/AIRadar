/* ═════════════ views_tools.js — 价格与套餐 / 部署指南 ═════════════ */
"use strict";

const PricingView = {
  data: null, tab: "api", cur: "CNY", fx: 7.15,

  async init() {
    if (!this.data) {
      try {
        const r = await fetch("data/pricing.json");
        this.data = await r.json();
      } catch (e) { this.data = { api: [], subs: [], agents: [], free: [] }; }
    }
    $("#priceSeg").onclick = e => {
      const b = e.target.closest("[data-ptab]");
      if (!b) return;
      this.tab = b.dataset.ptab;
      $$("#priceSeg .seg-btn").forEach(x => x.classList.toggle("active", x === b));
      this.render();
    };
    this.render();
  },

  money(usd) {
    if (usd == null) return "N/A";
    if (usd === 0) return "免费";
    if (this.cur === "CNY") {
      const v = usd * this.fx;
      return "¥" + (v >= 10 ? v.toFixed(0) : v.toFixed(2));
    }
    return "$" + (usd >= 10 ? usd.toFixed(0) : usd.toFixed(2));
  },

  render() {
    const body = $("#priceBody");
    if (this.tab === "api") body.innerHTML = this.tabApi();
    else if (this.tab === "sub") body.innerHTML = this.tabSubs();
    else if (this.tab === "agent") body.innerHTML = this.tabAgents();
    else body.innerHTML = this.tabCalc();
    this.bind();
  },

  tabApi() {
    const d = this.data;
    return `
      <div class="control-row">
        <div class="seg seg-sm" id="curSeg">
          <button class="seg-btn${this.cur === "CNY" ? " active" : ""}" data-cur="CNY">人民币 ¥</button>
          <button class="seg-btn${this.cur === "USD" ? " active" : ""}" data-cur="USD">美元 $</button>
        </div>
        <span style="font-size:11px;color:var(--faint)">汇率≈1:7.15 · ${esc(d.updated || "")} 更新</span>
      </div>
      ${d.api.map(p => `
        <div class="provider-block">
          <div class="provider-head">
            <div class="provider-logo" style="background:${p.color}">${esc(p.provider.slice(0, 1))}</div>
            <div class="provider-name">${esc(p.provider)}</div>
            <div class="provider-note">${esc(p.note || "")}</div>
          </div>
          <div class="price-table-wrap"><div class="price-scroll"><table class="price-table">
            <tr><th>模型</th><th>输入/M</th><th>输出/M</th><th>上下文</th><th>备注</th></tr>
            ${p.models.map(m => `
              <tr onclick="Bridge.openUrl('${p.site}')">
                <td class="pt-model">${esc(m.name)}</td>
                <td class="pt-num">${m.in == null ? "N/A" : this.money(m.in)}</td>
                <td class="pt-num">${m.out == null ? "N/A" : this.money(m.out)}</td>
                <td class="pt-muted">${esc(m.ctx)}</td>
                <td class="pt-muted">${esc(m.note || "")}</td>
              </tr>`).join("")}
          </table></div></div>
          <div style="font-size:10.5px;color:var(--faint);margin-top:4px">↗ 点击行打开 ${esc(p.provider)} 官方定价页 · ${esc(d.disclaimer || "")}</div>
        </div>`).join("")}
      <div class="section-title">🎁 免费 API 额度汇总</div>
      ${(d.free || []).map(f => `
        <div class="linkrow" style="margin-bottom:7px" onclick="Bridge.openUrl('${f.url}')">
          <div class="li-icon">🎁</div>
          <div style="flex:1"><div class="li-t">${esc(f.name)}</div><div class="li-d">${esc(f.what)}</div></div>
          <div class="li-arrow">›</div>
        </div>`).join("")}`;
  },

  tabSubs() {
    const d = this.data;
    return `
      <div class="note-box">💡 怎么选：日常聊天文桉/写代码 → $20 档（Plus / Claude Pro / AI Pro）任选其一；重度编程 Agent → Claude Max $100；要视频生成 + 2M 上下文 → Google AI Pro/Ultra。多家搭配不如先试用一家。</div>
      ${(d.subs || []).map(s => `
        <div class="plan-card">
          <div class="plan-head">
            <div class="plan-name">${esc(s.name)} ${s.hot ? '<span class="plan-tag">热门</span>' : ""}</div>
            <div class="plan-price">${esc(s.price)}</div>
          </div>
          <ul class="plan-feats">${s.feats.map(f => `<li>${esc(f)}</li>`).join("")}</ul>
          <button class="load-more" style="margin-top:10px" onclick="Bridge.openUrl('${s.url}')">前往官方页面 ↗</button>
        </div>`).join("")}`;
  },

  tabAgents() {
    const d = this.data;
    return `
      <div class="note-box">🤖 编程/工作流 Agent 已成为 2026 主流订阅入口：Claude Code、Codex、Copilot 三足鼎立，实际重度月开销普遍 $100-250；轻度使用 $20 档足够。</div>
      ${(d.agents || []).map(a => `
        <div class="plan-card">
          <div class="plan-head">
            <div class="plan-name">${esc(a.name)} ${a.hot ? '<span class="plan-tag">推荐</span>' : ""}</div>
            <div class="plan-price" style="font-size:13px">${esc(a.price)}</div>
          </div>
          <ul class="plan-feats">${a.feats.map(f => `<li>${esc(f)}</li>`).join("")}</ul>
          <button class="load-more" style="margin-top:10px" onclick="Bridge.openUrl('${a.url}')">前往官方页面 ↗</button>
        </div>`).join("")}`;
  },

  tabCalc() {
    return `
    <div class="calc-box">
      <div style="font-weight:800;font-size:14.5px;margin-bottom:10px">💰 API vs 订阅 成本计算器</div>
      <div class="calc-row"><label>每天对话次数</label><input type="number" id="ccTimes" value="20" min="1"></div>
      <div class="calc-row"><label>每次输入 tokens</label><input type="number" id="ccIn" value="2000" min="100" step="100"></div>
      <div class="calc-row"><label>每次输出 tokens</label><input type="number" id="ccOut" value="800" min="50" step="50"></div>
      <div class="calc-row"><label>模型</label>
        <select id="ccModel">
          <option value="0.05|0.4">GPT-5-nano（$0.05/$0.40）</option>
          <option value="0.25|2">GPT-5.2（$0.25/$2）</option>
          <option value="1.25|10" selected>GPT-5.6（$1.25/$10）</option>
          <option value="3|15">Claude Sonnet 5.5（$3/$15）</option>
          <option value="4|20">Claude Opus 5.5（$4/$20）</option>
          <option value="2|10">Gemini 4 Argon（$2/$10）</option>
          <option value="0.3|1.2">DeepSeek V4.1 Pro（$0.30/$1.2）</option>
          <option value="0.14|0.28">DeepSeek V4 Flash（$0.14/$0.28）</option>
          <option value="0.06|0.2">GLM-5.3-Flash（$0.06/$0.2）</option>
        </select>
      </div>
      <div class="calc-result">
        <div class="calc-big" id="ccResult">–</div>
        <div class="calc-sub" id="ccHint"></div>
      </div>
    </div>
    <div class="note-box">📌 结论参考：月成本 ≲ $20 → 买 $20 订阅（还送编程 Agent）；月成本 $20-100 → 混合策略（订阅 + 便宜模型处理长尾）；> $100 → 直接上 Max $100 档或优化缓存/批处理。Batch API 与缓存通常可省 30-90%。</div>`;
  },

  bind() {
    const curSeg = $("#curSeg");
    if (curSeg) curSeg.onclick = e => {
      const b = e.target.closest("[data-cur]");
      if (!b) return;
      this.cur = b.dataset.cur;
      $$("#curSeg .seg-btn").forEach(x => x.classList.toggle("active", x === b));
      $("#priceBody").innerHTML = this.tabApi();
      this.bind();
    };
    const calc = () => {
      const times = +$("#ccTimes").value || 0;
      const tin = +$("#ccIn").value || 0;
      const tout = +$("#ccOut").value || 0;
      const [pin, pout] = $("#ccModel").value.split("|").map(Number);
      const perDay = (tin * pin + tout * pout) / 1e6 * times;
      const perMonth = perDay * 30;
      $("#ccResult").textContent = "$" + perMonth.toFixed(2) + " /月";
      let advice;
      if (perMonth < 8) advice = "远低于订阅价 → 按量付费即可，或用免费额度";
      else if (perMonth < 20) advice = "接近 $20 → 建议 Plus/Claude Pro 订阅（附带 Agent 与更高限额）";
      else if (perMonth < 100) advice = "超过入门订阅 → 考虑 Max $100 或改用便宜模型（DeepSeek/GLM Flash）分流";
      else advice = "重度用户 → Claude Max $100/$200 或企业 API 折价 + 批处理/缓存优化";
      $("#ccHint").textContent = "每天 $" + perDay.toFixed(2) + " · " + advice;
    };
    if ($("#ccTimes")) {
      ["ccTimes", "ccIn", "ccOut", "ccModel"].forEach(id => {
        $("#" + id).oninput = calc; $("#" + id).onchange = calc;
      });
      calc();
    }
  }
};

/* ---------- 部署指南 ---------- */
const DeployView = {
  data: null,
  async init() {
    if (!this.data) {
      try {
        const r = await fetch("data/deploy.json");
        this.data = await r.json();
      } catch (e) { this.data = { intro: "", sections: [] }; }
    }
    const d = this.data;
    $("#deployBody").innerHTML = `
      <div class="hero-card" style="margin-bottom:14px">
        <div class="hero-label">💻 本地部署指南</div>
        <div style="font-size:12.5px;color:var(--muted);margin-top:6px;line-height:1.7">${esc(d.intro || "")}</div>
      </div>
      ${(d.sections || []).map((s, i) => `
        <div class="deploy-sec fade">
          <h3><span class="num">${i + 1}</span>${esc(s.icon || "")} ${esc(s.title)}</h3>
          <div class="d-desc">${esc(s.desc || "")}</div>
          ${s.steps ? `<ul>${s.steps.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
          ${s.table ? `<div class="price-table-wrap"><div class="price-scroll"><table class="price-table" style="min-width:560px">
            ${s.table.map((row, ri) => `<tr>${row.map(cell => ri === 0 ? `<th>${esc(cell)}</th>` : `<td class="${ri % 2 ? "" : "pt-muted"}" style="white-space:normal">${esc(cell)}</td>`).join("")}</tr>`).join("")}
          </table></div></div>` : ""}
          ${(s.codes || []).map(c => `
            <h4>${esc(c.title)}</h4>
            <div class="codeblock"><button class="copy" onclick="Bridge.copy(this.nextElementSibling.textContent)">复制</button><code>${esc(c.code)}</code></div>`).join("")}
        </div>`).join("")}
      <div class="note-box">🧮 拿不准自己的机器能跑多大的模型？去「模型库 → 显存计算器」算一算，或在模型卡里查看各量化档位需求。</div>`;
  }
};
