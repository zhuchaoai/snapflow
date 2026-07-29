# Changelog

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
