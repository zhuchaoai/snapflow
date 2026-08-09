#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
// style-pack-resolver.js — 风格包解析器（交互式选择 + 名称匹配）
// 扫描 style-packs/*.json，支持：
//   1. 路径直接指定：style-pack-resolver.js style-packs/炭火.json
//   2. 名称/文件名匹配：style-pack-resolver.js 炭火 或 default
//   3. 未指定且终端交互：弹菜单选择（按使用频率排序）
// 使用频率记录在 ~/.config/opencode/style-pack-usage.json
// ─────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

const STYLE_PACKS_DIR = path.resolve(__dirname, 'style-packs');
const PLATFORMS_DIR = path.resolve(__dirname, 'rewriter', 'platforms');
const USAGE_FILE = path.join(os.homedir(), '.config', 'opencode', 'style-pack-usage.json');

// 扫描主目录 style-packs/（兼容两种结构：平铺 *.json 或 自包含文件夹 */style-pack.json）
// + 副平台 rewriter/platforms/*/style-pack.json
// 返回 [{file, path, name, group}]，file 含相对路径前缀避免重名
function listStylePacks() {
  const packs = [];

  if (fs.existsSync(STYLE_PACKS_DIR)) {
    for (const entry of fs.readdirSync(STYLE_PACKS_DIR)) {
      const abs = path.join(STYLE_PACKS_DIR, entry);
      // ① 自包含文件夹：{name}/style-pack.json（新结构，包 = 文件夹，含模板/README）
      const folderPack = path.join(abs, 'style-pack.json');
      if (fs.statSync(abs).isDirectory() && fs.existsSync(folderPack)) {
        try {
          const pack = JSON.parse(fs.readFileSync(folderPack, 'utf-8'));
          packs.push({
            file: path.join(entry, 'style-pack.json'),
            path: folderPack,
            name: pack.pack?.name || entry,
            group: 'main',
          });
        } catch { /* 解析失败跳过 */ }
        continue;
      }
      // ② 平铺 JSON（旧结构兼容）
      if (entry.endsWith('.json')) {
        try {
          const pack = JSON.parse(fs.readFileSync(abs, 'utf-8'));
          packs.push({
            file: entry,
            path: abs,
            name: pack.pack?.name || entry.replace(/\.json$/, ''),
            group: 'main',
          });
        } catch { /* 解析失败跳过 */ }
      }
    }
  }

  if (fs.existsSync(PLATFORMS_DIR)) {
    for (const platform of fs.readdirSync(PLATFORMS_DIR)) {
      const abs = path.join(PLATFORMS_DIR, platform, 'style-pack.json');
      if (!fs.existsSync(abs)) continue;
      try {
        const pack = JSON.parse(fs.readFileSync(abs, 'utf-8'));
        packs.push({
          file: path.join(platform, 'style-pack.json'),
          path: abs,
          name: pack.pack?.name || platform,
          group: 'platform',
        });
      } catch { /* 解析失败跳过 */ }
    }
  }

  return packs;
}

