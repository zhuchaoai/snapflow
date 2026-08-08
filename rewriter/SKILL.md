---
name: rewriter
description: >
  多平台改写器。把 Snapflow 主平台（小红书）产出的稿件，按平台套件规则改写成副平台
  （头条号等）的图文稿 + 独立配图。改写正文 + 生成平台专属 Slides + 出图一条龙。
  引擎开源，平台套件付费。触发词：改写、转平台、分发、转头条、多平台改写、副平台。
compatibility: opencode
---

# Rewriter — 多平台改写器

## 定位

Snapflow 的下游延续功能。主平台写稿产出后，改写器把它分发到副平台。

```
主平台稿件（正文 + Slides）
  → 改写器：AI 按平台规则改写正文 + 生成平台专属 Slides
  → 复用 md2content.js + batch-screenshot.js 出图
  → Distribute/{平台}/ 产出，用户自行分发
```

## 核心原则

- **AI 串行改写 + 脚本并发截图**：改写是 AI 的活（串行，低门槛），截图是脚本的活（并发，快）
- **平台套件解耦**：加平台 = 加 `platforms/{平台}/` 文件夹，不改引擎
- **副平台独立生成 Slides**：不照搬主稿件 Slides，按平台规则重新提炼（头条号只 1-2 张）
- **复用主项目脚本**：md2content.js（解析）、batch-screenshot.js（截图）全部复用

---

## 前置检查

启动时确认：
1. 稿件路径存在，且含 `## Slides数据` 区
2. 目标平台套件存在：`<snapflow>/rewriter/platforms/{平台}/platform.json`（无则提示需购买平台包）
3. 用 `node <snapflow>/rewriter/rewrite.js --list` 查可用平台

---

## 单平台改写流程

> **工作目录约定（所有步骤统一）**：在「篇目目录」执行（含 `Manuscript/` 与 `Distribute/` 的那一层）。
> 脚本路径用 `<snapflow>` 占位（即 skill 安装目录，Windows 为 `%USERPROFILE%\.config\opencode\skills\snapflow`）。
> 开始前先 `cd <篇目目录>` 并确认 `pwd`。

### STEP 1 — 生成改写任务包

```bash
cd <篇目目录>
node <snapflow>/rewriter/rewrite.js --platform toutiao --md "Manuscript/稿件.md"
```

产出 `Distribute/toutiao/_task.md` —— 内含平台规则 + 源稿正文 + 源稿 Slides（供提炼参考）。

### STEP 2 — AI 执行改写（本 skill 的 AI agent 干）

读取 `_task.md`，严格按里面的规则改写，产出**一个 .md 文件**，含两部分：

1. **改写后的正文**——按标题/正文/红线/结构骨架规则
2. **平台专属 Slides 数据区**——按 Slides 规则重新生成（`` ```slides `` 代码块，格式与主稿件一致）

写入 `Distribute/{平台}/稿件.md`。

> ⚠️ 关键（防结构漂移）：
> - Slides 必须重新生成，不照搬源稿。头条号只 1-2 张，标题去 emoji、去 `<em>`
> - **Slides 必须 YAML 格式**（`assetType:` + `- type:` 逐行），禁止 JSON 数组
> - **严格复制 `_task.md` 里的【结构样板】骨架**（frontmatter 字段/`##` 小标题 2-4 个/AI 声明），只替换内容
> - **正文 800-1500 字**（头条展开要求，原创≥300 字），开头场景化/问题式抓人
> - **文末必须保留 AI 声明**（「本文由 AI 辅助生成，经作者原创加工优化」，《人工智能生成合成内容标识办法》2025-09-01 强制）

### STEP 3 — 生成 content.json（复用主项目脚本）

```bash
node <snapflow>/md2content.js --md "Distribute/toutiao/稿件.md" --style-pack "<snapflow>/rewriter/platforms/toutiao/style-pack.json"
```

输出到 `Distribute/toutiao/Images/content.json`（rewriter 稿件自动识别 Distribute 结构）。

### STEP 4 — 截图（复用主项目脚本 + 平台模板）

