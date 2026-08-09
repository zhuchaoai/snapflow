# Changelog

## v2.0.0 (2026-08-08)

### Added
- **Rewriter 多平台改写器开源**：`rewriter/` 引擎（rewrite.js 任务包生成 + slides-parser.js 解析 + SKILL.md 工作流）+ 头条号示例套件（platform.json 改写规则 / style-pack.json 风格包 / 7 套横版模板 / example-稿件.md 结构样板）
- **多平台分发链路**：小红书主稿件 → rewrite.js 生成改写任务包 → AI 按平台规则改写 → md2content.js 解析 → batch-screenshot.js `--dirs` 合并并发出图
- **封面标题自适应排版**：智能断行（宽度单位模型，中文1/英文0.55，标点→助词→单词边界四级断点，英文单词不拆）+ 主/副标题最多两行迭代降字号 + 副标题固定比例跟随主标题（≈0.58）
- **数据页网格自适应**：`STAT_GRID_COLS` 按统计项数量动态列数（4 项 → 2×2，消除 3+1 布局）
- **头条套件规则按 2025-2026 平台规范校准**：正文 800-1500 字、AI 生成内容标识法规红线（《人工智能生成合成内容标识办法》）、标题党禁令、开头/结尾写法规则

### Changed
- `.gitignore`：rewriter 引擎 + 头条示例套件纳入开源，付费平台套件目录（wechat/zhihu/douyin 等）保持忽略
- `batch-screenshot.js`：`--dirs` 简化式路径确定性推导（cwd=篇目目录、__dirname=snapflow 根）、报错追加工作目录指引
- 写稿流程「素材先行」升级：AI 写稿前自主检索素材（经历类查本地知识库 session-review 记录、事实类 Web 搜索带来源），输出素材清单经用户确认后才动笔——用户只补 AI 查不到的私密经历，**AI 能做的事，用户坚决不自己做**

---

## v1.2.5 (2026-08-08)

### Added
- `batch-screenshot.js`：新增**多平台合并截图** `--dirs` 参数。一次命令并发截图多个平台的配图：
  - 四段式 `--dirs "toutiao:输入目录:输出目录:风格包路径,douyin:..."`：显式指定输入（读 content.json）/ 输出（PNG 落盘）/ 风格包
  - 简化式 `--dirs "toutiao,douyin"`：自动推导 `Distribute/{平台}/Images` + `rewriter/platforms/{平台}/style-pack.json`
  - 每个平台任务绑定自己的尺寸（如头条 1024×678、小红书 1242×1660 同池共存）、模板、输出目录，文件名带平台前缀不混淆
- `style-pack-resolver.js`：扫描范围扩展至 `rewriter/platforms/*/style-pack.json`，交互菜单按「主平台风格包 / 副平台风格包」分组显示，短名匹配同样适用（如 `--style-pack 头条`）

### Changed
- `batch-screenshot.js`：并发截图逻辑抽取为通用 `screenshotPool`，单平台与多平台共用；`generateHTML` 支持输出目录覆盖

---

## v1.2.4 (2026-08-08)

### Added
- `style-pack-resolver.js`：新增独立风格包解析器。`--style-pack` 现支持**路径 / 文件名 / 名称**三种写法（如 `--style-pack 炭火` 自动匹配 `Snapflow-炭火.json`，无需记完整路径）
- `batch-screenshot.js`：未指定 `--style-pack` 且为交互终端时，自动弹出风格包菜单（按使用频率排序，常用在前），选编号即可；非交互环境（如 CI/脚本）保持原行为用默认配置
- 风格包使用频率记录于 `~/.config/opencode/style-pack-usage.json`（本地文件，不随仓库提交）
- 写稿规则：**风格基准唯一**——只参照《小红书配文编写规范》003 样板稿，禁止参照其他期次；用户提到"参考某期"且非 003 时先提示规范已更新
- 写稿规则：**素材先行 + 存疑标记**——写稿前先确认本期素材，未确认不硬写叙事细节；非素材来源的细节（对话/数字/场景）句后标 `[存疑]` 交用户重点检查

---

## v1.2.3 (2026-08-07)

### Changed
- 写稿节奏规则统一：废弃"一句一行、短句堆叠"（残留于 manuscript-template / 自检清单 / 风格包 quality.structure），统一为"段落叙事为主，爆发/转折/金句独立成行，节奏跟随情绪"
- 写稿约束引入 `style_anchor` 风格锚概念：风格包自带风格 DNA（直接进场景/数字是骨架/转折有人物/金句带情绪/收尾给行动），外部规范文件降级为可选增强
- `writing/SKILL.md` 与 `02-write-draft.md`：写稿加载指令显式要求逐条应用 style_anchor

