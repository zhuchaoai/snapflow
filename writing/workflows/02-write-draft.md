# 02 — 写稿流程

---

## Step 1 — 选题确认

从选题库或用户口述中确定本期方向，等待用户确认。

## Step 2 — 搜集资料

执行 `/query` 查询本地 Wiki + Web 搜索补充素材。

如果本期主题与知识库已有报告相关（如方法论、架构决策、踩坑记录），读到报告后再写稿。报告中的数据和案例优先采用，不要自己编。

## Step 3 — 写初稿（结构化输出）

**写稿前置条件 — 目录检查：**
本期目录必须存在 `{篇序号}-{主题关键词}/Manuscript/`。
- 不存在 → 先创建目录再写稿
- 已存在 → 直接写稿

任何时候都不把稿件写在本期目录之外。目录结构遵循文件命名规范（见下文）。

严格遵循已加载的风格包 `writing` 段中的全部约束（标题字数、格式、语气、emoji 限制、anti-AI slop 规则、hashtags、**style_anchor 五条风格锚**等）。**style_anchor 写稿时逐条对照**：开头直接进场景、数字是骨架、转折有人物、金句带情绪、收尾给行动。
**风格基准唯一**：风格锚点是《小红书配文编写规范》中的 003 样板稿。写稿只参照该样板，**禁止参照任何其他期次的稿件作为格式/风格基准**（其他期次是旧规则时代的产物，格式已过时）。用户提到"参考某期"时，如非 003，先提示用户规范已更新，再按规范执行。
**素材先行 + 存疑标记**：写稿前先向用户确认本期素材（发生了什么/关键数字/谁说了什么），素材未确认前不硬写叙事细节。写稿时使用非素材来源的细节（对话/数字/场景），该句后标注 [存疑]，交用户审稿重点检查。
同时遵循风格包 `quality` 段中的质量标准（数据准确性、逻辑一致性、素材优先级、结构要求）。
如有 `writing.writingRules` 外部规则文件路径，一并读取执行。
输出完整文稿。

### 输出格式

稿件必须包含三大区块，缺一不可：

1. **YAML frontmatter** — 页面元数据（title/status/created）
2. **正文** — 给人读的内容、标签
3. **slides 数据区** — 给脚本读，自动生成配图

### 文件命名规范

每期内容独立一个目录：

```
{品牌名}/
├── {篇序号}-{主题关键词}/
│   ├── Manuscript/
│   │   └── {篇序号}-{主题关键词}.md   ← 与文件夹名一致
│   └── Images/
│       ├── content.json
│       ├── {篇序号}-{关键词}-01-cover.png
│       ├── {篇序号}-{关键词}-02-xxx.png
│       └── {篇序号}-{关键词}-cover-bg.png
```

命名规则：
- **稿件文件** = `{篇序号}-{主题关键词}.md`（如 `001-python-intro.md`），禁止使用通用名
- **目录** = `{篇序号}-{主题关键词}`（与稿件文件名一致）
- **配图文件** = `{篇序号}-{关键词}-{图片序号}-{描述}.png`
- **content.json** = 固定放在 `Images/` 目录下

### slides 数据区格式

稿件中必须包含 slides 数据区（写在正文下方）。完整模板见 `writing/manuscript-template.md`，此处只列速查。

**封面标题自动高亮规则**：cover 的 `title` 和 `subtitle` 中，各选 1-2 个核心词用 `<em>核心词</em>` 包起来，位置不固定，根据语义判断哪个词最该被强调。例如：

```
title: 删两行代码，<em>花了俩小时</em>
subtitle: <em>Windows</em> 用户的开发地狱
```

高亮词自动渲染为金色渐变。如果整个句子无需强调也可以不加 `<em>`。

常用类型：

| 类型 | 用途 | 关键字段 |
|:----|:-----|:---------|
| `cover` | 封面 | `title`, `subtitle`, `tagline`, `badges`(带emoji), `bgPrompt` |
| `content` | 卡片 | `pageNum`, `sectionTitle`, `cards[{icon,title,desc}]` |
| `data` | 数据 | `pageNum`, `sectionTitle`, `stats[{value,label,highlight}]` |
| `text` | 文字 | `pageNum`, `sectionTitle`, `lines[{text,highlight}]` |
| `compare` | 对比 | `pageNum`, `sectionTitle`, `leftItems/rightItems`, `summaryText` |
| `flow` | 流程 | `pageNum`, `sectionTitle`, `steps[{num,title,desc}]` |
| `showcase` | 截图展示 | `pageNum`, `sectionTitle`, `items[{image,title,desc}]` |