// 读取使用频率
function loadUsage() {
  try {
    return JSON.parse(fs.readFileSync(USAGE_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

// 记录一次使用（静默失败，不阻塞截图流程）
function recordUsage(file) {
  try {
    const usage = loadUsage();
    usage[file] = (usage[file] || 0) + 1;
    fs.mkdirSync(path.dirname(USAGE_FILE), { recursive: true });
    fs.writeFileSync(USAGE_FILE, JSON.stringify(usage, null, 2));
  } catch { /* 记录失败不影响主流程 */ }
}

// 按使用频率降序排序（同频率按文件名）
function sortByUsage(packs) {
  const usage = loadUsage();
  return [...packs].sort((a, b) => {
    const d = (usage[b.file] || 0) - (usage[a.file] || 0);
    return d !== 0 ? d : a.file.localeCompare(b.file);
  });
}

// 按名称/文件名匹配（支持不带 .json 后缀、支持短名如 "炭火" 匹配 "Snapflow · 炭火"）
function matchByName(packs, query) {
  const q = query.replace(/\.json$/, '').trim();
  return packs.find(p =>
    p.file === q + '.json' || p.file === q || p.name === q || p.name.includes(q)
  ) || null;
}

// 交互菜单选择（主平台风格包 / 副平台风格包分组显示）
// 真终端（人直接跑）：正常等输入，15s 超时自动选高频包。
// 非终端（agent 调用，主流场景）：agent 无法向子进程 stdin 输入，打印菜单后立即 fallback 高频包，零等待。
async function pickInteractive(packs) {
  const usage = loadUsage();
  const sorted = sortByUsage(packs);
  const groups = [
    { label: '主平台风格包（style-packs/）', packs: sorted.filter(p => p.group === 'main') },
    { label: '副平台风格包（rewriter/platforms/）', packs: sorted.filter(p => p.group === 'platform') },
  ].filter(g => g.packs.length > 0);

  console.log('\n📦 可用风格包:');
  let n = 0;
  for (const g of groups) {
    console.log(`\n  ${g.label}`);
    for (const p of g.packs) {
      n++;
      const u = usage[p.file] || 0;
      const hot = u > 0 ? ` 🔥${u}次` : '';
      const top = n === 1 ? ' ⭐' : '';
      console.log(`  ${n}. ${p.name}${top}${hot}  (${p.file})`);
    }
  }

  const fallback = sorted[0];

  // 非交互环境（agent 调用）→ 打印菜单后立即 fallback，零等待
  if (!process.stdin.isTTY) {
    console.log(`\n  → 非交互环境，自动使用高频包: ${fallback.name}`);
    return fallback;
  }

  const timeoutMs = 15000;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  return new Promise(resolve => {
    let settled = false;
    const done = (pick) => {
      if (settled) return;
      settled = true;
      try { rl.close(); } catch {}
      resolve(pick);
    };

    // 超时 → fallback 高频包
    const timer = setTimeout(() => {
      console.log(`\n  ⏱ ${timeoutMs / 1000}s 未选择，自动使用高频包: ${fallback.name}`);
      done(fallback);
    }, timeoutMs);

    rl.question(`\n请选择 (1-${sorted.length}) [默认 1，${timeoutMs / 1000}s 超时自动选高频]: `, answer => {
      clearTimeout(timer);
      const idx = parseInt(answer.trim(), 10) - 1;
      const pick = Number.isNaN(idx) ? 0 : idx;
      done(sorted[Math.min(Math.max(pick, 0), sorted.length - 1)]);
    });
  });
}

// 主入口：specified 可为 undefined（交互选择）、路径、文件名或名称
// 返回 {file, path, name}；找不到时打印错误并 exit(1)
async function resolveStylePack(specified) {
  const packs = listStylePacks();

  // ① 直接传路径（存在）
  if (specified && fs.existsSync(specified)) {
    const abs = path.resolve(specified);
    const existing = packs.find(p => p.path === abs);
    return existing || { file: path.basename(abs), path: abs, name: path.basename(abs, '.json') };
  }

  // ② 按名称/文件名匹配
  if (specified) {
    const match = matchByName(packs, specified);
    if (match) return match;
    console.error(`  ✗ 未找到风格包: ${specified}`);
    console.error(`    可用: ${packs.map(p => p.name).join(' / ') || '（无）'}`);
    process.exit(1);
  }

  // ③ 未指定 → 交互选择（任何环境都弹菜单，超时/无输入自动选高频包）
  if (packs.length === 0) return null;
  return await pickInteractive(packs);
}

module.exports = { resolveStylePack, listStylePacks, recordUsage, sortByUsage, STYLE_PACKS_DIR };

// CLI 直跑模式
if (require.main === module) {
  (async () => {
    const specified = process.argv[2];
    const picked = await resolveStylePack(specified);
    if (picked) {
      recordUsage(picked.file);
      console.log(`  ✓ 已选择风格包: ${picked.name}  (${picked.path})`);
    } else {
      console.error('  ✗ 未找到可用风格包');
      process.exit(1);
    }
  })();
}
