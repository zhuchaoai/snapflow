---
name: snapflow-screenshot
description: >
  HTML 配图截图工作流。只要涉及写 HTML 配图后需要截取 PNG 图片的场景，
  都必须使用此 Skill。包括但不限于：新做封面/内容页/数据页配图、
  修改已有配图后重新截图、批量生成小红书/头条号配图、
  任何 1242×1660 尺寸的图片生成任务。
  分两种模式：template（新做配图，用模板生成 HTML 后批量截图）
  和 direct（修改配图，直接截图已有 HTML 文件）。
  触发词：配图、截图、重新截图、重截、出图、底图不对、封面重出。
compatibility: opencode
---

# Screenshot Workflow — 配图截图工具

## 概览

使用 `batch-screenshot.js` 脚本 + 预置 HTML 模板，支持 7 种布局：

- **新做配图**：写 content.json → 脚本自动填模板 → 生成 HTML → 截图
- **修改配图**：改已有 HTML 或 content.json → 脚本只处理改的文件 → 截图

全程 headless Chrome。

---

## 前置依赖

- Node.js 18+
- 浏览器（二选一）：
  - Playwright Chromium（`npx playwright install chromium`）— 推荐，自动下载
  - 系统已安装的 Chrome 或 Edge — 国内网络免下载，截图脚本加 `--channel msedge` 或 `--channel chrome`
- 本目录下的 `templates/` 和 `config.yaml`（可选，用于注入品牌/配色）

---

## 两种模式

### 模式 1：新做配图（template）

**适用场景**：新建一期内容，需要制作全部配图。

**流程**：

```
① 写 content.json（描述每张图的内容）
② 确认封面底图就位：用户提供 → 填入 bgImage；无底图 → 跳过（模板兜底渐变背景）
③ 运行截图脚本（二选一）：
   ─ 有 Playwright Chromium: node batch-screenshot.js --style-pack xxx.json --config content.json
   ─ 用系统浏览器:       node batch-screenshot.js --channel msedge --style-pack xxx.json --config content.json
   → 自动：读模板 → 填变量 → 生成 HTML → 逐张截图
④ 检查结果
```

### 模式 2：修改配图（direct）

**适用场景**：已有配图需要修改文字/配色后重新截图。

**流程**：

```
① 直接改 HTML 文件
② 运行 batch-screenshot.js --mode direct --dir ./Images --files "01-cover,02-painpoint"
   → 只处理指定的文件，重新截图
③ 检查结果
```

---

## 模板类型速查

| 类型 | 适用场景 | content.json 字段 | 说明 |
|:----|:--------|:-----------------|:----|
| `cover` | 封面 | `title/subtitle/tagline/badges/bgImage` | 品牌徽章 + 大标题 + 底部品牌条 |
| `content` | 并列要点 | `pageNum/sectionTitle/footerText/cards` | card-grid 卡片网格 |
| `compare` | 对比方案 | `pageNum/sectionTitle/leftItems/rightItems/summaryText` | 左右分栏对比 |
| `data` | 数据展示 | `pageNum/sectionTitle/footerText/stats` | 大数字统计卡片 |
| `flow` | 步骤流程 | `pageNum/sectionTitle/footerText/steps` | 纵向步骤流 |
| `text` | 讲故事/举例 | `pageNum/sectionTitle/footerText/lines` | 纯文字段落块 |
| `showcase` | 截图展示 | `pageNum/sectionTitle/items` | 自动拆页，每页最多2张截图 |

---

## content.json 格式（template 模式用）

放在配图所在目录 `Images/` 下，文件名 `content.json`。

### 顶层字段

```json
{
  "assetType": "tool",
  "outputDir": "./Images",
  "headless": true,
  "images": [...]
}
```

`assetType` 取值：`tool`（技能资产）/ `identity`（人设资产）/ `life`（生命资产）。

### 封面（cover）

```json
{
  "type": "cover",
  "filename": "011-tool-01-cover",
  "title": "标题文字",
  "subtitle": "副标题",
  "tagline": "标签行",
  "badges": ["标签1", "标签2"],
  "bgImage": "011-tool-cover-bg.png"
}
```

