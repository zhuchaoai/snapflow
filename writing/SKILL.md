---
name: snapflow-writing
description: >
  内容生产全流程 Skill（写稿+配图）。从选题确认到写稿、审核、定稿、批量配图。
  每个节点等待用户确认后才继续。
  配图使用 content.json + template 模式，模板在 `templates/`。
  本 skill 需与 `screenshot` skill 配合使用。
  触发词：写内容、写稿、新一期、出内容、开始写
compatibility: opencode
---

# Snapflow Writing — 内容生产全流程 Skill

## 启动时自动加载

本 Skill 启动时并行读取以下文件，作为上下文：

1. `config.yaml` — 路径、模型、预设等配置
2. `workflows/02-write-draft.md` — 写稿流程详情
3. `workflows/03-generate-images.md` — 配图流程详情

---

## 核心定位

> 一个主题 → 写稿 → 配图 → 多平台产出，一条龙自动完成。

本 Skill 负责**写稿阶段**，配合 `screenshot` skill 完成配图阶段。
每个节点插入人工审核，关键判断留给人，重复劳动交给 AI。

---

## 流程总览

```
选题确认（来自用户或选题库）
    │
    ▼
Phase 1: 顺序写稿
  for 待写篇目:
    ├── 确认写什么 → 搜集资料 → 写稿 → 用户审核 → 定稿
    └── 切换到下一篇
  全部定稿
    │
    ▼
Phase 2: 批量配图（调用 screenshot skill）
  ├── 解析稿件 slides 数据区 → 生成 content.json
  ├── 封面底图生成（如需）
  └── 批量截图 → 用户审图 → 发布
```

## 每篇公式

```
核心公式：一个主题 × 讲清楚 × 让人感受到价值

每篇只有一个主题，标题是什么就讲什么。

开头：吸引注意的钩子
正文：把一件事讲清楚，再让人感受到它的价值
结尾：明确的行动号召或总结
```

## slides 数据区格式速查

稿件中必须包含以下 slides 区块（写在正文下方）：

````
```slides
# 封面
- type: cover
  filename: {篇序号}-{关键词}-01-cover
  title: "..."
  subtitle: "..."
  tagline: "..."
  badges: ["🏷️ 标签1", "🏷️ 标签2"]
  bgPrompt: "底图生成 prompt"

# 内容页
- type: content | data | compare | flow | text
  filename: {篇序号}-{关键词}-02-xxx
  pageNum: "01"
  sectionTitle: "..."
```
````

> 完整字段定义 → 查看 `screenshot` skill 的 `content.json.example`。

### bgPrompt 编写规则

bgPrompt 由四部分拼接，写稿时自动生成：

```
[主题元素 2-3句] + [色系一致] + [高质感] + [元素≤25%]
```

| 部分 | 规则 | 示例 |
|:-----|:-----|:------|
| **① 主题元素** | 2-3句，把什么东西、什么氛围说清楚 | ✅ `A bird weaving a nest from glowing digital code branches` |
| **② 色系一致** | 与品牌色系统一 | `dark background, warm gold accents` |
| **③ 高质感** | 固定描述 | `cinematic lighting, highly detailed texture, premium quality` |
| **④ 元素占比** | 固定描述 | `single focused element occupying less than 25% of frame` |

## 目录结构

```
snapflow/                         ← 项目根目录
├── batch-screenshot.js            ← 截图脚本
├── templates/                     ← 配图 HTML 模板
├── content.json.example           ← content.json 字段定义
├── style-packs/                   ← 风格包
├── demo/                          ← 示例
│
└── writing/                       ← 本 skill
    ├── SKILL.md                    ← 本文件
    ├── config.yaml.example
    └── workflows/
        ├── 02-write-draft.md      ← 写稿流程
        └── 03-generate-images.md  ← 配图流程
```

## 关联

- [[screenshot]] — 配图截图工具（content.json 字段定义、截图脚本用法）
- `workflows/02-write-draft` — 写稿流程详情
- `workflows/03-generate-images` — 配图流程详情
- `config.yaml.example` — 配置模板
