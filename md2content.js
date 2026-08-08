/**
 * md2content.js v6
 * 从.md提取```slides数据区，生成content.json
 * 用法: node md2content.js --md "篇目/Manuscript/稿件.md" [--style-pack style-pack.json]
 *
 * v6 改动:
 *   - 支持 slides YAML 顶层 assetType 字段，替代目录名匹配
 *   - 支持 --style-pack，命名规则、缩写映射从风格包读取
 *   - outputDir 输出为相对路径 ./Images，避免下游路径拼接重复
 */
const fs = require('fs');
const path = require('path');

function parseVal(str) {
  str = str.trim();
  if (str === 'true') return true;
  if (str === 'false') return false;
  const n = Number(str);
  if (!isNaN(n) && str !== '') return n;
  return str.replace(/^"|"$/g, '').replace(/\\"/g, '"');
}

function parseYamlList(text) {
  const blocks = [];
  let cur = null;
  const meta = {};
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    if (t.startsWith('- type:')) {
      if (cur) blocks.push(cur);
      cur = [line];
    } else if (cur) {
      cur.push(line);
    } else {
      // 顶层元字段（第一个 - type 之前）
      const ci = t.indexOf(':');
      if (ci > 0) {
        const k = t.slice(0, ci).trim();
        let v = t.slice(ci + 1).trim().replace(/^"|"$/g, '');
        meta[k] = v;
      }
    }
  }
  if (cur) blocks.push(cur);

  const items = blocks.map(lines => {
    const item = {};
    let list = null;
    let obj = null;

    for (const raw of lines) {
      const t = raw.trim();
      if (!t || t.startsWith('#')) continue;

      const indent = raw.search(/\S/);

      // --- 顶层字段 ---
      if (indent <= 2) {
        // 处理 "- type: cover" 这类行
        let key, val;
        if (t.startsWith('- ')) {
          const after = t.slice(2);
          const ci = after.indexOf(':');
          if (ci > 0) { key = after.slice(0, ci).trim(); val = after.slice(ci + 1).trim(); }
        } else {
          const ci = t.indexOf(':');
          if (ci > 0) { key = t.slice(0, ci).trim(); val = t.slice(ci + 1).trim(); }
        }
        if (!key) continue;

        if (val === '') {
          item[key] = [];
          list = item[key];
          obj = null;
        } else if (val.startsWith('[')) {
          try { item[key] = JSON.parse(val.replace(/'/g, '"')); } catch { item[key] = []; }
          list = null;
        } else {
          item[key] = val.replace(/^"|"$/g, '').replace(/\\"/g, '"');
          list = null;
        }
        continue;
      }

      // --- 数组项 ---
      if (list) {
        const am = t.match(/^-\s*(.+)/);
        if (am) {
          const content = am[1].trim();
          // 检查是否是 JSON 对象 {"key": "val", ...}
          if (content.startsWith('{') && content.endsWith('}')) {
            try {
              obj = JSON.parse(content);
              list.push(obj);
            } catch {
              // 可能是 JS 对象字面量格式 {key: val}，key 没加引号
              try {
                const fixed = content.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
                obj = JSON.parse(fixed);
                list.push(obj);
              } catch {
                list.push(content);
              }
            }
            obj = null;
            continue;
          }
          // 检查是否是 "key: value" 格式
          const kv = content.match(/^(\w+):\s*(.*?)(?:,\s*(\w+):\s*(.*))?$/);
          if (kv) {
            obj = {};
            obj[kv[1]] = parseVal(kv[2]);
            if (kv[3]) {
              obj[kv[3]] = parseVal(kv[4]);
            }
            list.push(obj);
          } else {
            // 纯字符串
            list.push(content.replace(/^"|"$/g, '').replace(/\\"/g, '"'));
            obj = null;
          }
          continue;
        }

        // 数组项子字段
        if (obj) {
          const ci = t.indexOf(':');
          if (ci > 0) {
            const key = t.slice(0, ci).trim();
            let val = t.slice(ci + 1).trim();
            if (val === 'true') obj[key] = true;
            else if (val === 'false') obj[key] = false;
            else obj[key] = val.replace(/^"|"$/g, '').replace(/\\"/g, '"');
          }
        }
      }
    }
    return item;
  });
  return { items, meta };
}

function buildJson(items, meta, mdPath, stylePack) {
  const naming = stylePack?.coverBg?.naming || {};
  const abbrMap = naming.abbrMap || {};

  // assetType: slides YAML 顶层字段 > 目录名匹配（向后兼容）> 默认
  const overrideType = meta.assetType || '';
  const assetFromDir = p => {
    p = p.replace(/\\/g, '/');
    for (const [keyword, type] of Object.entries(abbrMap)) {
      if (p.includes('/' + keyword) || p.includes('/重' + '构') || p.includes('/人' + '设')) return type;
    }
    return naming.defaultAbbr || 'tool';
  };
  const slidesAssetType = overrideType || assetFromDir(mdPath);

  const assetTypeLabel = p => {
    const labels = { tool: '🛠️ 技能资产', identity: '🏗️ 人设资产', life: '❤️ 生命资产' };
    return labels[slidesAssetType] || '🛠️ 技能资产';
  };

  const assetAbbr = p => {
    if (overrideType) return overrideType;
    const result = assetFromDir(p);
    return result === 'identity' ? 'identity' : (result === 'life' ? 'life' : 'tool');
  };

  // 从目录名提取篇序号
  const parentDir = path.basename(path.dirname(path.dirname(mdPath)));
  const seqRegex = naming.seqFromDir ? (naming.seqRegex || '^(\\d+)') : null;
  const seqMatch = seqRegex ? parentDir.match(new RegExp(seqRegex)) : null;
  const seqNum = seqMatch ? seqMatch[1] : '001';
  const abbr = assetAbbr(mdPath);

  // bgImage 命名模式：风格包 > 默认；abbr 优先复用封面配图 filename 里的缩写，保证与配图一致
  const bgPattern = naming.pattern || '{seq}-{abbr}-cover-bg.png';
  const coverItem = items.find(i => i.type === 'cover');
  const coverAbbr = coverItem?.filename && coverItem.filename.split('-').length >= 3
    ? coverItem.filename.split('-')[1]
    : null;
  const bgAbbr = coverAbbr || abbr;
  const bgName = bgPattern.replace('{seq}', seqNum).replace('{abbr}', bgAbbr);

  // 自动生成规范命名
  const typeDesc = { cover: 'cover', content: 'content', compare: 'compare', data: 'data', flow: 'flow', text: 'text', showcase: 'showcase' };

  return {
    assetType: slidesAssetType,
    series: assetTypeLabel(mdPath),
    outputDir: './Images',
    headless: true,
    images: items.map((item, i) => {
      const imgNum = String(i + 1).padStart(2, '0');
      const autoName = `${seqNum}-${abbr}-${imgNum}-${typeDesc[item.type] || 'page'}`;
      const filename = item.filename || autoName;
      const img = { type: item.type, filename };
      switch (item.type) {
        case 'cover':
          img.title = item.title || '';
          img.subtitle = item.subtitle || '';
          img.tagline = item.tagline || '';
          img.badges = item.badges || [];
          img.logoDecor = item.logoDecor || [];
          // 风格包 coverBg.disabled 时封面无底图（渐变兜底）；否则生成默认底图名（由风格包或默认命名决定）
          img.bgImage = item.bgImage || (stylePack?.coverBg?.disabled ? '' : bgName);
          img.bgPrompt = item.bgPrompt || '';
          break;
        case 'content':
          Object.assign(img, { pageNum: item.pageNum, sectionTitle: item.sectionTitle, footerText: item.footerText || '', cards: item.cards || [] });
          break;
        case 'data':
          Object.assign(img, { pageNum: item.pageNum, sectionTitle: item.sectionTitle, footerText: item.footerText || '', stats: item.stats || [] });
          break;
        case 'compare':
          Object.assign(img, { comparePageNum: item.pageNum || item.comparePageNum || '01', sectionTitle: item.sectionTitle });
          ['leftHeader','leftSub','vsText','rightHeader','rightSub','summaryText'].forEach(k => {
            if (item[k] !== undefined) img[k] = item[k];
          });
          // leftItems/rightItems: 纯字符串自动转 {label, value}
          ['leftItems','rightItems'].forEach(k => {
            if (item[k] !== undefined) {
              img[k] = item[k].map(v => typeof v === 'string' ? { label: '', value: v } : v);
            }
          });
          if (img.leftHeader === undefined && item.leftTitle !== undefined) img.leftHeader = item.leftTitle;
          if (img.rightHeader === undefined && item.rightTitle !== undefined) img.rightHeader = item.rightTitle;
          break;
        case 'text':
          Object.assign(img, { pageNum: item.pageNum, sectionTitle: item.sectionTitle, footerText: item.footerText || '', lines: item.lines || [] });
          break;
        case 'flow':
          Object.assign(img, { pageNum: item.pageNum, sectionTitle: item.sectionTitle, footerText: item.footerText || '', steps: item.steps || [] });
          break;
        case 'showcase':
          Object.assign(img, { pageNum: item.pageNum, sectionTitle: item.sectionTitle, footerText: item.footerText || '', items: item.items || [] });
          break;
      }
      return img;
    })
  };
}

function main() {
  const args = process.argv.slice(2);
  let mdPath = '';
  let outputPath = '';
  let stylePackPath = '';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--md') mdPath = args[++i];
    if (args[i] === '--output') outputPath = args[++i];
    if (args[i] === '--style-pack') stylePackPath = args[++i];
  }
  if (!mdPath || !fs.existsSync(mdPath)) { console.error('请指定 --md 路径'); process.exit(1); }

  const content = fs.readFileSync(mdPath, 'utf-8');
  const m = content.match(/\x60\x60\x60slides\s*([\s\S]*?)\x60\x60\x60/);
  if (!m) { console.error('未找到 ```slides 数据区'); process.exit(1); }

  const { items, meta } = parseYamlList(m[1]);

  // 加载风格包（可选）
  let stylePack = null;
  if (stylePackPath && fs.existsSync(stylePackPath)) {
    try { stylePack = JSON.parse(fs.readFileSync(stylePackPath, 'utf-8')); } catch {}
  }

  const root = path.dirname(path.dirname(mdPath));
  // rewriter 稿件位于 篇目/Distribute/{platform}/稿件.md（三级），输出到稿件同级 Images；
  // 主平台稿件位于 篇目/Manuscript/稿件.md（二级），输出到 篇目/Images（保持原行为）
  const mdDir = path.dirname(mdPath);
  // 兼容两种形态：相对路径 "Distribute/toutiao"（SKILL.md 推荐用法）与绝对路径 "D:/篇目/Distribute/toutiao"
  const inDistribute = /(^|[\\/])Distribute[\\/][^\\/]+$/.test(mdDir);
  const imgDir = outputPath
    ? path.resolve(path.dirname(outputPath))
    : inDistribute ? path.join(mdDir, 'Images') : path.join(root, 'Images');
  if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });

  const result = buildJson(items, meta, mdPath, stylePack);

  // 保留已有的底图文件：如果旧 content.json 里有 bgImage 且图片文件存在，不覆盖
  const oldPath = outputPath || path.join(imgDir, 'content.json');
  if (fs.existsSync(oldPath)) {
    try {
      const old = JSON.parse(fs.readFileSync(oldPath, 'utf-8'));
      for (const oldImg of old.images || []) {
        const newImg = result.images.find(i => i.filename === oldImg.filename);
        if (newImg && newImg.type === 'cover' && oldImg.bgImage && oldImg.bgImage !== newImg.bgImage) {
          const bgPath = path.join(imgDir, oldImg.bgImage);
          if (fs.existsSync(bgPath)) {
            newImg.bgImage = oldImg.bgImage;
          }
        }
      }
    } catch (_) {}
  }

  // outputDir 存相对路径，不覆盖 buildJson 中设置的 ./Images
  // 下游脚本自行 path.resolve(articleDir, outputDir) 得到正确绝对路径

  const out = outputPath || path.join(imgDir, 'content.json');
  fs.writeFileSync(out, JSON.stringify(result, null, 2), 'utf-8');
  console.log('✓ ' + out);
}

main();