> `bgImage` 是封面底图文件，放在当期 `Images/` 目录中。
> **从用户获取底图**：用户可能会说"底图已放到篇目/Images/下，文件名是 xxx.png"，此时直接把文件名填入 bgImage 即可。
> **让用户提供底图**：AI 也可主动询问"有没有封面底图？有的话放到 Images/ 目录下告诉我文件名"。
> **无底图时**：跳过封面底图，模板使用纯色/渐变背景兜底，不阻塞截图流程。

### 内容页 — 卡片网格（content）

```json
{
  "type": "content",
  "filename": "011-tool-02-content",
  "pageNum": "01",
  "sectionTitle": "小标题",
  "footerText": "底部文字",
  "cards": [
    {"icon": "❓", "title": "标题", "desc": "描述"}
  ]
}
```

### 内容页 — 对比方案（compare）

```json
{
  "type": "compare",
  "filename": "009-identity-02-compare",
  "comparePageNum": "01",
  "sectionTitle": "改造前后对比",
  "leftHeader": "改造前",
  "leftSub": "方案A",
  "leftItems": [{"label": "耗时", "value": "5分钟/次"}],
  "vsText": "VS",
  "rightHeader": "改造后",
  "rightSub": "方案B",
  "rightItems": [{"label": "耗时", "value": "10秒/次"}],
  "summaryText": "总结文字"
}
```

### 内容页 — 数据展示（data）

```json
{
  "type": "data",
  "filename": "011-tool-03-data",
  "pageNum": "02",
  "sectionTitle": "数据标题",
  "footerText": "数据说明",
  "stats": [
    {"value": "63", "label": "综合评分", "highlight": true},
    {"value": "5.4", "label": "指标"}
  ]
}
```

### 内容页 — 步骤流程（flow）

```json
{
  "type": "flow",
  "filename": "008-life-03-flow",
  "pageNum": "02",
  "sectionTitle": "步骤标题",
  "footerText": "",
  "steps": [
    {"num": "1", "title": "第一步", "desc": "描述"}
  ]
}
```

### 内容页 — 文字段落（text）

```json
{
  "type": "text",
  "filename": "011-tool-04-text",
  "pageNum": "03",
  "sectionTitle": "段落标题",
  "footerText": "",
  "lines": [
    "普通文字行",
    {"text": "高亮行", "highlight": true}
  ]
}
```

### 字段一览

| 字段 | 适用类型 | 说明 |
|:----|:--------|:-----|
| `bgImage` | cover | 封面底图文件名，放在 Images/ 目录 |
| `cards` | content | 卡片数组，每项含 icon/title/desc |
| `leftItems` / `rightItems` | compare | 对比列项目数组，每项含 label/value |
| `vsText` | compare | 中间 VS 标签文字 |
| `summaryText` | compare | 底部总结文字 |
| `stats` | data | 统计项数组，每项含 value/label/highlight |
| `steps` | flow | 步骤数组，每项含 num/title/desc |
| `lines` | text | 文字行数组，支持字符串或 `{text, highlight}` 对象 |
| `items` | showcase | 展示项数组，每项含 image/title/desc（自动拆页） |

所有非 cover 类型共用 `pageNum`、`sectionTitle`、`footerText` 字段。

---

## 从稿件自动生成 content.json

本目录提供 `md2content.js` 脚本，可自动从稿件 ````slides 数据区生成 content.json：

```bash
# 基本用法
node md2content.js --md "篇目/Manuscript/稿件.md"

# 使用风格包（命名规则从风格包读取）
node md2content.js --md "篇目/Manuscript/稿件.md" --style-pack style-packs/xxx.json
```

`assetType` 从稿件 slides YAML 顶层 `assetType` 字段读取，不依赖目录名猜测。

---

## 封面底图生成（ComfyUI）

> 本流程有条件依赖：需要本地运行 ComfyUI + SDXL 模型。
> **无 ComfyUI 环境时，直接跳过此节。封面使用纯色/渐变背景（已在模板兜底），不阻塞后续截图流程。**

### ComfyUI 启动协议（MUST-FOLLOW）

本协议必须严格按顺序逐条执行。**禁止跳过步骤、合并分支、自行优化等待时间。**

