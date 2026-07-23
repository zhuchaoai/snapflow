# 03 — 配图生成流程

> content.json 完整格式见 `content.json.example`。以下只列出流程说明和布局速查。

---

## 批量出图流程（多篇集中配图）

Phase 1 写稿完成后，所有稿件已定稿。按以下步骤执行。

### 1️⃣ 前置检查

- 确认所有稿件已完成定稿
- 确认所有 `Images/` 目录已创建
- 确认当期模板版本一致

### 2️⃣ 生成 content.json

解析各篇稿件的 slides 数据区，生成 content.json：

```bash
node batch-screenshot.js --mode template --config "篇目/Images/content.json"
```

### 3️⃣ 封面底图生成（如需）

如需 AI 生成封面底图，按以下步骤：

- 从稿件 slides 数据区读取 cover.bgPrompt 字段
- 使用你习惯的 AI 绘图工具生成底图
- 输出到 `{篇目}/Images/{篇序号}-cover-bg.png`

### 4️⃣ 批量截图

```bash
node batch-screenshot.js --mode template --config "篇目/Images/content.json"
```

筛选模式（只改几张图时）加 `--files "篇名-02,篇名-04"`。

### 5️⃣ 截图后检查

- HTML 和 PNG 都生成成功
- 封面有 bgImage 底图效果
- 内容页垂直居中
- 保留 HTML 文件

### 6️⃣ 审核 → 修改 → 发布

呈现截图 → 等待用户反馈 → 修改后重新截图 → 发布。

---

## 布局选择速查

| 布局 | type 值 | 适用场景 |
|:----|:--------|:---------|
| 封面 | `cover` | 每期必须有一张 |
| 卡片网格 | `content` | 并列要点、多卡片 |
| 对比方案 | `compare` | 改造前后/AB方案对比 |
| 步骤流程 | `flow` | 纵向步骤串联 |
| 文字段落 | `text` | 故事、举例、引用 |
| 数据展示 | `data` | 大数字统计 |

> 每种 type 的字段结构不一样，写 content.json 前对照 `content.json.example` 查看字段说明。

---

## 关联

- [02-write-draft](./02-write-draft) — 配图素材来源（slides 数据区）
- `content.json.example` — content.json 字段定义
- `templates/` — 各类型配图模板