---

## v1.2.2 (2026-08-02)

### Added
- `md2content.js`：支持 `showcase` 类型解析（`pageNum`/`sectionTitle`/`footerText`/`items[{image, title, desc}]`），写稿数据区直接写 showcase 不再需要手动补 content.json
- `md2content.js`：`showcase` 加入自动命名表，未指定 `filename` 时生成 `{seq}-{abbr}-{num}-showcase`
- `batch-screenshot.js`：封面新增 `logoDecor` 贴纸装饰变量注入（`LOGO_DECOR`），支持字符串或 `{icon, rotate, size}` 对象，固定旋转序列保证可复现，未配置时输出空串不影响现有模板
- `md2content.js`：cover 分支透传 `logoDecor` 字段，写稿数据区配置后直达 content.json
- `writing/manuscript-template.md`：Slides 数据区补 `logoDecor` 字段示例与写稿规范说明

### Changed
- `md2content.js`：底图 `bgImage` 的 abbr 优先复用封面配图 filename 中的缩写（如 `008-method-01-cover` → `008-method-cover-bg.png`），保证底图与配图命名一致；filename 命名规则不变

---

## v1.2.1 (2026-07-28)

### Fixed
- `batch-screenshot.js`：截图前用 `requestAnimationFrame` 替代固定 `sleep(200)`，确保底图加载后浏览器完成渲染再截图，修复封面底部装饰线渲染不全的问题
- `md2content.js`：compare items 支持 JS 对象字面量格式 `{label, value}`，不再因 key 没加引号而解析失败

### Changed
- `batch-screenshot.js`：截图渲染等待使用 `requestAnimationFrame × 2` 替代固定 sleep，自适应当前机器渲染速度

### Docs
- README 购买链接从爱发电改为面包多

---

## v1.2.0 (2026-07-26)

### Added
- 路径解析增加 `fs.realpathSync` 降级支持，修复 Windows 环境 symlink 路径解析失败
- `md2content.js`：compare 的 `leftItems`/`rightItems` 自动兼容纯字符串格式（简写无需 `{label, value}`）
- `md2content.js`：重复运行时保留已有底图文件名，不覆盖用户放置的底图
- 新增 `writing/manuscript-template.md` 完整稿子格式模板（含 Slides 数据区全类型示例）

### Fixed
- 修复 `batch-screenshot.js`：`BADGE_TEXT_COLOR` 被 `BADGE_NAME_COLOR` 意外覆盖的 bug
- 修复 `templates/default/` 中 6 个模板 `background: {{GRID_OVERLAY}}` 缺少分号的 CSS 错误

### Changed
- `batch-screenshot.js`：网格覆盖层支持按类型覆写（`text`/`data` 类型用亮网格）
- `batch-screenshot.js`：`FOOTER_COLOR` 支持按类型覆写（`type.footerText` > 全局 `textMuted`）

### Docs
- 根目录新增 `AGENTS.md` 项目知识库（OpenCode 自动加载）
- screenshot SKILL：前置依赖、模板目录、`vsText` 字段说明更新
- 配图流程命令补全 `--style-pack` 参数
- README 目录结构更新

---

## v1.1.0 (2026-07-26)

### Added
- 截图脚本 `batch-screenshot.js` 集成 ComfyUI 封面底图自动生成（风格包配了 `coverBg` 即启用，已有底图自动跳过）
- `md2content.js` 输出 `bgPrompt` 到 content.json，供截图脚本自动读取
- 写稿 Skill 启动时自动加载风格包的 `writing` 段，AI 写稿直接遵循风格包约束
- CHANGELOG 首次建立

### Changed
- 写稿流程约束来源从 `config.yaml` 改为风格包 `writing` 段（风格包是单一配置来源）
- SKILL.md 精简：移除 ComfyUI 启动协议，脚本已内置自动启动

### Removed
- SKILL.md 中 ComfyUI 手动操作备选方案（脚本已覆盖所有场景）
- `generate-cover-bg.js` 移出版本管理（私有脚本，.gitignore）

---

## v1.0.0 (2026-07)

### Added
- 项目首次发布
- 7 套默认 HTML 模板（cover/content/showcase/compare/text/data/flow）
- `batch-screenshot.js` 截图脚本（template / direct 双模式）
- `generate-cover-bg.js` ComfyUI 底图生成脚本
- `md2content.js` 稿件 slides → content.json 转换
- Writing Skill（写稿 + 配图全流程）
- Screenshot Skill（配图截图工具）
- 默认风格包 `default.json`
