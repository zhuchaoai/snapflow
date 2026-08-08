/**
 * slides-parser.js
 * 解析稿件 .md 中的 ```slides 数据区 + 正文，供改写器使用。
 * 独立模块，复制自 snapflow/md2content.js 的解析逻辑，不依赖主项目。
 */
const fs = require('fs');

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

      if (indent <= 2) {
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

      if (list) {
        const am = t.match(/^-\s*(.+)/);
        if (am) {
          const content = am[1].trim();
          if (content.startsWith('{') && content.endsWith('}')) {
            try {
              obj = JSON.parse(content);
              list.push(obj);
            } catch {
              list.push(content);
            }
            obj = null;
            continue;
          }
          const kv = content.match(/^(\w+):\s*(.*?)(?:,\s*(\w+):\s*(.*))?$/);
          if (kv) {
            obj = {};
            obj[kv[1]] = parseVal(kv[2]);
            if (kv[3]) {
              obj[kv[3]] = parseVal(kv[4]);
            }
            list.push(obj);
          } else {
            list.push(content.replace(/^"|"$/g, '').replace(/\\"/g, '"'));
            obj = null;
          }
          continue;
        }

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

/**
 * 从稿件 .md 提取正文和 slides 数据区。
 * 返回 { frontmatter, body, slides: {items, meta} }
 * - frontmatter: YAML 头部（--- 之间）原文
 * - body: 正文部分（frontmatter 之后、```slides 之前）
 * - slides: 解析后的 slides 数据
 */
function parseManuscript(mdPath) {
  const content = fs.readFileSync(mdPath, 'utf-8');

  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  const frontmatter = fmMatch ? fmMatch[1] : '';

  const slidesMatch = content.match(/```slides\s*([\s\S]*?)```/);
  const slides = slidesMatch ? parseYamlList(slidesMatch[1]) : { items: [], meta: {} };

  let body = content;
  if (fmMatch) body = body.slice(fmMatch[0].length);
  if (slidesMatch) body = body.replace(slidesMatch[0], '');
  body = body.trim();

  return { frontmatter, body, slides };
}

module.exports = { parseVal, parseYamlList, parseManuscript };
