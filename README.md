# 📡 AI雷达 AIRadar

> 全球 AI 资讯实时聚合 · 热度排名 · LLM 排行榜 · 模型下载/价格情报站
> Android App（v1.2.0 · minSdk 24 / Android 7.0+ · 375 KB）

## 📦 安装

APK 位置：`AIRadar/AIRadar-v1.2.0-release.apk`（已用 v2+v3 方案签名，可直接安装；可直接覆盖升级旧版本）

1. 将 APK 传到安卓手机（微信/USB/网盘均可）
2. 点击 APK → 允许「安装未知来源应用」→ 安装
3. 打开后自动从全球 24 个数据源抓取资讯（首次约 10–30 秒）

## ✨ 功能总览

### 🏠 首页 — 全球 AI 资讯流
- **24 个数据源实时聚合**：Hacker News（Algolia API）、HuggingFace 每日论文、arXiv cs.AI、TechCrunch、The Verge、VentureBeat、MIT 科技评论、Ars Technica、Wired、OpenAI/Google/DeepMind/Anthropic/Qwen/HF 官方博客、Simon Willison、Interconnects、AI Snake Oil、机器之心、量子位、36氪、InfoQ、Reddit r/LocalLLaMA、r/MachineLearning
- **热度排名算法**：`热度 = (新鲜度×指数衰减 + 互动信号(HN票数/Reddit分数/HF推荐数) + 源权重) × 话题加成`，每条新闻可查看热度构成分析
- **10 个分区**：大模型 / 开源 / 学术 / 芯片算力 / 政策监管 / 产品应用 / 投融资 / 安全对齐 / 观点
- 热度/时间排序、24h/7天/全部时间窗、按来源筛选（可禁用单个源）
- **内置阅读器**：自动抓取原文并提取正文（失败时引导外部打开）、字号调节
- 下拉刷新 + 每 5 分钟自动增量更新（可配置 3/5/10/15 分钟）+「N 条新资讯」浮动提示
- 收藏 ⭐（离线可用）、系统分享、讨论区直达
- **🌐 中英翻译（v1.1.0 新增）**：
  - 列表筛选栏「🌐 译中」全局开关，开启后英文资讯自动后台翻译（标题+摘要）并即时替换显示
  - 每张英文卡片自带「🌐 译文 / 🌐 原文」按钮，单条随时切换
  - 阅读器顶栏「译 / 原文」按钮：**全文一键翻译**（长文自动分块、逐段翻译，标题同步）
  - 设置页「自动翻译英文资讯」默认开关；译文缓存在本地（800 条上限），二次阅读零流量
  - 引擎：谷歌公共翻译接口（免密钥）+ MyMemory 备用源自动容错，全部经应用内安全代理

### ✨ AI 信息整合概括（v1.2.0 新增，自带大模型 API）
- **自定义任意 OpenAI 兼容接口**：设置 →「AI 概括 · 自定义大模型 API」填入 接口地址 URL + API Key + 模型名（三者在弹窗/设置页均可填），支持 DeepSeek / OpenAI / 智谱 / 月之暗面及一切兼容服务商；带「测试连接」按钮
- **今日 AI 简报**：首页「✨ AI 简报」一键把 24h 热度 Top25 资讯交给大模型整合成结构化中文简报（今日焦点/趋势洞察/值得关注），支持复制与重新生成
- **单文 AI 概括**：阅读器顶栏「✨」按钮，3-5 句核心概括 + 关键词，结果嵌在文章顶部，可收起
- 隐私与安全：API Key 仅存设备本地；请求经原生 POST 代理直连你填写的服务商（头部白名单仅放行 Authorization、请求体 ≤1MB、读超时 90s）；接口地址仅允许公网 http/https，本机/内网地址会被拒绝；错误友好提示（401 Key 无效 / 404 地址或模型名错误 / 429 限流）

### 🔥 热榜
- 7 天综合热榜 Top50（含热度条形图与前三名金银铜）
- **上升最快**：热度速度榜（当前热度÷监测时长），新晋条目标 NEW
- **热词云**：Canvas 词云 + 热词指数榜（基于词频×热度加权，点击即搜）

### 🏆 排行榜（LLM Rankings）
- **Arena（原 LMArena）官方总榜**：内置 2026-10-08 快照 Top60（414 模型中精选），含 ELO/投票数/官方 API 价格/上下文/许可
- 六大维度：**综合榜 / 开源榜 / 国产榜 / 性价比榜（ELO÷$/M）/ 长上下文榜 / HF 实时热榜**（HuggingFace API 在线抓取下载量趋势）
- 榜单行点击查看详情卡，联动模型库与相关资讯搜索

