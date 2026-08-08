/**
 * rewrite.js — 改写器引擎
 *
 * 职责（方案A：脚本组装，AI执行）：
 *   1. 读源稿（正文 + slides）
 *   2. 加载平台套件 platform.json
 *   3. 把平台规则组装成给 AI 的改写指令
 *   4. 输出「改写任务包」到 Distribute/{platform}/_task.md
 *      → 由 skill 里的 AI agent 读取并执行改写
 *
 * 脚本本身不调用 AI。
 *
 * 用法:
 *   node rewrite.js --platform toutiao --md "篇目/Manuscript/稿件.md"
 *   node rewrite.js --list
 */
const fs = require('fs');
const path = require('path');
const { parseManuscript } = require('./slides-parser.js');

function getArg(key, def) {
  const i = process.argv.indexOf(key);
  return i === -1 ? def : process.argv[i + 1] ?? def;
}

const PLATFORMS_DIR = path.resolve(__dirname, 'platforms');

function listPlatforms() {
  if (!fs.existsSync(PLATFORMS_DIR)) return [];
  return fs.readdirSync(PLATFORMS_DIR)
    .filter(d => fs.existsSync(path.join(PLATFORMS_DIR, d, 'platform.json')));
}

function loadPlatform(name) {
  const p = path.join(PLATFORMS_DIR, name, 'platform.json');
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

/** 把平台规则拼成给 AI 的自然语言改写指令 */
function buildRewriteInstruction(profile, source, exampleContent) {
  const r = profile.rewrite;
  const lines = [];

  lines.push(`# 改写任务：小红书 → ${profile.displayName}`);
  lines.push('');
  lines.push('把下面的源稿改写成' + profile.displayName + '格式。不改内容核心，按平台规则调整呈现方式。');
  lines.push('');

  lines.push('## 标题规则');
  lines.push(`- 字数上限：${r.title.maxLen} 字`);
  if (r.title.removeEmoji) lines.push('- 去掉所有 emoji');
  lines.push('- 标题公式：' + r.title.formulas.join(' 或 '));
  if (r.title.examples?.length) {
    lines.push('- 改写示例：');
    r.title.examples.forEach(e => lines.push(`  - ${e}`));
  }
  lines.push('');

  lines.push('## 正文规则');
  lines.push(`- 目标字数：${r.body.targetLength} 字（${r.body.note}）`);
  lines.push(`- 段落：${r.body.paragraph}`);
  if (r.body.opening) lines.push(`- 开头：${r.body.opening}`);
  lines.push(`- 分段方式：${r.body.sectionStyle}（${r.body.sectionNote}）`);
  lines.push(`- emoji：${r.body.emojiNote}`);
  lines.push(`- 加粗：${r.body.boldPolicy}`);
  if (r.body.ending) lines.push(`- 结尾：${r.body.ending}`);
  lines.push('');

  const f = r.format;
  if (f) {
    lines.push('## 结构骨架（硬约束，禁止漂移）');
    lines.push(`- ${f.note}`);
    if (exampleContent) {
      lines.push('- 下面的【结构样板】是成稿示例：逐字段复制其骨架（frontmatter 字段/小标题结构/AI 声明/slides 结构），只替换内容');
    } else if (f.exampleFile) {
      lines.push(`- 先读同目录的 \`${f.exampleFile}\`，逐字段复制其结构骨架，只替换内容`);
    }
    if (f.frontmatter?.length) {
      lines.push(`- frontmatter 必含字段：${f.frontmatter.join('、')}`);
    }
    if (f.headingStyle) {
      lines.push(`- 小标题用 \`${f.headingStyle}\` 一级：${f.headingNote}`);
    }
    if (f.subsectionCount) {
      lines.push(`- 小标题数量：${f.subsectionCount.min}-${f.subsectionCount.max} 个（${f.subsectionNote}）`);
    }
    if (f.requireAIDeclaration) {
      lines.push(`- 文末必须保留『AI 参与：…』声明行（${f.aiDeclarationNote}）`);
    }
    lines.push('');
    if (exampleContent) {
      lines.push('【结构样板】');
      lines.push('');
      lines.push('```markdown');
      lines.push(exampleContent.trim());
      lines.push('```');
      lines.push('');
    }
  }

  lines.push('## 内容红线（必须遵守）');
  r.redlines.forEach(x => lines.push(`- ${x}`));
  lines.push('');

  lines.push('## 配图规则');
  lines.push(`- ${profile.screenshot.keepNote}`);
  lines.push(`- 尺寸：${profile.screenshot.width}×${profile.screenshot.height}（${profile.screenshot.aspectRatio} 横图）`);
  lines.push('');

  const s = profile.slides;
  lines.push('## Slides 数据区生成规则（配图数据）');
  lines.push(`- 图片数量：最多 ${s.maxImages} 张（${s.note}）`);
  lines.push(`- 优先类型：${s.preferTypes.join('、')}`);
  lines.push(`- 封面：${s.coverNote}`);
  lines.push(`- 标题：${s.titlePolicy}`);
  if (s.yamlOnly) {
    lines.push(`- 格式：必须 YAML（assetType: + - type: xxx 逐行）——${s.yamlNote}`);
    lines.push('  ⚠ 下方"源稿 Slides 数据"是 JSON 仅供提炼参考，禁止照抄为输出格式');
  }
  if (s.bodyImageNote) lines.push(`- 正文配图（发布时）：${s.bodyImageNote}`);
  lines.push('- 生成的 Slides 数据区嵌入改写后的稿件 .md 末尾（```slides 代码块），格式与主稿件一致');
  lines.push('');

  lines.push('## 你要产出的内容（两部分，都写进一个 .md 文件）');
  lines.push('1. **改写后的正文** — 按上面标题/正文规则改写');
  lines.push('2. **头条号专属 Slides 数据区** — 按 Slides 规则重新生成（不照搬源稿 Slides）');
  lines.push('');
  lines.push('输出文件：`稿件.md`（与本任务包同目录）');
  lines.push('');

  lines.push('---');
  lines.push('');
  lines.push('## 源稿正文');
  lines.push('');
  lines.push(source.body);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 源稿 Slides 数据（仅供提炼参考，不要照搬）');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(source.slides.items, null, 2));
  lines.push('```');

  return lines.join('\n');
}

function main() {
  if (process.argv.includes('--list')) {
    const list = listPlatforms();
    console.log(list.length ? '可用平台：\n' + list.map(p => '  - ' + p).join('\n') : '无可用平台套件（platforms/ 为空，需购买平台包）');
    return;
  }

  const platform = getArg('--platform', null);
  const mdPath = getArg('--md', null);

  if (!platform || !mdPath) {
    console.error('用法: node rewrite.js --platform <平台> --md <稿件.md>');
    console.error('      node rewrite.js --list');
    process.exit(1);
  }
  if (!fs.existsSync(mdPath)) {
    console.error(`✗ 稿件不存在: ${mdPath}`);
    process.exit(1);
  }

  const profile = loadPlatform(platform);
  if (!profile) {
    console.error(`✗ 平台套件不存在: ${platform}（需购买对应平台包，放入 platforms/${platform}/）`);
    process.exit(1);
  }

  const source = parseManuscript(mdPath);

  // 读取平台样板（如有），嵌入任务包供 AI 复制结构骨架
  const exampleFile = profile.rewrite?.format?.exampleFile;
  let exampleContent = null;
  if (exampleFile) {
    const exPath = path.join(PLATFORMS_DIR, platform, exampleFile);
    if (fs.existsSync(exPath)) exampleContent = fs.readFileSync(exPath, 'utf-8');
  }

  // 输出目录: 稿件同级的 Distribute/{platform}/
  const articleDir = path.dirname(path.dirname(mdPath));
  const outDir = path.join(articleDir, 'Distribute', platform);
  fs.mkdirSync(outDir, { recursive: true });

  const instruction = buildRewriteInstruction(profile, source, exampleContent);
  const taskPath = path.join(outDir, '_task.md');
  fs.writeFileSync(taskPath, instruction, 'utf-8');

  console.log(`✓ 改写任务包已生成: ${taskPath}`);
  console.log(`  平台: ${profile.displayName} | 源稿 slides: ${source.slides.items.length} 张`);
  console.log(`  下一步: AI agent 读取 _task.md 执行改写 → 输出 ${path.join(outDir, '稿件.md')}`);
}

main();