> 每种 type 的完整字段结构 → 打开 `writing/manuscript-template.md` 直接复制使用。
> content.json 字段定义 → 查看 `content.json.example`。

### bgPrompt 编写规则

四部分拼接，不可遗漏：

```
[主题元素 2-3句] + [色系一致] + [高质感] + [元素≤25%]
```

### 初稿自检流程

一次编写完成后，执行以下三步：

1. **第一次通读修改**：从头到尾读一遍，找逻辑漏洞、语感别扭、结构问题，修改
2. **第二次通读修改**：再读一遍，找上一轮漏掉的细节——用词精准度、前后一致性、slides数据区字段是否完整
3. **AI 标识行核验**：对比正文中的 `🤖 AI 参与：...` 行是否与风格包 `writing.ai_label` 字段 **完全一致**。不一致则替换为风格包的值，不可擅自修改措辞

**质量自检（风格包 quality 段）：**

- [ ] 正文第一行是标题吗？与 frontmatter title 一致
- [ ] 稿子文件存放在本期目录 `{序号}-{主题}/Manuscript/` 下，不在外面
- [ ] 数据是真实的还是编的？编的就删掉或模糊化
- [ ] 对比页的两边是在同一维度上对比的吗？不在同一维度就调整
- [ ] 举例跟论点是匹配的吗？有没有张冠李戴？
- [ ] 正文是段落叙事为主（2-4 句一段），不是带 → 的提纲列表？
- [ ] 素材是先用报告/知识库里的真实数据，还是自己编的？优先用真实的

三项检查 + 质量自检全部完成后，才算初稿完成，进入 Step 4。

## Step 4-6 — 审核 → 修改 → 定稿

- 呈现完整文稿 → 等待用户反馈
- 按反馈修改
- 用户确认定稿

---

## 正文改稿 → Slides 同步协议（MUST-FOLLOW）

用户说「正文我改好了，更新Slides区」时，执行以下步骤，**逐条完成不可跳过**：

### STEP 1 — 读取当前正文
`Read` 完整稿件文件，获取最新正文内容。

### STEP 2 — 逐字段核对清单

将正文与 Slides 数据区逐项比对。核验每一项：

| 核验项 | 对照正文位置 | Slides 字段 |
|--------|-------------|-------------|
| 封面标题核心词高亮 | 第一行标题 | `cover.title` |
| 封面副标题核心词高亮 | 第二行 | `cover.subtitle` |
| 封面标签行 | 正文核心观点 | `cover.tagline` |
| 封面徽标 | 正文关键词 | `cover.badges` |
| 内容页章节标题 | 对应段落中心句 | `content.sectionTitle` |
| 卡片标题/描述 | 段落要点 | `content.cards[].title/desc` |
| 数据页数值/标签 | 正文提到的数据 | `data.stats[].value/label` |
| 文字行内容 | 正文金句/结论 | `text.lines[].text` |
| 对比项 | 正文对比内容 | `compare.leftItems/rightItems` |
| 总结语 | 正文结论 | `compare.summaryText` |
| 流程步骤 | 正文步骤描述 | `flow.steps[].title/desc` |
| AI 标识行 | 正文末尾 | 必须与风格包 `writing.ai_label` 完全一致 |
| 评论区钩子 | 评论区区域 | 评论区文字（独立区域，不映射 Slides） |

### STEP 3 — 更新 Slides 数据

找出所有不匹配项，逐一修正 Slides 数据区。**每改一处，心中默念改了哪处**。

### STEP 4 — 自检确认

修正后，再通读一遍正文，确认：
- [ ] 每个 Slide 的文字内容都能在正文中找到对应
- [ ] 没有遗漏任何用户修改的措辞
- [ ] footerText 与对应段落结论一致
- [ ] 高亮 `<em>` 标注了正确的核心词

### STEP 5 — 通知用户

> Slides 已同步完毕。逐项核对清单：
> - [cover] title/subtitle/tagline/badges ✅
> - [content/data/text/compare/flow] 全字段已对齐 ✅
> - footerText 全部与正文一致 ✅
> - AI 标识行已校验 ✅
> 
> 现在跑 md2content + 截图？

用户确认后再执行下一步。

---

## 关联

- [03-generate-images](./03-generate-images) — 定稿后的配图流程
