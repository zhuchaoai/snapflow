# 02 — 写稿流程

---

## Step 1 — 选题确认

从选题库或用户口述中确定本期方向，等待用户确认。

## Step 2 — 搜集资料

执行 `/query` 查询本地 Wiki + Web 搜索补充素材。

## Step 3 — 写初稿（结构化输出）

遵循 `config.yaml` 中的内容预设（字数、emoji 限制、语气）。输出完整文稿。

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

````
```slides
# 封面
- type: cover
  filename: {篇序号}-{关键词}-01-cover
  title: "..."
  subtitle: "..."
  tagline: "..."
  badges: ["A", "B"]
  bgPrompt: "底图生成 prompt"

# 内容页
- type: content | data | compare | flow | text
  filename: {篇序号}-{关键词}-02-xxx
  pageNum: "01"
  sectionTitle: "..."
  # 按各 type 的具体字段填写
```
````

> 具体字段结构见 `screenshot` skill 的 `content.json.example`。

### bgPrompt 编写规则

四部分拼接，不可遗漏：

```
[主题元素 2-3句] + [色系一致] + [高质感] + [元素≤25%]
```

### 初稿自检流程

一次编写完成后，执行以下两步：

1. **第一次通读修改**：从头到尾读一遍，找逻辑漏洞、语感别扭、结构问题，修改
2. **第二次通读修改**：再读一遍，找上一轮漏掉的细节——用词精准度、前后一致性、slides数据区字段是否完整

两次通读+两次修改后，才算初稿完成，进入 Step 4。

## Step 4-6 — 审核 → 修改 → 定稿

- 呈现完整文稿 → 等待用户反馈
- 按反馈修改
- 用户确认定稿

---

## 关联

- [03-generate-images](./03-generate-images) — 定稿后的配图流程