### 📦 模型库（31 张模型卡）
- 覆盖 Gemini 4/GPT-6.1/GPT-5.6/Claude Opus·Fable·Sonnet 5.5/Grok 4.20/Qwen3.8/GLM-5.3/Kimi K3/DeepSeek V4/MiniMax M3/Muse Spark/GPT-OSS 等
- 每张卡四个页签：**概览**（Arena成绩/参数/许可）、**在线体验**（官网/Arena 盲测入口）、**API 接入**（价格 + curl/Python 示例代码）、**本地部署**（Ollama 一行命令、HuggingFace 权重、FP16/Q8/Q4 显存速查表）
- 筛选：开源/闭源/可本地部署/国产/多模态/推理
- **模型对比**：任选 2–3 个生成对比表
- **🧮 显存计算器**：参数量×量化精度 → GB 估算 + 参考硬件建议

### 💰 价格与套餐（「我的」→ 价格与套餐）
- **API 价格总表**：15 家供应商（OpenAI/Anthropic/Google/xAI/DeepSeek/通义/智谱/Kimi/MiniMax/Mistral/Meta/小米/百度/腾讯/亚马逊），人民币/美元切换
- **订阅套餐对比**：ChatGPT Go/Plus/Pro、Claude Pro/Max、Google AI Pro/Ultra、Perplexity、Copilot（10 档）
- **Agent 套餐**：Claude Code、Codex、Copilot Coding Agent、Cursor、Devin、Gemini CLI、Windsurf、MiniMax（8 款）
- **免费 API 额度汇总**（10 个白嫖渠道）
- **成本计算器**：日对话量×tokens → 月成本 → 自动给出「按量 vs 订阅」建议

### 💻 本地部署指南
- Ollama（Win/Mac/Linux + OpenAI 兼容 API）、LM Studio、llama.cpp、vLLM、量化选择科普、硬件对照表、手机端方案、Open WebUI 等生态工具（8 章 · 7 段可复制命令）

### 👤 我的
- 收藏 / 浏览历史（各 100 条，本地保存）
- **关键词订阅**：添加关注词，新资讯命中自动汇总 + 红点提醒
- 设置：深色/浅色/自动主题、自动刷新开关与间隔、缓存与隐私数据清理
- 数据源管理（逐源开关 + 健康状态灯）、关于与数据来源鸣谢

## 🔒 隐私与安全
- **无账号、无埋点、不上传任何个人数据**，全部本地存储（localStorage）
- 出网请求经原生层安全代理：仅允许 http/https、仅 80/443 端口、**拒绝 localhost/环回/内网/链路本地/保留地址（SSRF 防护）**、重定向逐跳复检、响应体限流
- AI 概括的 POST 通道：头部白名单仅放行 Authorization、请求体 ≤1MB、响应 ≤4MB、90s 超时
- 应用自身不内置任何 API Key 或凭据（AI 接口 Key 由用户自行填入并仅存本机）

## 🛠 源码结构
```
AIRadar/
├── AIRadar-v1.0.0-release.apk     # 成品
├── app/
│   ├── AndroidManifest.xml        # minSdk 24 / targetSdk 35
│   ├── java/com/airadar/app/MainActivity.java   # WebView壳+安全代理+JS桥（纯Java零依赖）
│   ├── res/                       # 自适应雷达图标（Pillow 程序化绘制）
│   └── assets/webapp/             # 前端 SPA（vanilla JS，无框架无CDN，离线可用）
│       ├── index.html / css/app.css
│       ├── js/  core·feeds·views_main·views_rank·views_models·views_tools·views_mine·app
│       └── data/  sources·leaderboard(Arena快照)·models·pricing·deploy·seed_news
└── ../airadar-build/              # JDK17 + Android SDK 35 + 构建/图标脚本
```

## 📅 数据时效说明
- Arena 榜单：官方 2026-10-08 快照（应用内点击「查看实时榜单」跳转 arena.ai）
- API 价格：2026-10-12 汇总，厂商调价频繁，下单前以官方页为准
- 资讯：全部实时抓取，无内置假新闻（离线引导条目已明确标注并在联网后移除）

## 🔨 重新构建
```bash
bash airadar-build/build_apk.sh   # aapt2 + javac + d8 + zipalign + apksigner
```
签名密钥随机生成，口令存于 `airadar-build/keystore.pass`（正式发布请换成自己的密钥）。

## 📄 许可证

[MIT License](LICENSE) © 2026 马恺航

