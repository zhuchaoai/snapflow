/**
 * batch-screenshot.js — 批量配图截图脚本
 *
 * 三种模式：
 *   1. template（默认）：读 content.json → 填模板 → 生成 HTML → 截图
 *   2. direct：直接截图指定目录下的现有 HTML 文件
 *   3. 多平台合并：--dirs "platform:inDir:outDir:stylePack,..." 或 --dirs "platform,..."
 *
 * 用法：
 *   node batch-screenshot.js [选项]
 *
 * 选项：
 *   --style-pack style-pack.json  风格包路径或名称（可选，所有配置的单一来源）
 *   --cfg config.yaml             config.yaml 路径（后备，无风格包时使用）
 *   --mode template|direct        模式（默认 template）
 *   --config content.json          content.json 路径（template 模式必填）
 *   --dir ./Images                 HTML 目录（direct 模式必填）
 *   --dirs "platform:in:out:sp,..."  多平台合并截图（四段式）或 --dirs "toutiao,douyin"（自动推导）
 *   --files 01-cover,02-painpoint 只处理指定文件（不含扩展名，修改模式用）
 *   --headless true|false          是否无头模式（默认 true）
 *   --concurrency auto|N           并发截图数（auto=按内存/CPU 自适应，上限 8；默认 1）
 *   --template-dir templates/premium  模板目录（默认 templates/default/，专用模板用此切换）
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const os = require('os');
const yaml = require('js-yaml');
const { exec } = require('child_process');
const { resolveStylePack, recordUsage } = require('./style-pack-resolver.js');

// ─── 参数解析 ────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (key, def) => {
  const idx = args.indexOf(key);
  return idx === -1 ? def : args[idx + 1] ?? def;
};
const hasFlag = (key) => args.includes(key);

const CFG_PATH = getArg('--cfg', null);
const MODE = getArg('--mode', 'template');
const HEADLESS = getArg('--headless', 'true') !== 'false';
const CHANNEL = getArg('--channel', null); // null=Playwright Chromium, "chrome"/"msedge"=系统浏览器
const ONLY_FILES = hasFlag('--files')
  ? (() => {
      const raw = getArg('--files', '').split(',').map(s => s.trim()).filter(Boolean);
      return raw.length === 1 && raw[0] === 'all' ? null : raw;
    })()
  : null;
const CONCURRENCY = getArg('--concurrency', '1');
const DIRS_RAW = getArg('--dirs', null); // 多平台合并截图："platform:inDir:outDir:stylePack,..." 或 "platform,..."

// ─── 路径解析 ──────────────────────────────────────────
let SP_PROJECT_ROOT = null;
function resolveRelPath(relPath) {
  const bases = [__dirname, process.cwd()];
  if (SP_PROJECT_ROOT) bases.push(SP_PROJECT_ROOT);
  // Windows symlink → WSL 场景：对每个 base 也试 realpath
  for (const base of [...bases]) {
    try {
      const real = fs.realpathSync(base);
      if (real !== base) bases.push(real);
    } catch (_) {}
  }
  for (const base of bases) {
    const p = path.resolve(base, relPath);
    if (fs.existsSync(p)) return p;
  }
  return path.resolve(__dirname, relPath);
}

// ─── 模板目录 ──────────────────────────────────────────
const CLI_TEMPLATE_DIR = getArg('--template-dir', null);
const DEFAULT_TEMPLATE_DIR = resolveRelPath('templates/default');
function resolveTemplateDir() {
  let dir = null;
  if (CLI_TEMPLATE_DIR) dir = resolveRelPath(CLI_TEMPLATE_DIR);
  else {
    const cfgDir = getCfgTemplateDir();
    if (cfgDir) dir = resolveRelPath(cfgDir);
  }
  if (dir && fs.existsSync(dir)) return dir;
  if (dir) console.warn(`  ⚠ 模板目录不存在: ${dir}，使用默认模板`);
  if (dir && dir !== DEFAULT_TEMPLATE_DIR) {
    console.warn(`    → 已回退到默认模板: ${DEFAULT_TEMPLATE_DIR}`);
  }
  return DEFAULT_TEMPLATE_DIR;
}

// ─── 颜色预设：中性灰度出厂默认（无品牌色） ───────
const FALLBACK_COLORS = {
  pageBg: '#f0f4f8',
  bottomBar: '#666666, #888888, #888888, #666666',
  pageNum: '#94a3b8',
  sectionTitle: '#1e293b',
  cardBorder: 'rgba(0,0,0,0.08)',
  cardBg: '#ffffff',
  cardTitle: '#1e293b',
  cardDesc: '#64748b',
  footerBorder: 'rgba(0,0,0,0.06)',
  textBody: '#334155',
  textMuted: '#94a3b8',
  textLabel: '#64748b',
  brandColor: '#94a3b8',
  statBorder: '#e2e8f0',
  statBg: '#ffffff',
  statHighlightBorder: '#93c5fd',
  statHighlightBg: 'linear-gradient(135deg, #dbeafe, #eff6ff)',
  statValueColor: '#1e293b',
  statHighlightValueColor: '#2563eb',
  statLabelColor: '#64748b',
  stepCircleBg: 'linear-gradient(135deg, #3b82f6, #60a5fa)',
  stepCircleBorder: '#60a5fa',
  stepTitleColor: '#1e293b',
  stepDescColor: '#64748b',
  stepArrowColor: '#94a3b8',
  pillBorder: '#e2e8f0',
  pillBg: '#f8fafc',
  pillText: '#64748b',
  vsBg: '#cbd5e1',
  vsBorder: '#94a3b8',
  vsText: '#ffffff',
  summaryBorder: '#e2e8f0',
  summaryBg: '#f8fafc',
  summaryText: '#475569',
  textBg: 'rgba(0,0,0,0.03)',
  textBorder: 'rgba(0,0,0,0.08)',
  textColor: '#334155',
  textHighlightColor: '#1e40af',
};

const FALLBACK_TYPOGRAPHY = {
  cover: { title: '96px', subtitle: '64px', tagline: '36px', badge: '32px', brandBar: '26px', brandBadge: '24px', assetType: '28px' },
  content: { pageNum: '28px', sectionTitle: '52px', cardTitle: '36px', cardDesc: '28px', iconSize: '72px', cardRadius: '18px' },
  showcase: { pageNum: '28px', sectionTitle: '52px', cardTitle: '36px', cardDesc: '28px', cardRadius: '18px' },
  text: { pageNum: '28px', sectionTitle: '52px', line: '40px', highlightLine: '42px' },
  data: { pageNum: '28px', sectionTitle: '52px', statValue: '78px', statLabel: '28px' },
  flow: { pageNum: '28px', sectionTitle: '52px', stepTitle: '38px', stepDesc: '28px', stepNum: '26px' },
  compare: { pageNum: '42px', sectionTitle: '52px', headerLabel: '34px', headerSub: '24px', itemLabel: '26px', itemValue: '32px', vsText: '20px', summaryText: '28px' },
};

// ─── Style Pack 加载 ──────────────────────────────────
const SP_PATH = getArg('--style-pack', null);
let SP = null; // 全局风格包对象

function loadStylePack(spPath) {
  if (!spPath) return;
  const absPath = resolveRelPath(spPath);
  if (!fs.existsSync(absPath)) {
    console.warn(`  ⚠ 风格包不存在: ${absPath}，使用默认配置`);
    return;
  }
  try {
    SP = JSON.parse(fs.readFileSync(absPath, 'utf-8'));
    SP_PROJECT_ROOT = path.resolve(path.dirname(absPath), '..');
    console.log(`  ✓ 已加载风格包: ${path.basename(spPath)}`);
  } catch (err) {
    console.warn(`  ⚠ 风格包解析失败: ${err.message}，使用默认配置`);
  }
}

// ─── Config 加载（已弃用）──────────────────────────────
// config.yaml 已移除（2026-08），风格包是唯一配置源；--cfg 保留兼容但只警告
function loadConfig(cfgPath) {
  if (!cfgPath) return;
  console.warn(`  ⚠ --cfg 已弃用（config.yaml 已移除），请改用 --style-pack 指定风格包`);
}

// 从风格包 > 默认值 获取配置（config.yaml 已移除，风格包是唯一配置源）
function getCfgBrandName() {
  return SP?.brand?.name || 'Snapflow';
}
function getCfgPageBg() {
  return SP?.colors?.pageBg || '#f0f4f8';
}
function getCfgBottomBarGradient(type) {
  // 返回纯颜色值（不含 linear-gradient 包装），包装在调用方统一处理
  const typeBar = SP?.colors?.types?.[type]?.bottomBar;
  if (typeBar) return typeBar;
  const spBar = SP?.colors?.bottomBar;
  if (typeof spBar === 'object' && spBar[type]) return spBar[type];
  if (typeof spBar === 'string') return spBar;
  return null;
}
function getCfgTemplateDir() {
  return SP?.paths?.templateDir || null;
}
function getCfgScreenshotWidth() {
  return SP?.screenshot?.width || 1242;
}
function getCfgScreenshotHeight() {
  return SP?.screenshot?.height || 1660;
}
function getCfgMaxShowcaseItems() {
  return SP?.screenshot?.maxShowcaseItems || 2;
}

// ─── ComfyUI 封面底图配置 ────────────────────────────
function getCfgCoverBg() {
  return SP?.coverBg || null;
}

// 默认底部条渐变（按类型，无 CFG 时使用中性灰）
const DEFAULT_BOTTOM_BARS = {
  cover:    '#3b82f6, #60a5fa, #60a5fa, #3b82f6',
  content:  '#0ea5e9, #38bdf8, #38bdf8, #0ea5e9',
  showcase: '#6366f1, #818cf8, #818cf8, #6366f1',
  compare:  '#3b82f6, #60a5fa, #60a5fa, #3b82f6',
  text:     '#0ea5e9, #38bdf8, #38bdf8, #0ea5e9',
  data:     '#6366f1, #818cf8, #818cf8, #6366f1',
  flow:     '#3b82f6, #60a5fa, #60a5fa, #3b82f6',
};

// ─── 按类型读取风格包颜色/排版 ─────────────────────────
// 优先级: SP.colors.types[type][side?][key] > SP.colors.tokens[key] > FALLBACK_COLORS[key]
function getTypeColor(type, key, side) {
  if (SP?.colors?.types?.[type]) {
    if (side && SP?.colors?.types?.[type]?.[side]?.[key] !== undefined)
      return SP?.colors?.types?.[type]?.[side]?.[key];
    if (SP?.colors?.types?.[type]?.[key] !== undefined)
      return SP?.colors?.types?.[type]?.[key];
  }
  return SP?.colors?.tokens?.[key] ?? FALLBACK_COLORS[key];
}

function getTypeTypography(type, key) {
  return SP?.typography?.[type]?.[key] ?? FALLBACK_TYPOGRAPHY[type]?.[key] ?? '';
}

// ─── 工具函数 ────────────────────────────────────────
function replaceVars(template, vars) {
  let html = template;
  for (const [key, val] of Object.entries(vars)) {
    html = html.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val ?? '');
  }
  return html;
}

function hexToRgb(hex) {
  if (!hex || hex[0] !== '#') return [0, 0, 0];
  return [parseInt(hex.slice(1,3), 16) || 0, parseInt(hex.slice(3,5), 16) || 0, parseInt(hex.slice(5,7), 16) || 0];
}

function buildBadgesHTML(badges) {
  if (!badges || !badges.length) return '';
  return badges.map(b => `<span>${b}</span>`).join('\n      ');
}

/**
 * 封面标点清洗（兜底）：title/subtitle/tagline 禁止标点（，。！？：；、——），
 * 残留标点替换为空格。保留 <em> 高亮标签，只清洗文本内容。
 */
