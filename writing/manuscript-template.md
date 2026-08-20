---
title: "本期标题"
type: manuscript
series: 系列名称
episode: 001
topic: 本期主题
status: draft
created: 2026-07-26
---

## 📝 小红书文案

标题（一行，20字以内，与 frontmatter 的 title 一致，两者都写）

正文段落。叙事为主，2-4 句一段，像人说话。
爆发、转折、金句独立成行。

节奏跟随情绪，参考《小红书配文编写规范》样板稿。

#标签1 #标签2 #标签3

---
## 评论区（自己发）

💬 评论区引导语，留一个开放性问题让读者互动。

---
## Slides数据

```slides
assetType: tool        # tool(技能资产) / identity(人设资产) / life(生命资产)

# ── 封面 ──
- type: cover
  filename: 001-abbr-01-cover
  title: 主标题<em>高亮词</em>     # 选1-2个核心词用<em>包起来，自动金色渐变
  subtitle: <em>副标题</em>高亮词  # 同样支持<em>高亮，位置不固定</em>
  tagline: 标签行
  badges: ["🔥标签1", "📌标签2", "⭐标签3"]   # emoji 自己写，模板不加
  logoDecor: ["⭐", {"icon": "📌", "rotate": 12}, "🎀"]   # 可选：封面 logo 区上方装饰贴纸，每期可换；支持字符串或指定角度/字号的对象
  bgPrompt: "描述画面的英文提示词，传给 ComfyUI 生成底图"

# ── 封面铁律（违反 = 返工） ──
# 1. title/subtitle/tagline 一律禁止手写 <br>：换行由引擎按宽度自动断，AI 手写断点位置不可控
# 2. 封面三行禁止标点（，。！？：；、——）：金句靠空格断句，如「别写人话 写伪代码」；引擎会兜底清洗残留标点
# 3. 金句示例（无标点风格）：「版本号骗不了人」「数据有来源 情绪没来源」「模具造合格品 造不出活人」

# ── 内容卡片 ──
- type: content
  pageNum: "01"
  filename: 001-abbr-02-content
  sectionTitle: "章节标题"
  footerText: "底部脚注"           # 可选，不填则留空
  cards:
    - icon: "⏰"
      title: "卡片标题"
      desc: "卡片描述文字"
    - icon: "💡"
      title: "第二个卡片"
      desc: "描述文字"

# ── 数据展示 ──
- type: data
  pageNum: "02"
  filename: 001-abbr-03-data
  sectionTitle: "数据标题"
  footerText: "底部脚注"
  stats:
    - value: "47%"
      label: "指标名"
      highlight: false      # false=普通, true=金色高亮
    - value: "2.3h"
      label: "另一指标"
      highlight: true

# ── 文字金句 ──
- type: text
  pageNum: "03"
  filename: 001-abbr-04-text
  sectionTitle: "段落标题"
  footerText: "底部脚注"
  lines:
    - text: "普通文字行"
      highlight: false
    - text: "高亮金句"
      highlight: true

# ── 对比页 ──
- type: compare
  pageNum: "04"
  filename: 001-abbr-05-compare
  sectionTitle: "对比标题"
  leftTitle: "方案A"              # 或 leftHeader
  leftItems:
    - {label: "维度", value: "值"}   # 完整格式：label+value
    - "纯字符串"                      # 简写格式：label 自动留空
  rightTitle: "方案B"
  rightItems:
    - {label: "维度", value: "值"}
    - "纯字符串"
  summaryText: "总结语"            # 显示在底部总结框

# ── 流程步骤 ──
- type: flow
  pageNum: "05"
  filename: 001-abbr-06-flow
  sectionTitle: "步骤标题"
  footerText: "底部脚注"
  steps:
    - num: "1"
      title: "第一步"
      desc: "步骤描述"
    - num: "2"
      title: "第二步"
      desc: "步骤描述"

# ── 截图展示（自动拆页，每页最多2张） ──
- type: showcase
  pageNum: "06"
  filename: 001-abbr-07-showcase
  sectionTitle: "展示标题"
  footerText: "底部脚注"
  items:
    - image: "截图文件名.png"
      title: "展示标题"
      desc: "描述"
    - image: "另一张截图.png"
      title: "第二个展示"
      desc: "描述"
```

---

## 写稿规范

- 标题 20字以内，不使用 emoji；title 和 subtitle 各选 1-2 个核心词用 `<em>核心词</em>` 包起来，位置不固定，自动金色渐变
- 正文段落叙事为主（2-4 句一段），爆发/转折/金句独立成行；节奏跟随情绪，参考《小红书配文编写规范》样板稿
- emoji 全文不超过 3 个，放在段落转折处或结论前
- 每篇 1 个主题，不塞多个方向
- badges 的 emoji 自己加，按内容选匹配的图形符号
- logoDecor 可选，不填则封面无贴纸装饰；每期可换不同 emoji 组合
- compare 的 vsText 字段已废弃，自定义文字请用 summaryText
- 所有 filename 需唯一，建议格式：`{序号}-{缩写}-{序号2}-{类型}`