```bash
node <snapflow>/batch-screenshot.js \
  --style-pack "<snapflow>/rewriter/platforms/toutiao/style-pack.json" \
  --config "Distribute/toutiao/Images/content.json" \
  --concurrency auto
```

`--concurrency auto` 按机器内存+CPU 自适应（详见并发规则）。

### STEP 5 — 报告 + 审核

呈现改写稿 + 配图，等用户审核。

---

## 多平台并发流程

用户要"改写成头条号、公众号、抖音"时：

```
第一阶段：AI 串行改写（逐个平台）
  for 每个平台:
    STEP 1 生成任务包 → STEP 2 AI 改写 → STEP 3 content.json
  （串行，因为都是当前 AI agent 干，一次专注一个平台质量更高）

第二阶段：脚本并发截图（所有平台合并）
  前置：工作目录必须是「篇目目录」（即含 Distribute/ 的那一层，与 Manuscript/ 同级）
  cd <篇目目录>   ← 必须！简化式依赖当前目录解析相对路径

  简化式（推荐，平台产出目录规范时）：
  node <snapflow路径>/batch-screenshot.js --dirs "toutiao,douyin" --concurrency auto
  → 自动推导：输入/输出 = 当前目录/Distribute/{平台}/Images
            风格包 = <snapflow路径>/rewriter/platforms/{平台}/style-pack.json

  显式式（目录不规范或需分开输入/输出时，不依赖工作目录）：
  node <snapflow路径>/batch-screenshot.js --dirs "toutiao:<篇目>/Distribute/toutiao/Images:<篇目>/Distribute/toutiao/Images:<snapflow>/rewriter/platforms/toutiao/style-pack.json,douyin:..." --concurrency auto
  每项四段 = 平台名:输入目录:输出目录:风格包路径

  → 所有平台的图合并成一个并发池，一次性截完；每个平台用自己的风格包/模板/尺寸，PNG 写各自输出目录，文件名带平台前缀不混淆

  报错排查：若提示"风格包不存在"或"无 content.json"，优先检查
  ① 是否已在篇目目录执行（pwd 确认）
  ② 各平台的 content.json 是否已由 STEP 3 生成（md2content.js 输出到 Distribute/{平台}/Images/）
```

**为什么改写串行、截图并发**：改写是 AI 语义活，串行保质量、不撞模型；截图是 IO 活，并发省时间，且不需要多 agent 插件。

---

## 并发截图规则（batch-screenshot.js --concurrency）

- `auto`（默认）：按 `os.freemem()` 空闲内存 + CPU 核数自适应，硬上限 8
- 分档：内存 <8G→2 / 8-16G→3 / 16-24G→5 / ≥24G→8，与 CPU（留半数核）取较小值
- 手动：`--concurrency 3` 指定，`--concurrency 1` 强制串行（逃生阀）
- 断点续截：已有 PNG 自动跳过，卡死重跑不用从头

---

## 目录结构

```
rewriter/
├── SKILL.md              ← 本文件
├── rewrite.js            ← 引擎：生成改写任务包
├── slides-parser.js      ← 稿件解析（独立复制，不依赖主项目）
└── platforms/            ← 平台套件（toutiao 开源示例；公众号/知乎等付费）
    └── toutiao/
        ├── platform.json ← 改写规则 + 截图配置
        ├── style-pack.json ← 风格包（含 paths.templateDir / coverBg 配置）
        └── templates/    ← 头条资讯感模板（1024×678）

产出（稿件同级）:
篇目/Distribute/{平台}/
├── _task.md      ← 改写任务包（中间文件）
├── 稿件.md       ← 改写后正文 + 平台 Slides
├── Images/content.json
└── Images/*.png  ← 平台配图
```

> **工作目录**：所有脚本命令在「篇目目录」执行，脚本路径用 `<snapflow>/...` 指到 skill 安装目录。

## 关联

- `../SKILL.md` — 截图引擎（复用 batch-screenshot.js）
- `../writing/SKILL.md` — 上游写稿流程（产出主稿件）
- `platforms/{平台}/platform.json` — 平台改写规则
