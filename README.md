# Snapflow — 内容自动化工作流

一套开箱即用的内容自动化系统，包含**写稿**和**配图**两个 Skill，丢给 AI agent 就能一条龙跑通。

```bash
# 配图 Demo：一键生成 6 张小红书风格 PNG
npm install
npx playwright install chromium
node batch-screenshot.js --style-pack default --config demo/content.json
```

---

## 项目结构

```
snapflow/
├── batch-screenshot.js     # 截图脚本（核心） ← 截图引擎（内置 ComfyUI 封面底图生成）
├── comfy-setup.js          # ComfyUI 智能脚本自动生成（跨平台首次运行检测）
├── comfy-lifecycle.js      # ComfyUI 延迟退出管理（闲置 30min 自动停止）
├── md2content.js           # 稿件 slides → content.json
├── LICENSE                 # MIT 开源许可
├── style-packs/            # 风格包（自包含文件夹 = 一个包）
│   └── default/            # 出厂默认（免费，开箱即用）
│       ├── style-pack.json # 风格包主文件（配色/字号/写稿规则）
│       ├── templates/      # 该包专属模板
│       └── assets/         # 素材
├── style-pack-resolver.js  # 风格包解析器（未指定时自动选高频包）
├── content.json.example    # 内容数据模板（带注释）
├── SKILL.md                # 截图 Skill 入口
├── demo/                   # 可跑通示例
│
├── writing/                # ← 写稿引擎
│   ├── SKILL.md            # 写稿 Skill 入口
│   ├── manuscript-template.md  # 稿子格式模板（含 Slides 数据区完整写法）
│   └── workflows/
│       ├── 02-write-draft.md
│       └── 03-generate-images.md
│
└── package.json
```

> **两个 Skill**：本项目包含独立的截图 skill 和写稿 skill。丢进 AI 平台 skill 目录后自动识别为两个可用 skill。截图引擎可独立运行，不依赖写稿 skill。
>
> **风格包 = 一个文件夹**：付费风格包（如炭火）是自包含文件夹（style-pack.json + templates + README），复制进 `style-packs/` 即用，无需任何配置。

---

## 截图引擎（独立可用）

### 特性

- **7 种布局模板** — 封面 / 卡片 / 展示 / 对比 / 文字 / 数据 / 流程
- **配置驱动** — 风格包单一配置源：换风格包 = 换品牌名、配色、字号
- **批量截图** — 一次配置，一键出全部
- **自动拆分** — 展示页超过 2 张截图自动分页
- **两种模式** — template（新做配图）/ direct（修改后重截）

### 快速开始

#### 环境要求

- Node.js 18+
- 浏览器（三选一）：
  - **Microsoft Edge**（推荐）— Windows 预装或自行安装，用 `--channel msedge`
  - **Google Chrome** — 用 `--channel chrome`
  - **Playwright Chromium** — `npx playwright install chromium` 自动下载

> 精简版 Windows 可能不含 Edge，请先安装 Edge/Chrome，或使用 Playwright 自带浏览器。

#### 安装

根据你的网络环境和浏览器情况，选一组命令：

> **没有 `git`？** 点 GitHub 页面绿色的 **Code** → **Download ZIP**，解压后进目录执行下面的命令即可（省去 `cd snapflow` 前的部分）。

**① 网络通畅 + 有 Edge**

```bash
cd snapflow
npm install
npm run demo:edge
```

**② 网络通畅 + 有 Chrome**

```bash
cd snapflow
npm install
npm run demo:chrome
```

**③ 国内网络 + 淘宝镜像 + 有 Edge**

```powershell
cd snapflow
npm install --registry https://registry.npmmirror.com
npm run demo:edge
```

**④ 国内网络 + 无浏览器（自动下载）**

```powershell
cd snapflow
npm install --registry https://registry.npmmirror.com
npx playwright install chromium
npm run demo
```

> 以上命令假设已进到 `snapflow` 目录（`cd snapflow`）。无 `git` 时下 ZIP 解压后直接进目录操作。

安装完成并跑通 Demo 后，`Images/` 目录下会输出 6 张 PNG。无需购买付费风格包即可体验完整功能。

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
# 不指定风格包时自动选使用频率最高的（或弹菜单）
node batch-screenshot.js --config content.json
```

`--style-pack` 支持**路径、文件名或名称**三种写法，无需记完整路径：

```bash
# 按文件名（自动匹配 style-packs/ 目录）
node batch-screenshot.js --style-pack default --config content.json
# 按风格包名称（短名即可，如 "炭火" 匹配 "Snapflow · 炭火"）
node batch-screenshot.js --style-pack 炭火 --config content.json
```

**不指定 `--style-pack` 时**：
- 交互终端（人直接跑）：弹出风格包菜单（按使用频率排序），选编号即可
- agent 调用（非交互）：自动选使用频率最高的风格包，零等待

```
📦 可用风格包:
  1. Snapflow · 炭火 ⭐ 🔥10次  (Snapflow-炭火/style-pack.json)
  2. 出厂默认 · 浅色 🔥1次  (default/style-pack.json)

请选择 (1-2) [默认 1，15s 超时自动选高频]:
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
node batch-screenshot.js --style-pack style-packs/xxx.json --config content.json --headless false

