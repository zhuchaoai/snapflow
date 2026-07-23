/**
 * batch-screenshot.js — 批量配图截图脚本
 *
 * 两种模式：
 *   1. template（默认）：读 content.json → 填模板 → 生成 HTML → 截图
 *   2. direct：直接截图指定目录下的现有 HTML 文件
 *
 * 用法：
 *   node batch-screenshot.js [选项]
 *
 * 选项：
 *   --style-pack style-pack.json  风格包路径（可选，所有配置的单一来源）
 *   --cfg config.yaml             config.yaml 路径（后备，无风格包时使用）
 *   --mode template|direct        模式（默认 template）
 *   --config content.json          content.json 路径（template 模式必填）
 *   --dir ./Images                 HTML 目录（direct 模式必填）
 *   --files 01-cover,02-painpoint 只处理指定文件（不含扩展名，修改模式用）
 *   --headless true|false          是否无头模式（默认 true）
 *   --template-dir templates-private  模板目录（默认 templates/，专用模板用此切换）
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

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

// ─── 模板目录（相对工作目录，优先使用 CLI 参数，其次 CFG） ───
const CLI_TEMPLATE_DIR = getArg('--template-dir', null);
const DEFAULT_TEMPLATE_DIR = path.resolve(process.cwd(), 'templates');
function resolveTemplateDir() {
  if (CLI_TEMPLATE_DIR) return path.resolve(process.cwd(), CLI_TEMPLATE_DIR);
  const cfgDir = getCfgTemplateDir();
  if (cfgDir) return path.resolve(process.cwd(), cfgDir);
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
  compare: { sectionTitle: '52px', headerLabel: '34px', headerSub: '24px', itemLabel: '26px', itemValue: '32px', vsText: '20px', summaryText: '28px' },
};

// ─── Style Pack 加载 ──────────────────────────────────
const SP_PATH = getArg('--style-pack', null);
let SP = null; // 全局风格包对象

function loadStylePack(spPath) {
  if (!spPath) return;
  const absPath = path.resolve(process.cwd(), spPath);
  if (!fs.existsSync(absPath)) {
    console.warn(`  ⚠ 风格包不存在: ${absPath}，使用默认配置`);
    return;
  }
  try {
    SP = JSON.parse(fs.readFileSync(absPath, 'utf-8'));
    console.log(`  ✓ 已加载风格包: ${path.basename(spPath)}`);
  } catch (err) {
    console.warn(`  ⚠ 风格包解析失败: ${err.message}，使用默认配置`);
  }
}

// ─── Config 加载 ──────────────────────────────────────
let CFG = null; // 全局配置对象，由 --cfg 加载

function loadConfig(cfgPath) {
  if (!cfgPath) return;
  const absPath = path.resolve(process.cwd(), cfgPath);
  if (!fs.existsSync(absPath)) {
    console.warn(`  ⚠ config.yaml 不存在: ${absPath}，使用默认值`);
    return;
  }
  try {
    CFG = yaml.load(fs.readFileSync(absPath, 'utf-8'));
    console.log(`  ✓ 已加载配置: ${absPath}`);
  } catch (err) {
    console.warn(`  ⚠ config.yaml 解析失败: ${err.message}，使用默认值`);
  }
}

// 从风格包 > CFG > 默认值 获取配置（优先级从左到右）
function getCfgBrandName() {
  return SP?.brand?.name || CFG?.brand?.name || '';
}
function getCfgPageBg() {
  return SP?.colors?.pageBg || CFG?.colors?.page_bg || '#f0f4f8';
}
function getCfgBottomBarGradient(type) {
  // 新结构: SP.colors.types[type].bottomBar
  const typeBar = SP?.colors?.types?.[type]?.bottomBar;
  if (typeBar) return `linear-gradient(90deg, ${typeBar})`;
  // 旧结构兼容: SP.colors.bottomBar[type] or SP.colors.bottomBar string
  const spBar = SP?.colors?.bottomBar;
  if (typeof spBar === 'object' && spBar[type]) return `linear-gradient(90deg, ${spBar[type]})`;
  if (typeof spBar === 'string') return `linear-gradient(90deg, ${spBar})`;
  const barColors = CFG?.colors?.bottom_bar;
  if (barColors && barColors[type]) return `linear-gradient(90deg, ${barColors[type]})`;
  return null;
}
function getCfgTemplateDir() {
  return SP?.paths?.templateDir || CFG?.paths?.templates || null;
}
function getCfgScreenshotWidth() {
  return SP?.screenshot?.width || CFG?.screenshot?.width || 1242;
}
function getCfgScreenshotHeight() {
  return SP?.screenshot?.height || CFG?.screenshot?.height || 1660;
}
function getCfgMaxShowcaseItems() {
  return SP?.screenshot?.maxShowcaseItems || CFG?.screenshot?.max_showcase_items || 2;
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

      // 4. bgImage 文件是否存在
      if (img.bgImage) {
        const bgPath = path.join(outDir, img.bgImage);
        if (!fs.existsSync(bgPath)) {
          errors.push(`⚠ ${img.filename}: bgImage 文件不存在: ${img.bgImage}（截图后封面无底图）`);
        }
      } else {
        errors.push(`⚠ ${img.filename}: cover 缺少 bgImage（截图后封面无底图）`);
      }
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
function injectTypography(vars, type, keys) {
  for (const k of keys) vars[k + '_FS'] = getTypeTypography(type, k);
}

function fillCoverVars(img, type, vars) {
  vars.TITLE = img.title || '';
  vars.SUBTITLE = img.subtitle || '';
  vars.PILL_NAME = img.pill || '';
  vars.TAGLINE = img.tagline || '';
  vars.BADGES = buildBadgesHTML(img.badges);
  vars.BG_IMAGE = img.bgImage
    ? `background-image: url('${img.bgImage}');`
    : 'background-image: none';
  vars.BRAND_BAR = SP?.brand?.tagline || CFG?.brand?.tagline || '';
  const tc = SP?.colors?.types?.cover || {};
  vars.MAIN_TITLE_COLOR = tc.mainTitle || '#ffffff';
  vars.SUBTITLE_COLOR = tc.subtitle || '#ffffff';
  vars.TAGLINE_COLOR = tc.tagline || '#f0e4d8';
  vars.BADGE_TEXT_COLOR = tc.badgeText || 'rgba(255,255,255,0.65)';
  vars.BRAND_BAR_COLOR = tc.brandBar || 'rgba(255,215,0,0.5)';
  vars.ASSET_TYPE_COLOR = tc.assetType || 'rgba(255,255,255,0.3)';
  vars.BRAND_BADGE_BG = tc.badgeBg || 'rgba(255,255,255,0.06)';
  vars.BRAND_BADGE_BORDER = tc.badgeBorder || 'rgba(255,255,255,0.12)';
  vars.BADGE_TEXT_COLOR = tc.badgeNameColor || 'rgba(255,255,255,0.7)';
  vars.DIVIDER_GRADIENT = tc.dividerGradient || 'linear-gradient(90deg, #ffd700, rgba(255,215,0,0.3))';
  vars.ACCENT_GRADIENT = tc.titleHl || 'linear-gradient(135deg, #ffd700, #f5e6d0)';
  injectTypography(vars, 'cover', ['title', 'subtitle', 'tagline', 'badge', 'brandBar', 'brandBadge', 'assetType']);
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
  vars.COMPARE_PAGE_NUM = img.comparePageNum || '01';
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
  vars.COMPARE_LEFT_HEADER_SUB = colors.compareLeftHeaderSub || L.headerSub || '#f0dcc8';
  vars.COMPARE_RIGHT_HEADER_BG = colors.compareRightHeaderBg || R.headerBg || 'rgba(64,184,144,0.06)';
  vars.COMPARE_RIGHT_HEADER_BORDER = colors.compareRightHeaderBorder || R.headerBorder || 'rgba(64,184,144,0.25)';
  vars.COMPARE_RIGHT_HEADER_TEXT = colors.compareRightHeaderText || R.headerText || '#40b890';
  vars.COMPARE_RIGHT_HEADER_SUB = colors.compareRightHeaderSub || R.headerSub || '#f0dcc8';
  vars.COMPARE_LEFT_ACCENT = colors.compareLeftAccent || L.itemAccent || '#e8604c';
  vars.COMPARE_RIGHT_ACCENT = colors.compareRightAccent || R.itemAccent || '#40b890';
  vars.CARD_BG_COLOR = colors.cardBg || L.cardBg || R.cardBg || 'rgba(255,255,255,0.08)';
  vars.CARD_BORDER_COLOR = colors.cardBorder || L.cardBorder || R.cardBorder || 'rgba(255,255,255,0.15)';
  vars.CARD_DESC_COLOR = colors.cardDesc || L.cardLabel || R.cardLabel || 'rgba(255,255,255,0.4)';
  vars.CARD_TITLE_COLOR = colors.cardTitle || L.cardValue || R.cardValue || '#f0dcc8';
  injectTypography(vars, type, ['sectionTitle', 'headerLabel', 'headerSub', 'itemLabel', 'itemValue', 'vsText', 'summaryText']);
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
function generateHTML(config, articleDir, onlyFiles) {
  const seriesDir = resolveTemplateDir();
  const outDir = path.resolve(articleDir, config.outputDir);

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
    vars.PAGE_BG = getCfgPageBg();
    const bottomBarGradient = getCfgBottomBarGradient(type);
    vars.BOTTOM_BAR_GRADIENT = bottomBarGradient
      ? `linear-gradient(90deg, ${bottomBarGradient})`
      : `linear-gradient(90deg, ${DEFAULT_BOTTOM_BARS[type] || DEFAULT_BOTTOM_BARS.cover})`;
    vars.GRID_OVERLAY = SP?.colors?.gridOverlay
      ? `repeating-linear-gradient(0deg, transparent, transparent ${SP.colors.gridOverlay.size}, ${SP.colors.gridOverlay.color} ${SP.colors.gridOverlay.size}, ${SP.colors.gridOverlay.color} calc(${SP.colors.gridOverlay.size} + 1px)), repeating-linear-gradient(90deg, transparent, transparent ${SP.colors.gridOverlay.size}, ${SP.colors.gridOverlay.color} ${SP.colors.gridOverlay.size}, ${SP.colors.gridOverlay.color} calc(${SP.colors.gridOverlay.size} + 1px))`
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
async function screenshotAll(htmlDir, files) {
  let browser;
  try {
    console.log(`  启动浏览器 (${HEADLESS ? 'headless' : 'headed'})...`);
    const launchOpts = {
      headless: HEADLESS,
      args: HEADLESS ? ['--headless=new', '--disable-gpu'] : ['--disable-gpu'],
    };
    if (CHANNEL) launchOpts.channel = CHANNEL;
    browser = await chromium.launch(launchOpts);

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
        await sleep(1000); // 确保字体渲染
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

// ─── 主流程 ───────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  批量截图脚本 batch-screenshot.js');
  console.log(`  模式: ${MODE}`);
  console.log(`  headless: ${HEADLESS}`);
  console.log(`  channel: ${CHANNEL || 'playwright'}`);
  if (CFG_PATH) console.log(`  config: ${CFG_PATH}`);
  console.log('═══════════════════════════════════════\n');

  // 加载配置：优先 --style-pack，其次 cfg 中的 style_pack 字段，最后 cfg 内联字段
  loadConfig(CFG_PATH);
  if (!SP_PATH && CFG?.style_pack) {
    loadStylePack(path.resolve(process.cwd(), CFG.style_pack));
  }
  loadStylePack(SP_PATH);

  let htmlDir;

  if (MODE === 'template') {
    const configPath = path.resolve(getArg('--config', 'content.json'));
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
