# Snapflow — 内容自动化工作流

一套开箱即用的内容自动化系统，包含**写稿**和**配图**两个 Skill，丢给 AI agent 就能一条龙跑通。

```bash
# 配图 Demo：一键生成 6 张小红书风格 PNG
npm install
npx playwright install chromium
node batch-screenshot.js --cfg config.yaml --config demo/content.json
```

---

## 系统构成

```
snapflow/
│
├── batch-screenshot.js     # 截图脚本（核心）
├── generate-cover-bg.js    # ComfyUI 封面底图生成
├── md2content.js           # 稿件 slides → content.json
├── templates/              # 7 套 HTML 模板
├── style-packs/            # 风格包（含出厂默认 + 付费）
│   └── default.json        # 开箱即用，免付费即可跑 demo
├── demo/                   # 可跑通示例
├── content.json.example    # 内容数据格式（带注释）
├── config.yaml.example     # 配置模板
│
├── writing/   ← 写稿引擎（配合截图使用）
│   ├── SKILL.md            # OpenCode Skill 入口
│   ├── config.yaml.example
│   └── workflows/          # 写稿+配图流程
│       ├── 02-write-draft.md
│       └── 03-generate-images.md
│
└── Images/                 # 截图输出目录（已 gitignore）
```

---

## 截图引擎（独立可用）

### 特性

- **7 种布局模板** — 封面 / 卡片 / 展示 / 对比 / 文字 / 数据 / 流程
- **配置驱动** — 改 `config.yaml` 换品牌名、配色、字号
- **批量截图** — 一次配置，一键出全部
- **自动拆分** — 展示页超过 2 张截图自动分页
- **两种模式** — template（新做配图）/ direct（修改后重截）

### 快速开始

#### 环境要求

- Node.js 18+
- Chromium（Playwright）

#### 安装

```bash
# 1. 克隆仓库
git clone <your-repo-url>
cd snapflow

# 2. 安装依赖
npm install

# 3. 安装 Playwright Chromium 浏览器
npx playwright install chromium

# 4. 创建配置文件（可选，不配则使用中性出厂默认值）
cp config.yaml.example config.yaml
# 编辑 config.yaml 指定风格包路径，或直接用 --style-pack 参数
```

#### 跑通 Demo

```bash
# 一键（推荐）
npm run demo

# 或直接指定默认风格包
node batch-screenshot.js --style-pack style-packs/default.json --config demo/content.json

# 可见浏览器调试
npm run demo:visible
```

输出在 `Images/` 目录下，共 6 张 PNG。无需购买付费风格包即可体验完整功能。

### 模板类型

| 类型 | 用途 | 主要字段 |
|------|------|---------|
| `cover` | 封面 | title, subtitle, tagline, badges, bgImage |
| `content` | 卡片内容页 | sectionTitle, cards[{icon, title, desc}] |
| `showcase` | 截图展示页（自动拆页） | sectionTitle, items[{image, title, desc}] |
| `compare` | 左右对比页 | leftItems, rightItems, vsText, summaryText |
| `text` | 文字段落/金句 | lines[{text, highlight}] |
| `data` | 数据展示 | stats[{value, label, highlight}] |
| `flow` | 流程步骤 | steps[{num, title, desc}] |

### 两种模式

#### template 模式（新做配图）

```bash
# 使用风格包（推荐，所有配置单一来源）
node batch-screenshot.js --style-pack style-packs/xxx.json --config content.json
# 或通过 config.yaml 指定风格包（需先 cp config.yaml.example config.yaml）
node batch-screenshot.js --cfg config.yaml --config content.json
```

流程：读 content.json → 填充模板 → 生成 HTML → Playwright 截图

#### direct 模式（修改后重截）

```bash
node batch-screenshot.js --mode direct --dir ./Images
```

不改 content.json，只重新截图已有 HTML。适合调完模板样式后批量更新。

### 调试

```bash
# 可见浏览器，便于排查布局问题
node batch-screenshot.js --cfg config.yaml --config content.json --headless false

# 只处理指定文件
node batch-screenshot.js --mode direct --dir ./Images --files "cover,painpoints"

# 直接指定风格包（跳过 config.yaml）
node batch-screenshot.js --style-pack style-packs/xxx.json --config content.json --headless false

# 使用系统已安装的 Edge 浏览器（国内网络免下载 Chromium）
node batch-screenshot.js --style-pack style-packs/default.json --config demo/content.json --channel msedge

# 使用系统已安装的 Chrome 浏览器
node batch-screenshot.js --style-pack style-packs/default.json --config demo/content.json --channel chrome
```

## 写稿引擎

需配合 AI agent（如 OpenCode）使用。agent 读取 `writing/SKILL.md` 后获得写稿能力：

1. 确定选题 → 2. 搜集资料 → 3. 写初稿 → 4. 审核修改 → 5. 定稿
6. 定稿后自动调用截图引擎生成配图

详细流程见 `writing/workflows/`。

## 风格包（付费）

风格包是一个 JSON 文件，**所有配置的单一来源**：品牌、配色、截图参数、路径、ComfyUI 设置、写稿规则，一个文件到位。
agent 加载风格包后直接工作，无需额外配置。

一个风格包 = 一个平台的完整视觉+内容方案。切换平台只需换风格包。

- 标价 **¥49.9**，上新优惠 **¥29.9**
- 一次购买，持续更新
- 购买入口：小报童专栏（搜索 "Snapflow 风格包"）

## 项目结构

```
snapflow/
├── batch-screenshot.js     # 截图脚本（核心）
├── generate-cover-bg.js    # ComfyUI 封面底图生成
├── md2content.js           # 稿件 slides → content.json
├── config.yaml             # 风格包选择器（已 gitignore）
├── config.yaml.example     # 配置示例
├── content.json.example    # 内容数据模板（带注释）
├── SKILL.md                # 截图 Skill 入口
├── templates/              # 7 套 HTML 模板
├── demo/                   # 可跑通示例
├── Images/                 # 截图输出目录（已 gitignore）
│
├── writing/                # 写稿 Skill
│   ├── SKILL.md
│   ├── config.yaml.example
│   └── workflows/
│
└── style-packs/            # 付费风格包（内容不进 git）
    ├── .gitkeep
    └── 筑巢AI-暖金.json     # 示例风格包（已 gitignore）
```

## License

MIT