# 只处理指定文件
node batch-screenshot.js --mode direct --dir ./Images --files "cover,painpoints"

# 直接指定风格包（推荐，风格包是唯一配置源）
node batch-screenshot.js --style-pack style-packs/xxx.json --config content.json --headless false

# 使用系统已安装的 Edge 浏览器（国内网络免下载 Chromium）
node batch-screenshot.js --style-pack default --config demo/content.json --channel msedge

# 使用系统已安装的 Chrome 浏览器
node batch-screenshot.js --style-pack default --config demo/content.json --channel chrome
```

## ComfyUI 封面底图（自动管理）

`batch-screenshot.js` **内置 ComfyUI 支持**。风格包配了 `coverBg` 段就会自动：检查 ComfyUI 在线（未运行且有 `startCmd` 则自动启动）→ 从 slides bgPrompt 提交生成 → 轮询出图 → 拷贝到 `Images/`。无需任何手动操作。

### 智能管理脚本（comfyui 命令）

首次运行（或 `comfyui` 命令不存在）时，`comfy-setup.js` 自动检测系统环境并生成平台适配的智能管理脚本：

| 命令 | 作用 |
|------|------|
| `comfyui start` | 探测运行状态 → 未运行则后台启动 → 轮询就绪 |
| `comfyui stop` | 优雅停止 → 未停则强杀兜底 |
| `comfyui status` | 运行状态 + GPU/VRAM |

- **Linux/macOS**：生成 bash 脚本 `~/.local/bin/comfyui`
- **Windows**：生成 PowerShell 脚本 `~/.local/bin/comfyui.ps1`
- 命令已存在时**直接使用，不覆盖**；检测失败可设 `COMFYUI_DIR` / `COMFYUI_PYTHON` 环境变量
- 手动生成/查看报告：`node comfy-setup.js`

### 延迟退出（自动释放显存）

`comfy-lifecycle.js` 管理 ComfyUI 生命周期：**以最后一次脚本调用结束为准，闲置 30 分钟自动停止 ComfyUI**，释放 GPU 显存。

- 仅管理脚本自己启动的实例——**用户手动启动的 ComfyUI 不会被自动关闭**
- 队列中还有任务在渲染时自动顺延
- 环境变量可调：`COMFYUI_IDLE_TIMEOUT_MS`（默认 1800000 = 30min）、`COMFYUI_STOP_CMD`、`COMFYUI_POLL_INTERVAL_MS`

> **无 ComfyUI 环境**：风格包不配 `coverBg` 段即可，脚本自动跳过，封面使用渐变背景兜底。

## 安装（给 AI agent 使用）

Snapflow 包含两个独立 Skill，安装后 AI agent（如 OpenCode）可自动调用。

### 方式一：安装到 OpenCode 全局 skill 目录（推荐）

```bash
# 终端（cmd/PowerShell）执行，所有项目可用
git clone https://github.com/zhuchaoai/snapflow.git %USERPROFILE%\.config\opencode\skills\snapflow
```

AI agent 重启后自动识别 `snapflow-screenshot`（配图）和 `snapflow-writing`（写稿）两个 Skill。

### 方式二：安装到特定项目下（仅当前项目可用）

```bash
# 先进入你的项目根目录
cd D:\你的项目目录
git clone https://github.com/zhuchaoai/snapflow.git .opencode\skills\snapflow
```

### 更新

```bash
cd %USERPROFILE%\.config\opencode\skills\snapflow
git pull
```

更新后重启 AI agent 即可生效。

### 验证安装

AI agent 加载后，说"配图"或"写稿"，如果能正常响应流程即安装成功。或者终端执行：

```bash
# 查看 skill 目录下是否有 snapflow
dir %USERPROFILE%\.config\opencode\skills\snapflow
```

## 写稿引擎

需配合 AI agent（如 OpenCode）使用。agent 读取 `writing/SKILL.md` 后获得写稿能力：

1. 确定选题 → 2. 搜集资料 → 3. 写初稿 → 4. 审核修改 → 5. 定稿
6. 定稿后自动调用截图引擎生成配图

详细流程见 `writing/workflows/`。

## 风格包（付费）

风格包是**自包含文件夹**，**所有配置的单一来源**：品牌、配色、截图参数、模板、ComfyUI 设置、写稿规则，一个文件夹到位。复制进 `style-packs/` 即用，零配置。

一个风格包 = 一个平台的完整视觉+内容方案。切换平台只需换风格包文件夹。

- 标价 **¥29.9**
- 一次购买，持续更新
- 购买入口：[面包多 · Snapflow 炭火风格包](https://mbd.pub/o/bread/YZaUlp5tZA==)

### 为什么值这个价

- **审美即产品**：炭火暗暖系视觉（配色/排版/字体）是打磨过的设计，不是模板堆砌
- **一次劳动，重复收益**：你买的是设计成品 + 持续更新，不用自己花时间调
- **写稿规则内置**：素材先行 + 风格锚 + 红线，AI 按你的调性写，不是通用模板腔
- **持续迭代**：引擎更新、规则升级，风格包跟随更新（版本号可查）

## License

MIT