```
STEP 1 — 检查 ComfyUI 状态
  执行 MCP 工具 comfyui_health_check
  ├─ IF 返回 "running" → 协议完成，跳至 执行底图生成脚本
  └─ IF 返回 "not running" → 执行 STEP 2

STEP 2 — 启动 ComfyUI
  执行 MCP 工具 comfyui_start_comfyui
  ⚠️ 启动后立即执行 sleep(15000)
  ⚠️ 禁止在 sleep 完成前调用任何 health_check

STEP 3 — 首次复检
  sleep(15000) 完成后，执行 comfyui_health_check
  ├─ IF "running" → 协议完成，跳至 执行底图生成脚本
  └─ IF "not running" → 执行 STEP 4

STEP 4 — 二次复检
  sleep(15000) → 执行 comfyui_health_check
  ├─ IF "running" → 协议完成，跳至 执行底图生成脚本
  └─ IF "not running" → 停止。问用户："ComfyUI 启动不了，检查一下？"

  （用户回复前不得重试、不得跳过、不得继续后续流程）

=== 禁止事项（违反即任务失败） ===
  ❌ 禁止连续两次 health_check 之间不加 sleep(15000)
  ❌ 禁止 sleep 期间提前中断或缩短等待
  ❌ 禁止跳过 STEP 1 直接启动
  ❌ 禁止在自己不确定时自行猜测流程、自行编造 MCP 命令、自行决定等待时间
```

### 执行底图生成脚本

直接用 `generate-cover-bg.js` 脚本完成：提交 → 轮询 → 拷贝重命名一步到位。

#### 脚本化操作（推荐）

```bash
# 单篇封面底图生成
node generate-cover-bg.js --config "篇目/Images/content.json" --md "篇目/Manuscript/稿件.md" [--style-pack style-packs/xxx.json]
```

脚本自动执行：
1. 检查 ComfyUI 在线 → 2. 从稿件 slides 读取 bgPrompt → 3. 提交生成 → 4. 轮询出图（35s→15s→15s）→ 5. 拷贝重命名到 Images/ 目录

ComfyUI 配置（URL、模型、参数、输出目录）从风格包 `coverBg` 段读取，无风格包时通过环境变量 `COMFYUI_URL`、`COMFYUI_CHECKPOINT`、`COMFYUI_OUTPUT_DIR` 配置。

#### 手动操作（仅当脚本不可用时）

**① 提交生成**
- 用 `comfyui_generate_image` 提交，记录返回的 prompt_id

**② 轮询出图（时间间隔是硬性规定）**

```
sleep(35000) → get_job_status(prompt_id)
├─ IF completed → 跳至 ③ 获取文件
└─ IF not completed → sleep(15000) → get_job_status(prompt_id)
   ├─ IF completed → 跳至 ③
   └─ IF not completed → sleep(15000) → get_job_status(prompt_id)
      ├─ IF completed → 跳至 ③
      └─ IF not completed → 问用户"ComfyUI 可能卡住了，检查一下？"
```

⚠️ 首次 35 秒、后续 15 秒不可缩短。提前查询结果一定是"未完成"，且浪费 token。

**③ 获取输出文件**
- `get_history(prompt_id)` 获取输出文件名
- 从 ComfyUI 输出目录拷贝到当期 `Images/` 目录，按 `cover.bgImage` 命名

### 多篇循环流程

多篇封底需逐篇生成，**ComfyUI 仅需启动一次**：

```
01. 执行 ComfyUI 启动协议（仅第1篇前执行）
02. FOR 篇1 TO 篇N:
03.   执行 generate-cover-bg.js --config "篇N/Images/content.json" --md "篇N/Manuscript/稿件.md"
04.   → 脚本：检查在线 → 提交 → 轮询(35s→15s→15s) → 拷贝重命名
05.   → 完成进入下一篇
06.   → 失败则停下来问用户
```

---

## 文件说明

| 文件 | 说明 |
|:----|:-----|
| `batch-screenshot.js` | 截图脚本（核心，必用） |
| `generate-cover-bg.js` | ComfyUI封面底图生成（有条件依赖） |
| `md2content.js` | 从稿件 slides 数据区生成 content.json |
| `config.yaml` | 用户配置（品牌/配色/路径，已 gitignore） |
| `config.yaml.example` | 配置模板 |
| `content.json.example` | content.json 示例（带注释） |
| `templates/` | 7 套 HTML 模板 |
| `demo/` | 可跑通示例 |
| `style-packs/` | 付费风格包（JSON，不进 git） |

## 关联

- [[writing/SKILL.md]] — 上游：写稿流程（生成 slides 数据区）