function cleanCoverPunct(text) {
  if (!text) return text;
  return text.replace(/[，。！？：；、——…]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ([,.;:!?])/g, '$1') // 保留英文标点（如 "EP.13"）
    .trim();
}

/**
 * 标题智能断行：优先在标点/助词后断，避免断在词中间（如"AI模/型""OpenC/ode"）。
 * 宽度按字符模型估算（中文/全角=1，英文/数字/半角≈0.55），保证每段渲染宽度不超容量。
 * 断点必须落在非字母数字字符之后（英文单词不拆断）；无标点/助词时回退到较靠前位置。
 * maxUnits 由调用方按可用宽度与字号估算（单位=一个全角字符宽）。
 * 支持 <em> 高亮标签：文本与标签拆成 token，断行只作用在文本 token 上，绝不切进标签内部。
 */
function smartBreakTitle(text, maxUnits) {
  if (!text || text.includes('<br')) return text;
  // 拆 token：{tag: '<em>'} 或 {text: '文本'}，保持原文顺序
  const tokens = [];
  let lastIdx = 0;
  for (const m of text.matchAll(/<[^>]+>/g)) {
    if (m.index > lastIdx) tokens.push({ text: text.slice(lastIdx, m.index) });
    tokens.push({ tag: m[0] });
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) tokens.push({ text: text.slice(lastIdx) });

  // 纯文本拼起来做宽度计算（标签不计宽）
  const plain = tokens.filter(t => t.text !== undefined).map(t => t.text).join('');
  const puncts = ['，', '。', '！', '？', '、', '；', '：', '——', '…', ' ', '，'];
  const particles = ['的', '了', '是', '在', '和', '与', '及', '把', '被', '让'];
  const isWordChar = ch => /[A-Za-z0-9]/.test(ch);
  // 字符宽度模型：中文/全角≈0.87（实测 108px 字号中文渲染宽约 94px），半角/英文/数字≈0.48
  const unitOf = ch => isWordChar(ch) || '.,;:!?()[]\'"'.includes(ch) ? 0.48 : 0.87;
  const widthOf = s => [...s].reduce((sum, ch) => sum + unitOf(ch), 0);
  // 短标题（≤8 个全角宽）永不拆行：宁可用大字号，不拆成两行
  if (widthOf(plain) <= 8) return text;
  // 单段即满足容量（含余量）→ 不拆
  if (widthOf(plain) <= maxUnits) return text;

  // 在纯文本上计算断点（plain 中的字符位置）
  const parts = [];
  let rest = plain;
  while (widthOf(rest) > maxUnits) {
    const minUnits = maxUnits * 0.3;
    let cut = -1;
    // 从后往前找断点：段宽不超 maxUnits 且尽量靠后（在标点/助词/单词边界处）
    for (let i = rest.length - 1; i >= 1; i--) {
      const seg = rest.slice(0, i);
      const w = widthOf(seg);
      if (w > maxUnits) continue;
      if (w < minUnits) break;
      const prev = rest[i - 1];
      const next = rest[i] || '';
      if (!puncts.includes(prev)) continue;
      if (prev === ' ') {
        // 空格断点：空格前是字母/数字（如 "136 行"）→ 数字量词连读，不拆
        if (isWordChar(rest[i - 2] || '')) continue;
        cut = i;
        break;
      }
      // 非空格标点断点：后接英文也允许（"行 AI" 处可断）
      if (puncts.includes(prev)) { cut = i; break; }
    }
    if (cut === -1) {
      for (let i = rest.length - 1; i >= 1; i--) {
        const seg = rest.slice(0, i);
        const w = widthOf(seg);
        if (w > maxUnits) continue;
        if (w < minUnits) break;
        const prev = rest[i - 1];
        const next = rest[i] || '';
        if (particles.includes(prev) && !isWordChar(next)) { cut = i; break; }
      }
    }
    if (cut === -1) {
      // 无标点/助词：从后往前找单词边界（字母数字 ↔ 非字母数字转折）
      for (let i = rest.length - 1; i >= 1; i--) {
        const seg = rest.slice(0, i);
        const w = widthOf(seg);
        if (w > maxUnits) continue;
        if (w < minUnits) break;
        if (isWordChar(rest[i - 1]) !== isWordChar(rest[i])) { cut = i; break; }
      }
    }
    if (cut === -1) {
      // 兜底：取最接近 maxUnits 且不超宽的位置
      let best = Math.floor(rest.length / 2);
      for (let i = 1; i < rest.length; i++) {
        if (widthOf(rest.slice(0, i)) > maxUnits) break;
        best = i;
      }
      cut = Math.max(1, best);
    }
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  parts.push(rest);

  // 把纯文本断点映射回 token 流：逐段消费 plain 文本，遇到断点插 <br>
  // 断点若落在文本 token 开头（即 <em> 刚开启、尚未输出任何文本），
  // 说明 <br> 会插进 <em> 内部——此时把 <br> 前移到该 <em> 之前，保持高亮完整
  const out = [];
  let partIdx = 0;
  let partRemain = parts[0] ? parts[0].length : 0;
  const flushBr = () => {
    // 若输出末尾是 <em>（断点落在 em 开标签后、文本前），把 <br> 插到 <em> 前面
    if (out[out.length - 1] === '<em>') {
      out.splice(out.length - 1, 0, '<br>');
    } else {
      out.push('<br>');
    }
  };
  for (const tok of tokens) {
    if (tok.tag !== undefined) {
      out.push(tok.tag);
      continue;
    }
    const t = tok.text;
    let i = 0;
    while (i < t.length) {
      if (partRemain === 0 && partIdx < parts.length - 1) {
        partIdx++;
        partRemain = parts[partIdx].length;
        flushBr();
      }
      const take = Math.min(partRemain, t.length - i);
      out.push(t.slice(i, i + take));
      partRemain -= take;
      i += take;
    }
  }
  return out.join('');
}

// logo 区上部装饰贴纸："⭐" 或 {"icon":"⭐","rotate":-12,"size":"64px"}
function buildLogoDecorHTML(decors) {
  if (!decors || !decors.length) return '';
  const rotSeq = [-14, 10, -8, 16, -12, 8, -6, 14]; // 固定旋转序列（可复现）
  return decors.map((d, i) => {
    const item = (typeof d === 'string') ? { icon: d } : (d || {});
    const icon = item.icon || '';
    if (!icon) return '';
    const rot = item.rotate != null ? item.rotate : rotSeq[i % rotSeq.length];
    const size = item.size || '58px';
    const left = 10 + i * 82;
    const top = 150 - (i % 2) * 55;
    return `<span class="logo-deco" style="left:${left}px; top:${top}px; font-size:${size}; transform:rotate(${rot}deg)">${icon}</span>`;
  }).join('\n      ');
}

function buildCardsHTML(cards) {
  if (!cards || !cards.length) return '';
  return cards.map(c => `
    <div class="card">
      <div class="c-icon">${c.icon || ''}</div>
      <div class="c-title">${c.title || ''}</div>
      <div class="c-desc">${c.desc || ''}</div>
    </div>`).join('\n    ');
}

function buildTextLinesHTML(lines) {
  if (!lines || !lines.length) return '';
  return lines.map(line => {
    if (typeof line === 'string') {
      return `<div class="line">${line}</div>`;
    }
    if (line.highlight) {
      return `<div class="line highlight">${line.text}</div>`;
    }
    return `<div class="line">${line.text}</div>`;
  }).join('\n      ');
}

function buildCompareItemsHTML(items, cls) {
  if (!items || !items.length) return '';
  return items.map(item => {
    if (typeof item === 'string') item = { value: item };
    return `
      <div class="col-item ${cls}">
        <div class="item-label">${item.label || ''}</div>
        <div class="item-value ${cls}">${item.value || ''}</div>
      </div>`;
  }).join('\n      ');
}

function buildStatsHTML(stats) {
  if (!stats || !stats.length) return '';
  return stats.map(s => `
    <div class="stat-item${s.highlight ? ' highlight' : ''}">
      <div class="stat-value">${s.value || ''}</div>
      <div class="stat-label">${s.label || ''}</div>
    </div>`).join('\n    ');
}

function buildStepsHTML(steps) {
  if (!steps || !steps.length) return '';
  return steps.map((s, i) => `
    <div class="step">
      <div class="step-icon">${s.num || i + 1}</div>
      <div class="step-title">${s.title || ''}</div>
      <div class="step-desc">${s.desc || ''}</div>
    </div>${i < steps.length - 1 ? '\n    <div class="step-arrow">↓</div>' : ''}`).join('\n    ');
}

function buildShowcaseItemsHTML(items) {
  if (!items || !items.length) return '';
  return items.map(item => `
    <div class="si-card">
      <div class="si-img" style="background-image: url('${item.image || ''}')"></div>
      <div class="si-body">
        <div class="si-title">${item.title || ''}</div>
        <div class="si-desc">${item.desc || ''}</div>
      </div>
    </div>`).join('\n    ');
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/** 并发数自动检测：按空闲内存 + CPU 核数自适应 */
function decideConcurrency(arg) {
  if (arg && arg !== 'auto' && arg !== '1') return Math.min(parseInt(arg) || 1, 8);
  if (arg === 'auto' || !arg) {
    const memGB = os.totalmem() / (1024 ** 3);
    const freeGB = os.freemem() / (1024 ** 3);
    const cpuCount = os.cpus().length;
    const memLimit = memGB < 8 ? 2 : memGB < 16 ? 3 : memGB < 24 ? 5 : 8;
    const cpuLimit = Math.max(2, Math.floor(cpuCount / 2));
    const freeLimit = Math.max(1, Math.floor(freeGB / 0.5));
    const c = Math.min(memLimit, cpuLimit, freeLimit, 8);
    return c;
  }
  return 1;
}

// ─── ComfyUI 封面底图生成 ────────────────────────────
// 判断逻辑：
//   bgImage 已存在 → 跳过
//   风格包无 coverBg → 跳过（无 ComfyUI 环境）
//   有 coverBg → 检查 ComfyUI → 未运行且配置了 startCmd 则启动 → 提交 → 轮询 → 拷贝

async function ensureComfyUI(coverBg) {
  const url = coverBg.comfyui?.url || 'http://127.0.0.1:8188';
  // 先检查是否已运行
  try {
    const res = await fetch(url + '/system_stats');
    if (res.ok) { return true; }
  } catch {}
  if (!coverBg.startCmd) { return false; }
  console.log('  → ComfyUI 未运行，启动中...');
  try {
    // 用 exec 启动持久进程，不等待退出（ComfyUI 不会自己退出）
    const proc = exec(coverBg.startCmd, { windowsHide: true });
    proc.unref();
    // 等待就绪：20s→25s→25s（开机后首次启动 ComfyUI 很慢，原 10s 轮询不够）
    const waits = [20000, 25000, 25000];
    for (let i = 0; i < waits.length; i++) {
      await sleep(waits[i]);
      try {
        const res = await fetch(url + '/system_stats');
        if (res.ok) {
          // 等 2 秒确保提交接口就绪，再返回 true
          await sleep(2000);
          return true;
        }
      } catch {}
    }
  } catch {}
  return false;
}

async function submitCoverGeneration(coverBg, bgPrompt) {
  const url = coverBg.comfyui?.url || 'http://127.0.0.1:8188';
  const ckptName = coverBg.comfyui?.checkpoint || '';
  if (!ckptName) { return null; }
  const params = coverBg.comfyui?.params || { steps: 25, cfg: 7, sampler_name: 'euler', scheduler: 'normal' };
  const negative = coverBg.comfyui?.negativePrompt || '';
  const prompt = bgPrompt || 'dark background, minimalist composition';
  const seed = Math.floor(Math.random() * 1000000000);

  const payload = {
    prompt: {
      "3": {
        "class_type": "KSampler",
        "inputs": {
          "seed": seed,
          "steps": params.steps || 25,
          "cfg": params.cfg || 7,
          "sampler_name": params.sampler_name || 'euler',
          "scheduler": params.scheduler || 'normal',
          "denoise": 1,
          "model": ["4", 0],
          "positive": ["6", 0],
          "negative": ["7", 0],
          "latent_image": ["5", 0]
        }
      },
      "4": { "class_type": "CheckpointLoaderSimple", "inputs": { "ckpt_name": ckptName } },
      "5": { "class_type": "EmptyLatentImage", "inputs": { "width": 1242, "height": 1660, "batch_size": 1 } },
      "6": { "class_type": "CLIPTextEncode", "inputs": { "text": prompt, "clip": ["4", 1] } },
      "7": { "class_type": "CLIPTextEncode", "inputs": { "text": negative, "clip": ["4", 1] } },
      "8": { "class_type": "VAEDecode", "inputs": { "samples": ["3", 0], "vae": ["4", 2] } },
      "9": { "class_type": "SaveImage", "inputs": { "filename_prefix": "ComfyUI", "images": ["8", 0] } }
    }
  };

  try {
    const res = await fetch(url + '/prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.prompt_id;
  } catch { return null; }
}

async function pollCoverGeneration(coverBg, promptId) {
  const url = coverBg.comfyui?.url || 'http://127.0.0.1:8188';
  const check = async () => {
    try {
      const res = await fetch(url + `/history/${promptId}`);
      if (!res.ok) return null;
      const data = await res.json();
      return data[promptId] || null;
    } catch { return null; }
  };
  const waits = [35000, 15000, 15000];
  for (let i = 0; i < waits.length; i++) {
    console.log(`    等${waits[i] / 1000}秒...`);
    await sleep(waits[i]);
    const result = await check();
    if (result?.status?.completed) return result;
    if (i < waits.length - 1) console.log('    未完成');
  }
  return null;
}

function copyCoverOutput(historyResult, outDir, bgImage) {
  if (!bgImage) return false;
  const outputs = historyResult.outputs;
  if (!outputs) return false;
  for (const nodeId of Object.keys(outputs)) {
    const node = outputs[nodeId];
    if (node.images && node.images.length > 0) {
      const img = node.images[0];
      const comfyDir = getCfgCoverBg()?.outputDir || '';
      if (!comfyDir) return false;
      const srcPath = path.join(comfyDir, img.filename);
      const dstPath = path.join(outDir, bgImage);
      if (fs.existsSync(srcPath)) {
        fs.copyFileSync(srcPath, dstPath);
        return true;
      }
    }
  }
  return false;
}

async function generateCoverBackgrounds(config, articleDir) {
  const coverBg = getCfgCoverBg();
  if (!coverBg) return;
  const outDir = path.resolve(articleDir, config.outputDir);
  for (const img of config.images) {
    if (img.type !== 'cover') continue;
    if (!img.bgImage) continue;
    const bgPath = path.join(outDir, img.bgImage);
    if (fs.existsSync(bgPath)) {
      console.log(`  → 底图已存在，跳过: ${img.bgImage}`);
      continue;
    }
    console.log(`  → 生成封面底图: ${img.bgImage}`);
    const ready = await ensureComfyUI(coverBg);
    if (!ready) {
      console.log(`  ⚠ ComfyUI 不可用，封面使用渐变背景兜底`);
      continue;
    }
    const promptId = await submitCoverGeneration(coverBg, img.bgPrompt);
    if (!promptId) {
      console.log(`  ⚠ 底图提交失败，封面使用渐变背景兜底`);
      continue;
    }
    console.log(`    已提交，prompt_id: ${promptId}`);
    const result = await pollCoverGeneration(coverBg, promptId);
    if (!result) {
      console.log(`  ⚠ 底图生成超时，封面使用渐变背景兜底`);
      continue;
    }
    const copied = copyCoverOutput(result, outDir, img.bgImage);
    if (copied) {
      console.log(`  ✓ 底图已生成: ${img.bgImage}`);
    } else {
      console.log(`  ⚠ 底图文件拷贝失败，封面使用渐变背景兜底`);
    }
  }
}

// ─── Showcase 自动拆分（单页最多 2 项，超出自动拆页） ──
function expandShowcaseImages(images) {
  if (!images) return [];
  const expanded = [];
  for (const img of images) {
    if (img.type === 'showcase' && img.items && img.items.length > 2) {
      const chunks = [];
      for (let i = 0; i < img.items.length; i += 2)
        chunks.push(img.items.slice(i, i + 2));
      chunks.forEach((chunk, ci) => {
        expanded.push({
          ...img,
          filename: ci === 0 ? img.filename : `${img.filename}-${ci + 1}`,
          items: chunk
        });
      });
    } else {
      expanded.push(img);
    }
  }
  return expanded;
}

// ─── 前置校验 ─────────────────────────────────────────
function validateConfig(config, articleDir) {
  const tplDir = resolveTemplateDir();
  const outDir = path.resolve(articleDir, config.outputDir);
  let errors = [];

  // 1. 模板目录是否存在
  if (!fs.existsSync(tplDir)) {
    errors.push(`✗ 模板目录不存在: ${tplDir}`);
  }

  for (const img of config.images) {
    const type = img.type || 'cover';

    // 2. 模板文件是否存在
    const templatePath = path.join(tplDir, `${type}.html`);
    if (!fs.existsSync(templatePath)) {
      errors.push(`✗ 模板文件不存在: ${templatePath}（${img.filename}）`);
    }

    // 3. cover 必填字段
    if (type === 'cover') {
      if (!img.title) errors.push(`✗ ${img.filename}: cover 缺少 title`);
      if (!img.subtitle) errors.push(`✗ ${img.filename}: cover 缺少 subtitle`);

      // 4. bgImage 自动部署
      if (img.bgImage) {
        const bgPath = path.join(outDir, img.bgImage);
        if (!fs.existsSync(bgPath)) {
          const packDefaultBg = getCfgCoverBg()?.defaultImage;
          const defaultBg = packDefaultBg ? resolveRelPath(packDefaultBg) : resolveRelPath('demo/cover-bg-default.png');
          if (fs.existsSync(defaultBg)) {
            fs.copyFileSync(defaultBg, bgPath);
            console.log(`  → 已复制默认底图 -> ${img.bgImage}`);
          } else {
            errors.push(`⚠ ${img.filename}: bgImage 文件不存在: ${img.bgImage}`);
          }
        }
      }
      // 没有 bgImage 字段也没事，渲染时由 fillCoverVars 自动用 CSS 渐变兜底
    }

    // 5. 内容页必填字段
    if (type !== 'cover') {
      if (!img.sectionTitle) errors.push(`✗ ${img.filename}: 缺少 sectionTitle`);
    }
  }

  if (errors.length) {
    console.log('\n── 前置校验 ──────────────────────────');
    errors.forEach(e => console.log(`  ${e}`));
    console.log('');
  }

  return errors.filter(e => e.startsWith('✗')).length === 0;
}

// ─── 类型变量注入函数 ─────────────────────────────────
function camelToUpperSnake(str) {
  return str.replace(/([A-Z])/g, '_$1').toUpperCase();
}
function injectTypography(vars, type, keys) {
  for (const k of keys) vars[camelToUpperSnake(k) + '_FS'] = getTypeTypography(type, k);
}

function fillCoverVars(img, type, vars) {
  // 主/副标题最多两行：按字符数与可用宽度反推字号（两行容量 ≥ 长度 → 字号），再按该字号断行
  // 模板实测：标题容器 = 页面宽 × 90%（private/cover.html .main-title-container width:90%），
  // 中文渲染宽度 ≈ 0.87×字号（非 1×），letter-spacing 2px 补偿后容量系数取 0.95
  const availW = getCfgScreenshotWidth() * 0.9;
  const fitFactor = 0.95;
  const baseTitleFs = parseFloat(SP?.typography?.cover?.title || '72') || 72;
  const baseSubFs = parseFloat(SP?.typography?.cover?.subtitle || '40') || 40;
  // 封面标点清洗（铁律兜底）：先清洗再断行，避免标点影响宽度计算
  const titleRaw = cleanCoverPunct(img.title || '');
  const subRaw = cleanCoverPunct(img.subtitle || '');
  const tagRaw = cleanCoverPunct(img.tagline || '');
  // 断行：从基准字号开始，若行数 >2 则降字号重断（每轮容量增大），直至两行内
  // 容量换算：maxUnits(单位) = 容器px / (字号px × 0.87)，0.87 为中文实测渲染宽系数
  const fitTitle = (fs) => {
    const maxUnits = Math.max(6, Math.floor(availW * fitFactor / (Math.max(24, fs) * 0.87)));
    return smartBreakTitle(titleRaw, maxUnits);
  };
  const fitSub = (fs) => {
    const maxUnits = Math.max(10, Math.floor(availW * fitFactor / (Math.max(20, fs) * 0.87)));
    return smartBreakTitle(subRaw, maxUnits);
  };
  // 自适应降字号仅当风格包 typography.cover.autoFit=true（头条 30 字标题需要）；
  // 小红书 20 字标题断点换行 2 行内，保持基准字号（默认 false 不降）
  const autoFit = SP?.typography?.cover?.autoFit === true;
  let titleFs = baseTitleFs, titleText = fitTitle(titleFs);
  let subFs = baseSubFs, subText = fitSub(subFs);
  if (autoFit) {
    while ((titleText.match(/<br>/g) || []).length + 1 > 2 && titleFs > 28) {
      titleFs -= 4;
      titleText = fitTitle(titleFs);
    }
    // 副标题基准字号 = 主标题最终字号 × 固定比例（风格包基准 44/76≈0.58），主降副必降，视觉层级恒定
    const subRatio = baseSubFs / baseTitleFs;
    subFs = Math.round(titleFs * subRatio);
    subText = fitSub(subFs);
    while ((subText.match(/<br>/g) || []).length + 1 > 2 && subFs > 20) {
      subFs -= 4;
      subText = fitSub(subFs);
    }
  }
  vars.TITLE = titleText;
  vars.SUBTITLE = subText;
  vars.PILL_NAME = img.pill || '';
  vars.TAGLINE = tagRaw;
  vars.BADGES = buildBadgesHTML(img.badges);
  vars.LOGO_DECOR = buildLogoDecorHTML(img.logoDecor || []);
  vars.BG_IMAGE = img.bgImage
    ? `background-image: url('${img.bgImage}');`
    : `background: transparent;`;
  vars.BRAND_BAR = SP?.brand?.tagline || '内容自动化工作流';
  const tc = SP?.colors?.types?.cover || {};
  vars.MAIN_TITLE_COLOR = tc.mainTitle || '#1e293b';
  vars.SUBTITLE_COLOR = tc.subtitle || '#334155';
  vars.TAGLINE_COLOR = tc.tagline || '#64748b';
  vars.BADGE_TEXT_COLOR = tc.badgeText || '#64748b';
  vars.BRAND_BAR_COLOR = tc.brandBar || 'rgba(30,41,59,0.5)';
  vars.ASSET_TYPE_COLOR = tc.assetType || '#94a3b8';
  vars.BRAND_BADGE_BG = tc.badgeBg || 'rgba(255,255,255,0.7)';
  vars.BRAND_BADGE_BORDER = tc.badgeBorder || 'rgba(0,0,0,0.08)';
  vars.BADGE_NAME_COLOR = tc.badgeNameColor || '#334155';
  vars.DIVIDER_GRADIENT = tc.dividerGradient || 'linear-gradient(90deg, #2563eb, rgba(37,99,235,0.2))';
  vars.ACCENT_GRADIENT = tc.titleHl || 'linear-gradient(135deg, #2563eb, #60a5fa)';
  vars.COVER_ACCENT_COLOR = tc.accent || '#f5a623';
  injectTypography(vars, 'cover', ['title', 'subtitle', 'tagline', 'badge', 'brandBar', 'brandBadge', 'assetType']);
  // 用反推字号覆盖（须在 injectTypography 之后），保证主/副标题最多两行不溢出
  vars.TITLE_FS = titleFs + 'px';
  vars.SUBTITLE_FS = subFs + 'px';
}

function fillContentVars(img, type, vars) {
  const colors = img.colors || {};
  vars.PAGE_NUM = img.pageNum || '01';
  vars.SECTION_TITLE = img.sectionTitle || '';
  vars.FOOTER_TEXT = img.footerText || '';
  vars.CARD_BORDER_COLOR = colors.cardBorder || getTypeColor(type, 'cardBorder');
  vars.CARD_BG_COLOR = colors.cardBg || getTypeColor(type, 'cardBg');
  vars.CARD_TITLE_COLOR = colors.cardTitle || getTypeColor(type, 'cardTitle');
  vars.CARD_DESC_COLOR = colors.cardDesc || getTypeColor(type, 'cardDesc');
  vars.CARDS_HTML = buildCardsHTML(img.cards);
  injectTypography(vars, type, ['pageNum', 'sectionTitle', 'cardTitle', 'cardDesc', 'iconSize', 'cardRadius']);
  const a = getTypeColor(type, 'accent');
  const [r,g,b] = hexToRgb(a);
  vars.ACCENT_GRADIENT_VAR = `linear-gradient(135deg, ${a}, rgba(${r},${g},${b},0.53))`;
}

function fillTextVars(img, type, vars) {
  const colors = img.colors || {};
  vars.PAGE_NUM = img.pageNum || '01';
  vars.SECTION_TITLE = img.sectionTitle || '';
  vars.FOOTER_TEXT = img.footerText || '';
  vars.TEXT_BG = colors.textBg || getTypeColor(type, 'textBg');
  vars.TEXT_BORDER = colors.textBorder || getTypeColor(type, 'textBorder');
  vars.TEXT_COLOR = colors.textColor || getTypeColor(type, 'textColor');
  vars.TEXT_HIGHLIGHT_COLOR = colors.textHighlightColor || getTypeColor(type, 'textHighlightColor');
  vars.TEXT_LINES_HTML = buildTextLinesHTML(img.lines);
  injectTypography(vars, type, ['pageNum', 'sectionTitle', 'line', 'highlightLine']);
  const a = getTypeColor(type, 'accent');
  const [r,g,b] = hexToRgb(a);
  vars.HIGHLIGHT_GRADIENT = `linear-gradient(90deg, rgba(${r},${g},${b},0.07), transparent)`;
  vars.ACCENT_GLOW = `rgba(${r},${g},${b},0.25)`;
}

function fillCompareVars(img, type, vars) {
  const colors = img.colors || {};
  vars.PILL_NAME = img.pill || '';
  vars.COMPARE_PAGE_NUM = img.comparePageNum || img.pageNum || '01';
  vars.COMPARE_SECTION_TITLE = img.sectionTitle || '';
  vars.PILL_BORDER = colors.pillBorder || getTypeColor(type, 'pillBorder');
  vars.PILL_BG = colors.pillBg || getTypeColor(type, 'pillBg');
  vars.PILL_TEXT = colors.pillText || getTypeColor(type, 'pillText');
  vars.VS_BG = colors.vsBg || getTypeColor(type, 'vsBg');
  vars.VS_BORDER = colors.vsBorder || getTypeColor(type, 'vsBorder');
  vars.VS_TEXT = colors.vsText || getTypeColor(type, 'vsText');
  vars.SUMMARY_BORDER = colors.summaryBorder || getTypeColor(type, 'summaryBorder');
  vars.SUMMARY_BG = colors.summaryBg || getTypeColor(type, 'summaryBg');
  vars.SUMMARY_TEXT = colors.summaryText || getTypeColor(type, 'summaryText');
  vars.COMPARE_LEFT_HEADER = img.leftHeader || '';
  vars.COMPARE_LEFT_SUB = img.leftSub || '';
  vars.COMPARE_RIGHT_HEADER = img.rightHeader || '';
  vars.COMPARE_RIGHT_SUB = img.rightSub || '';
  vars.COMPARE_VS_TEXT = img.vsText || '→';
  vars.COMPARE_LEFT_ITEMS = buildCompareItemsHTML(img.leftItems, 'before');
  vars.COMPARE_RIGHT_ITEMS = buildCompareItemsHTML(img.rightItems, 'after');
  vars.COMPARE_SUMMARY_TEXT = img.summaryText || '';
  const getSide = (side) => SP?.colors?.types?.compare?.[side] || {};
  const L = getSide('left'), R = getSide('right');
  vars.COMPARE_LEFT_HEADER_BG = colors.compareLeftHeaderBg || L.headerBg || 'rgba(232,96,76,0.06)';
  vars.COMPARE_LEFT_HEADER_BORDER = colors.compareLeftHeaderBorder || L.headerBorder || 'rgba(232,96,76,0.25)';
  vars.COMPARE_LEFT_HEADER_TEXT = colors.compareLeftHeaderText || L.headerText || '#e8604c';
  vars.COMPARE_LEFT_HEADER_SUB = colors.compareLeftHeaderSub || L.headerSub || '#334155';
  vars.COMPARE_RIGHT_HEADER_BG = colors.compareRightHeaderBg || R.headerBg || 'rgba(64,184,144,0.06)';
  vars.COMPARE_RIGHT_HEADER_BORDER = colors.compareRightHeaderBorder || R.headerBorder || 'rgba(64,184,144,0.25)';
  vars.COMPARE_RIGHT_HEADER_TEXT = colors.compareRightHeaderText || R.headerText || '#40b890';
  vars.COMPARE_RIGHT_HEADER_SUB = colors.compareRightHeaderSub || R.headerSub || '#334155';
  vars.COMPARE_LEFT_ACCENT = colors.compareLeftAccent || L.itemAccent || '#e8604c';
  vars.COMPARE_RIGHT_ACCENT = colors.compareRightAccent || R.itemAccent || '#40b890';
  // 左右列专属卡片色彩（用于对比页区分前后）
  vars.COMPARE_LEFT_CARD_BG = colors.compareLeftCardBg || L.cardBg || 'rgba(200,103,75,0.08)';
  vars.COMPARE_LEFT_CARD_BORDER = colors.compareLeftCardBorder || L.cardBorder || 'rgba(200,103,75,0.2)';
  vars.COMPARE_LEFT_CARD_LABEL = colors.compareLeftCardLabel || L.cardLabel || '#d09070';
  vars.COMPARE_LEFT_CARD_VALUE = colors.compareLeftCardValue || L.cardValue || '#f5b090';
  vars.COMPARE_RIGHT_CARD_BG = colors.compareRightCardBg || R.cardBg || 'rgba(125,155,122,0.08)';
  vars.COMPARE_RIGHT_CARD_BORDER = colors.compareRightCardBorder || R.cardBorder || 'rgba(125,155,122,0.2)';
  vars.COMPARE_RIGHT_CARD_LABEL = colors.compareRightCardLabel || R.cardLabel || '#90c8a8';
  vars.COMPARE_RIGHT_CARD_VALUE = colors.compareRightCardValue || R.cardValue || '#f0f5ee';
  vars.CARD_BG_COLOR = colors.cardBg || L.cardBg || R.cardBg || '#ffffff';
  vars.CARD_BORDER_COLOR = colors.cardBorder || L.cardBorder || R.cardBorder || 'rgba(0,0,0,0.08)';
  vars.CARD_DESC_COLOR = colors.cardDesc || L.cardLabel || R.cardLabel || '#64748b';
  vars.CARD_TITLE_COLOR = colors.cardTitle || L.cardValue || R.cardValue || '#1e293b';
  injectTypography(vars, type, ['sectionTitle', 'headerLabel', 'headerSub', 'itemLabel', 'itemValue', 'vsText', 'summaryText', 'pageNum']);
}

function fillDataVars(img, type, vars) {
  const colors = img.colors || {};
  vars.PAGE_NUM = img.pageNum || '01';
  vars.SECTION_TITLE = img.sectionTitle || '';
  vars.FOOTER_TEXT = img.footerText || '';
  vars.STAT_BORDER = colors.statBorder || getTypeColor(type, 'statBorder');
  vars.STAT_BG = colors.statBg || getTypeColor(type, 'statBg');
  vars.STAT_HIGHLIGHT_BORDER = colors.statHighlightBorder || getTypeColor(type, 'statHighlightBorder');
  vars.STAT_HIGHLIGHT_BG = colors.statHighlightBg || getTypeColor(type, 'statHighlightBg');
  vars.STAT_VALUE_COLOR = colors.statValueColor || getTypeColor(type, 'statValueColor');
  vars.STAT_HIGHLIGHT_VALUE_COLOR = colors.statHighlightValueColor || getTypeColor(type, 'statHighlightValueColor');
  vars.STAT_LABEL_COLOR = colors.statLabelColor || getTypeColor(type, 'statLabelColor');
  vars.STAT_ITEMS_HTML = buildStatsHTML(img.stats);
  // 网格列数随统计项数量自适应：2→2列 3→3列 4→2×2 5-6→3列（避免 4 个时 3+1 布局）
  const n = (img.stats || []).length;
  vars.STAT_GRID_COLS = n === 4 ? '1fr 1fr' : n <= 2 ? '1fr 1fr' : '1fr 1fr 1fr';
  const ha = getTypeColor(type, 'accent');
  vars.STAT_HIGHLIGHT_SHADOW = ha ? `0 4px 24px rgba(${hexToRgb(ha).join(',')},0.25)` : 'none';
  injectTypography(vars, type, ['pageNum', 'sectionTitle', 'statValue', 'statLabel']);
}

function fillFlowVars(img, type, vars) {
  const colors = img.colors || {};
  vars.PAGE_NUM = img.pageNum || '01';
  vars.SECTION_TITLE = img.sectionTitle || '';
  vars.FOOTER_TEXT = img.footerText || '';
  vars.STEP_CIRCLE_BG = colors.stepCircleBg || getTypeColor(type, 'stepCircleBg');
  vars.STEP_CIRCLE_BORDER = colors.stepCircleBorder || getTypeColor(type, 'stepCircleBorder');
  vars.STEP_TITLE_COLOR = colors.stepTitleColor || getTypeColor(type, 'stepTitleColor');
  vars.STEP_DESC_COLOR = colors.stepDescColor || getTypeColor(type, 'stepDescColor');
  vars.STEP_ARROW_COLOR = colors.stepArrowColor || getTypeColor(type, 'stepArrowColor');
  const _arrowRgb = hexToRgb('#f5a623');
  vars.STEP_ARROW_GRADIENT = `linear-gradient(180deg, rgba(${_arrowRgb.join(',')},0), rgba(${_arrowRgb.join(',')},0.9))`;
  vars.STEP_ITEMS_HTML = buildStepsHTML(img.steps);
  injectTypography(vars, type, ['pageNum', 'sectionTitle', 'stepTitle', 'stepDesc', 'stepNum']);
  const a = getTypeColor(type, 'accent');
  const [r,g,b] = hexToRgb(a);
  vars.ACCENT_GLOW = `rgba(${r},${g},${b},0.25)`;
  vars.STEP_LINE_GRADIENT = `linear-gradient(to bottom, ${a}, rgba(${r},${g},${b},0.53), transparent)`;
}

function fillShowcaseVars(img, type, vars) {
  const colors = img.colors || {};
  vars.PAGE_NUM = img.pageNum || '01';
  vars.SECTION_TITLE = img.sectionTitle || '';
  vars.FOOTER_TEXT = img.footerText || '';
  vars.BOTTOM_BAR_COLOR = colors.bottomBar || getTypeColor(type, 'bottomBar');
  vars.PAGE_NUM_COLOR = colors.pageNum || getTypeColor(type, 'pageNum');
  vars.SECTION_TITLE_COLOR = colors.sectionTitle || getTypeColor(type, 'sectionTitle');
  vars.CARD_TITLE_COLOR = colors.cardTitle || getTypeColor(type, 'cardTitle');
  vars.CARD_DESC_COLOR = colors.cardDesc || getTypeColor(type, 'cardDesc');
  vars.CARD_BG_COLOR = colors.cardBg || getTypeColor(type, 'cardBg');
  vars.CARD_BORDER_COLOR = colors.cardBorder || getTypeColor(type, 'cardBorder');
  vars.SHOWCASE_ITEMS_HTML = buildShowcaseItemsHTML(img.items);
  injectTypography(vars, type, ['pageNum', 'sectionTitle', 'cardTitle', 'cardDesc', 'cardRadius']);
  const a = getTypeColor(type, 'accent');
  const [r,g,b] = hexToRgb(a);
  vars.ACCENT_COLOR = a;
  vars.ACCENT_BG_HEX = `rgba(${r},${g},${b},0.13)`;
  vars.ACCENT_LIGHT_GRADIENT = `linear-gradient(135deg, rgba(${r},${g},${b},0.1), rgba(${r},${g},${b},0.05))`;
}

// ─── 模板模式：生成 HTML ─────────────────────────────
function generateHTML(config, articleDir, onlyFiles, outDirOverride) {
  const seriesDir = resolveTemplateDir();
  const outDir = outDirOverride ? path.resolve(outDirOverride) : path.resolve(articleDir, config.outputDir);

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
    console.log(`  创建目录: ${outDir}`);
  }

  const FILL_BY_TYPE = {
    cover: fillCoverVars,
    text: fillTextVars,
    compare: fillCompareVars,
    data: fillDataVars,
    flow: fillFlowVars,
    showcase: fillShowcaseVars,
  };

  for (const img of config.images) {
    const type = img.type || 'cover';
    if (onlyFiles && onlyFiles.length && !onlyFiles.includes(img.filename)) continue;

    const templatePath = path.join(seriesDir, `${type}.html`);
    if (!fs.existsSync(templatePath)) {
      console.warn(`  ⚠ 模板不存在: ${templatePath}，跳过 ${img.filename}`);
      continue;
    }

    const template = fs.readFileSync(templatePath, 'utf-8');
    const vars = { FILENAME: img.filename || 'image' };

    // 公共变量（所有类型通用）
    vars.BRAND_NAME = getCfgBrandName();
    vars.FONT_FAMILY = SP?.typography?.fontFamily || '-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
    vars.PAGE_BG = getCfgPageBg();
    const bottomBarGradient = getCfgBottomBarGradient(type);
    vars.BOTTOM_BAR_GRADIENT = bottomBarGradient
      ? `linear-gradient(90deg, ${bottomBarGradient})`
      : `linear-gradient(90deg, ${DEFAULT_BOTTOM_BARS[type] || DEFAULT_BOTTOM_BARS.cover})`;
    // 网格覆盖层：优先按类型覆写（如 text/data 需更亮网格）
    const go = SP?.colors?.types?.[type]?.gridOverlay || SP?.colors?.gridOverlay;
    vars.GRID_OVERLAY = go
      ? `repeating-linear-gradient(0deg, transparent, transparent ${go.size}, ${go.color} ${go.size}, ${go.color} calc(${go.size} + 1px)), repeating-linear-gradient(90deg, transparent, transparent ${go.size}, ${go.color} ${go.size}, ${go.color} calc(${go.size} + 1px))`
      : 'none';

    // 非封面公共变量
    if (type !== 'cover') {
      const colors = img.colors || {};
      vars.BOTTOM_BAR_COLOR = colors.bottomBar || getTypeColor(type, 'bottomBar');
      vars.PAGE_NUM_COLOR = colors.pageNum || getTypeColor(type, 'pageNum');
      vars.SECTION_TITLE_COLOR = colors.sectionTitle || getTypeColor(type, 'sectionTitle');
      vars.BRAND_COLOR = SP?.colors?.tokens?.brandColor || FALLBACK_COLORS.brandColor;
      vars.FOOTER_COLOR = SP?.colors?.tokens?.textMuted || FALLBACK_COLORS.textMuted;
      vars.FOOTER_BORDER_COLOR = SP?.colors?.tokens?.footerBorder || FALLBACK_COLORS.footerBorder;
    }

    // 类型专用变量
    const fillFn = FILL_BY_TYPE[type] || fillContentVars;
    fillFn(img, type, vars);

    // 按类型覆写 footer 颜色（风格包 type.footerText > 全局 textMuted）
    if (type !== 'cover') {
      const ft = img.colors?.footerText || getTypeColor(type, 'footerText');
      if (ft) vars.FOOTER_COLOR = ft;
    }

    // 按类型覆写 brand 颜色（风格包 type.brandColor > 全局 tokens.brandColor）
    if (type !== 'cover') {
      const bc = img.colors?.brandColor || getTypeColor(type, 'brandColor');
      if (bc) vars.BRAND_COLOR = bc;
    }

    const html = replaceVars(template, vars);
    const outPath = path.join(outDir, `${img.filename}.html`);
    fs.writeFileSync(outPath, html, 'utf-8');
    console.log(`  ✓ 生成: ${img.filename}.html`);
  }

  return outDir;
}

// ─── 文件路径转 file:// URL（Windows 兼容） ────────
function toFileURL(absPath) {
  const normalized = absPath.replace(/\\/g, '/');
  return `file:///${normalized.startsWith('/') ? '' : '/'}${normalized}`;
}

// ─── 截图：启动浏览器 → 逐张导航 → 截图 ────────────
async function tryLaunch(channel) {
  const opts = {
    headless: HEADLESS,
    args: HEADLESS ? ['--headless=new', '--disable-gpu'] : ['--disable-gpu'],
  };
  if (channel) opts.channel = channel;
  return await chromium.launch(opts);
}

async function ensurePlaywrightChromium() {
  // 检测 Chromium 是否已安装，未安装则自动下载
  try {
    await tryLaunch(null);
    return true;
  } catch (err) {
    if (err.message && err.message.includes('Executable doesn\'t exist')) {
      console.log('  → Playwright Chromium 未安装，自动下载中...');
      return new Promise((resolve) => {
        exec('npx playwright install chromium', { timeout: 300000 }, (err) => {
          resolve(!err);
        });
      });
    }
    return false;
  }
}

async function launchBrowser() {
  // 优先级：--channel 指定 > 自动尝试 msedge > chrome > Playwright Chromium
  const channels = CHANNEL ? [CHANNEL] : ['msedge', 'chrome', null];
  const channelLabel = (ch) => ch || 'chromium';

  for (const ch of channels) {
    try {
      const browser = await tryLaunch(ch);
      console.log(`  ✓ 浏览器已启动: ${channelLabel(ch)}`);
      return browser;
    } catch (err) {
      if (ch === null) {
        // Playwright Chromium 失败时尝试自动安装
        console.log(`  ⚠ Playwright Chromium 不可用，尝试自动安装...`);
        const installed = await ensurePlaywrightChromium();
        if (installed) {
          const browser = await tryLaunch(null);
          console.log(`  ✓ 浏览器已启动: chromium (自动安装)`);
          return browser;
        }
        throw new Error('无可用浏览器，且自动安装失败。请手动执行: npx playwright install chromium');
      }
      console.log(`  ⚠ ${ch} 不可用，尝试下一个...`);
    }
  }
  throw new Error('无可用浏览器');
}

async function screenshotAll(htmlDir, files) {
  // 并发参数：auto → 自动检测，>1 → 并发池，1 → 串行（原逻辑）
  const concurrency = decideConcurrency(CONCURRENCY);
  if (concurrency > 1) {
    return screenshotConcurrent(htmlDir, files, concurrency);
  }

  // ─── 原串行代码（一行不动） ────────────────────────────
  let browser;
  try {
    console.log(`  启动浏览器 (${HEADLESS ? 'headless' : 'headed'})...`);
    browser = await launchBrowser();

    const context = await browser.newContext({
      viewport: { width: getCfgScreenshotWidth(), height: getCfgScreenshotHeight() },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();

    // 收集要截图的文件
    const validFiles = files.filter(f => {
      const htmlPath = path.join(htmlDir, `${f}.html`);
      if (!fs.existsSync(htmlPath)) {
        console.warn(`  ⚠ 文件不存在: ${f}.html，跳过`);
        return false;
      }
      return true;
    });

    if (!validFiles.length) {
      console.log('  ! 没有需要截图的文件');
      return [];
    }

    console.log(`  开始截图 (共 ${validFiles.length} 张)...\n`);

    const results = [];
    for (const f of validFiles) {
      const htmlPath = path.join(htmlDir, `${f}.html`);
      const url = toFileURL(htmlPath);
      try {
        console.log(`  → ${f}.html`);
        await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
        await Promise.race([
          page.evaluate(() => document.fonts.ready),
          sleep(2000)
        ]);
        // 等两个动画帧确保浏览器完成渲染（底图加载后 CSS paint 完成）
        await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
        await page.screenshot({
          path: path.join(htmlDir, `${f}.png`),
          fullPage: false,
        });
        console.log(`    ✓ ${f}.png`);
        results.push({ file: f, status: 'ok' });
      } catch (err) {
        console.error(`    ✗ ${f}.html 截图失败: ${err.message}`);
        results.push({ file: f, status: 'error', error: err.message });
      }
    }
    return results;
  } catch (err) {
    console.error(`\n  ✗ 浏览器启动失败: ${err.message}`);
    throw err;
  } finally {
    if (browser) {
      await browser.close();
      console.log('\n  浏览器已关闭');
    }
  }
}

/** 截图任务（单张，供并发池调用） */
async function screenshotOne(task, context) {
  const page = await context.newPage();
  try {
    if (task.viewport) {
      await page.setViewportSize({ width: task.viewport.width, height: task.viewport.height });
    }
    await page.goto(task.url, { waitUntil: 'networkidle', timeout: 15000 });
    // fonts.ready + 超时兜底，替代 sleep(1000)
    await Promise.race([
      page.evaluate(() => document.fonts.ready),
      sleep(2000)
    ]);
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.screenshot({ path: task.pngPath, timeout: 10000 });
    return { file: task.name, status: 'ok' };
  } catch (err) {
    // 超时或失败 → 可降级串行重试
    return { file: task.name, status: 'error', error: err.message };
  } finally {
    await page.close();
  }
}

/** 并发截图池（批次模式，每批 concurrency 张并发） */
async function screenshotConcurrent(htmlDir, files, concurrency) {
  console.log(`  并发截图 (concurrency=${concurrency})...`);

  // 断点续截：已有 PNG 跳过
  const pending = [];
  for (const f of files) {
    const htmlPath = path.join(htmlDir, `${f}.html`);
    const pngPath = path.join(htmlDir, `${f}.png`);
    if (!fs.existsSync(htmlPath)) {
      console.warn(`  ⚠ 文件不存在: ${htmlPath}，跳过`);
      continue;
    }
    if (fs.existsSync(pngPath)) {
      console.log(`  ↺ ${f}.png 已存在，跳过`);
      continue;
    }
    pending.push({
      name: f,
      url: toFileURL(htmlPath),
      pngPath,
      viewport: { width: getCfgScreenshotWidth(), height: getCfgScreenshotHeight() },
    });
  }

  if (!pending.length) {
    console.log('  所有图片已存在，无需截图');
    return [];
  }

  console.log(`  待截 ${pending.length} 张 (已跳过 ${files.length - pending.length} 张)\n`);
  return screenshotPool(pending, concurrency);
}

/** 多平台合并截图：所有平台任务汇成一个并发池 */
async function screenshotPool(pending, concurrency) {
  console.log(`  合并截图池: ${pending.length} 张 (concurrency=${concurrency})...`);

  let browser;
  try {
    browser = await launchBrowser();
    const context = await browser.newContext({
      viewport: { width: 1242, height: 1660 }, // 每个任务截图前会按自己的尺寸覆盖
      deviceScaleFactor: 1,
    });

    const results = [];
    for (let i = 0; i < pending.length; i += concurrency) {
      const batch = pending.slice(i, i + concurrency);
      console.log(`  批次 ${Math.floor(i / concurrency) + 1}/${Math.ceil(pending.length / concurrency)}: ${batch.map(t => t.name).join(', ')}`);
      const batchResults = await Promise.all(batch.map(t => screenshotOne(t, context)));
      results.push(...batchResults);

      // 失败降级：串行重试一次
      const failed = batchResults.filter(r => r.status === 'error');
      for (const f of failed) {
        const task = pending.find(t => t.name === f.file);
        if (!task) continue;
        console.log(`  ↻ 重试: ${task.name}`);
        const retry = await screenshotOne(task, context);
        if (retry.status === 'ok') {
          const idx = results.findIndex(r => r.file === f.file);
          if (idx >= 0) results[idx] = retry;
        }
      }
    }
    return results;
  } catch (err) {
    console.error(`\n  ✗ 截图失败: ${err.message}`);
    throw err;
  } finally {
    if (browser) {
      await browser.close();
      console.log('\n  浏览器已关闭');
    }
  }
}

// ─── 主流程 ───────────────────────────────────────────
/** 解析 --dirs：逗号分平台，每项四段 platform:inDir:outDir:stylePack 或单段 platform（自动推导） */
function parseDirsSpec(raw) {
  return raw.split(',').map(s => s.trim()).filter(Boolean).map(seg => {
    const m = seg.match(/^([^:]+):(.+):(.+):(.+)$/);
    if (m) {
      return { name: m[1].trim(), inDir: m[2].trim(), outDir: m[3].trim(), stylePack: m[4].trim() };
    }
    return { name: seg, inDir: null, outDir: null, stylePack: null };
  });
}

/** 多平台合并：逐平台生成 HTML（各自风格包）→ 合并截图池（各自尺寸/输出目录） */
async function runDirs(raw) {
  const specs = parseDirsSpec(raw);
  const concurrency = decideConcurrency(CONCURRENCY);
  const pending = [];

  for (const spec of specs) {
    // 简化式（单段平台名）基于确定位置推导：Distribute 在篇目目录（cwd），风格包在 snapflow 根（__dirname）
    // 显式式（四段）直接用给定路径；两者都经 resolveRelPath 兜底解析
    const inDir = resolveRelPath(
      spec.inDir || path.join(process.cwd(), 'Distribute', spec.name, 'Images')
    );
    const outDir = resolveRelPath(
      spec.outDir || spec.inDir || path.join(process.cwd(), 'Distribute', spec.name, 'Images')
    );
    const stylePack = resolveRelPath(
      spec.stylePack || path.join(__dirname, 'rewriter', 'platforms', spec.name, 'style-pack.json')
    );

    if (!fs.existsSync(stylePack)) {
      console.error(`✗ 平台 ${spec.name} 风格包不存在: ${stylePack}`);
      console.error('  用法: --dirs "platform:inDir:outDir:stylePack,..." 或 --dirs "platform,..."（自动推导）');
      console.error('  提示: 简化式 --dirs "toutiao" 需在篇目目录执行（含 Distribute/ 的那一层）');
      process.exit(1);
    }
    loadStylePack(stylePack);

    const configPath = path.join(inDir, 'content.json');
    if (!fs.existsSync(configPath)) {
      console.error(`✗ 平台 ${spec.name} 无 content.json: ${configPath}`);
      console.error('  提示: 简化式 --dirs "toutiao" 需在篇目目录执行（含 Distribute/ 的那一层）');
      console.error('        且已用 md2content.js 生成 Distribute/{平台}/Images/content.json');
      process.exit(1);
    }
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config.images = expandShowcaseImages(config.images);
    const articleDir = path.dirname(inDir);

    console.log(`\n── 平台 ${spec.name} (${config.images.length} 张, ${getCfgScreenshotWidth()}×${getCfgScreenshotHeight()}) ──`);
    await generateCoverBackgrounds(config, articleDir);
    const valid = validateConfig(config, articleDir);
    if (!valid) {
      console.error(`✗ 平台 ${spec.name} 前置校验未通过`);
      process.exit(1);
    }
    generateHTML(config, articleDir, null, outDir);

    for (const img of config.images) {
      const f = img.filename;
      const htmlPath = path.join(outDir, `${f}.html`);
      if (!fs.existsSync(htmlPath)) {
        console.warn(`  ⚠ 无 HTML: ${f}.html，跳过`);
        continue;
      }
      const pngPath = path.join(outDir, `${f}.png`);
      if (fs.existsSync(pngPath)) {
        console.log(`  ↺ ${spec.name}/${f}.png 已存在，跳过`);
        continue;
      }
      pending.push({
        name: `${spec.name}/${f}`,
        url: toFileURL(htmlPath),
        pngPath,
        viewport: { width: getCfgScreenshotWidth(), height: getCfgScreenshotHeight() },
      });
    }
  }

  if (!pending.length) {
    console.log('\n所有平台图片已存在，无需截图');
    return;
  }

  console.log(`\n── 合并截图 (${pending.length} 张, ${specs.length} 平台, concurrency=${concurrency}) ──`);
  const results = await screenshotPool(pending, concurrency);

  console.log('\n── 结果 ──────────────────────────────');
  const ok = results.filter(r => r.status === 'ok').length;
  const failed = results.filter(r => r.status === 'error').length;
  console.log(`  ✓ 成功: ${ok} / ${failed ? `✗ 失败: ${failed}` : ''}`);
  if (failed) {
    results.filter(r => r.status === 'error').forEach(r => {
      console.log(`  ✗ ${r.file} - ${r.error}`);
    });
  }
  for (const spec of specs) {
    const outDir = resolveRelPath(spec.outDir || spec.inDir || `Distribute/${spec.name}/Images`);
    console.log(`  📁 ${spec.name}: ${outDir}`);
  }
}

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  批量截图脚本 batch-screenshot.js');
  console.log(`  模式: ${MODE}`);
  console.log(`  headless: ${HEADLESS}`);
  console.log(`  channel: ${CHANNEL || 'auto (msedge→chrome→chromium)'}`);
  if (CFG_PATH) console.log(`  config: ${CFG_PATH}`);
  console.log('═══════════════════════════════════════\n');

  // 多平台合并截图：--dirs 优先，跳过单平台流程
  if (DIRS_RAW) {
    await runDirs(DIRS_RAW);
    return;
  }

  // 加载配置：优先 --style-pack，其次 cfg 中的 style_pack 字段，最后 cfg 内联字段
  loadConfig(CFG_PATH);
  if (SP_PATH) {
    // 路径存在 → 直接用；否则按名称匹配（如 --style-pack 炭火）
    const absPath = resolveRelPath(SP_PATH);
    if (fs.existsSync(absPath)) {
      loadStylePack(absPath);
      recordUsage(path.basename(absPath));
    } else {
      const resolved = await resolveStylePack(SP_PATH);
      loadStylePack(resolved.path);
      recordUsage(resolved.file);
    }
  } else {
    // 未指定 → resolver 兜底：非 TTY 零等待选高频包 / 真终端弹菜单
    const picked = await resolveStylePack();
    if (picked) {
      loadStylePack(picked.path);
      recordUsage(picked.file);
    }
  }

  let htmlDir;

  if (MODE === 'template') {
    const configPath = resolveRelPath(getArg('--config', 'content.json'));
    if (!fs.existsSync(configPath)) {
      console.error(`✗ 找不到 content.json: ${configPath}`);
      console.log('\n用法: node batch-screenshot.js --config path/to/content.json');
      process.exit(1);
    }

      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      config.images = expandShowcaseImages(config.images);
    const label = config.assetType || config.series || 'default';
    const configDir = path.dirname(configPath);
    const articleDir = path.dirname(configDir);
    console.log(`模板: ${label}`);
    console.log(`图片数: ${config.images.length}\n`);

    htmlDir = path.resolve(articleDir, config.outputDir);

    // 封面底图自动生成（ComfyUI）
    await generateCoverBackgrounds(config, articleDir);

    // 前置校验
    const valid = validateConfig(config, articleDir);
    if (!valid) {
      console.error('✗ 前置校验未通过，请修复后重试');
      process.exit(1);
    }

    const files = config.images.map(i => i.filename);

    // 生成 HTML
    console.log('── 生成 HTML ──────────────────────────');
    generateHTML(config, articleDir);

    // 筛选文件
    const targetFiles = ONLY_FILES
      ? files.filter(f => ONLY_FILES.includes(f))
      : files;

    if (ONLY_FILES) {
      console.log(`\n  筛选模式: 只处理 ${targetFiles.join(', ')}`);
    }

    // 截图
    console.log('\n── 截图 ──────────────────────────────');
    const results = await screenshotAll(htmlDir, targetFiles);

    // 报告
    console.log('── 结果 ──────────────────────────────');
    const ok = results.filter(r => r.status === 'ok').length;
    const failed = results.filter(r => r.status === 'error').length;
    console.log(`  ✓ 成功: ${ok} / ${failed ? `✗ 失败: ${failed}` : ''}`);
    if (failed) {
      results.filter(r => r.status === 'error').forEach(r => {
        console.log(`  ✗ ${r.file} - ${r.error}`);
      });
    }
    console.log(`\n  输出目录: ${htmlDir}`);

  } else if (MODE === 'direct') {
    htmlDir = path.resolve(getArg('--dir', ''));
    if (!htmlDir || !fs.existsSync(htmlDir)) {
      console.error('✗ 目录不存在或不指定: --dir');
      process.exit(1);
    }

    // 读 content.json，重新渲染 HTML（保证模板更新生效）
    const configPath = path.join(htmlDir, 'content.json');
    if (fs.existsSync(configPath)) {
      const configDir = path.dirname(configPath);
      const articleDir = path.dirname(configDir);
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      config.images = expandShowcaseImages(config.images);

      let targetFiles = config.images.map(i => i.filename);
      if (ONLY_FILES) {
        targetFiles = targetFiles.filter(f => ONLY_FILES.includes(f));
        // 跳过不存在的图片配置
        targetFiles.forEach(f => {
          if (!config.images.find(i => i.filename === f)) {
            console.warn(`  ⚠ ${f} 在 content.json 中未找到，跳过`);
          }
        });
      }

      console.log(`  从 content.json 读取 ${config.images.length} 张图配置`);
      if (ONLY_FILES) console.log(`  筛选: ${targetFiles.join(', ')}`);

      // 重新生成 HTML（用当前模板）
      console.log('');
      generateHTML(config, articleDir, targetFiles);

      // 更新 htmlDir 指向正确的输出目录
      htmlDir = path.resolve(articleDir, config.outputDir || 'Images');

      // 截图
      console.log('');
      const results = await screenshotAll(htmlDir, targetFiles);
      printResults(results);
    } else {
      // 没有 content.json 时回退旧行为：直接截图已有 HTML
      let htmlFiles = fs.readdirSync(htmlDir)
        .filter(f => f.endsWith('.html'))
        .map(f => f.replace(/\.html$/, ''));

      if (ONLY_FILES) {
        htmlFiles = htmlFiles.filter(f => ONLY_FILES.includes(f));
      }

      if (!htmlFiles.length) {
        console.log('! 没有找到 HTML 文件');
        return;
      }

      console.log(`  目录: ${htmlDir}（无 content.json，直接截图）`);
      console.log(`  找到 ${htmlFiles.length} 个 HTML 文件\n`);

      const results = await screenshotAll(htmlDir, htmlFiles);
      printResults(results);
    }

  }
}

function printResults(results) {
  const ok = results.filter(r => r.status === 'ok').length;
  const failed = results.filter(r => r.status === 'error').length;
  console.log(`  ✓ 成功: ${ok} / ${failed ? `✗ 失败: ${failed}` : ''}`);
  if (failed) {
    results.filter(r => r.status === 'error').forEach(r => {
      console.log(`  ✗ ${r.file} - ${r.error}`);
    });
  }
}

main().catch(err => {
  console.error('\n✗ 脚本运行失败:', err.message);
  process.exit(1);
});
