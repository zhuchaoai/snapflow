/**
 * generate-cover-bg.js — ComfyUI 封面底图一键生成脚本
 *
 * 功能：启动 ComfyUI（如未运行）→ 提交生成 → 轮询出图 → 拷贝重命名
 * 用法：node generate-cover-bg.js --config "篇目/Images/content.json" --md "篇目/Manuscript/稿件.md" [--style-pack style-pack.json]
 *
 * bgPrompt 从 --md 指定的稿件 slides 区读取，content.json 不存此字段。
 * ComfyUI URL、checkpoint、参数、输出目录、启动命令从风格包 coverBg 段读取。
 *
 * 脚本自动识别 ComfyUI 状态：已运行则跳过启动，未运行则执行 startCmd 后等待就绪。
 * 自动拷贝重命名到当期 Images/ 目录和 style pack 指定的输出目录。
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// ─── 参数解析 ────────────────────────
const args = process.argv.slice(2);
const getArg = (key, def) => {
  const idx = args.indexOf(key);
  return idx === -1 ? def : args[idx + 1] ?? def;
};

const configPath = path.resolve(getArg('--config', ''));
if (!configPath || !fs.existsSync(configPath)) {
  console.error('✗ 请指定 --config path/to/content.json');
  process.exit(1);
}

const mdPathArg = getArg('--md', '');
const mdPath = mdPathArg ? path.resolve(mdPathArg) : '';

const spPath = getArg('--style-pack', '');
let stylePack = null;
if (spPath && fs.existsSync(spPath)) {
  try { stylePack = JSON.parse(fs.readFileSync(spPath, 'utf-8')); } catch {}
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
const cover = config.images.find(i => i.type === 'cover');
if (!cover) {
  console.error('✗ content.json 中没有 cover 类型图片');
  process.exit(1);
}

const configDir = path.dirname(configPath);          // .../篇目/Images/（也是输出目录）
const outDir = configDir;

// ─── 风格包 ComfyUI 配置 ──────────────
const cb = stylePack?.coverBg || {};
const comfyuiUrl = cb.comfyui?.url || 'http://127.0.0.1:8188';
const comfyParams = cb.comfyui?.params || { steps: 25, cfg: 7, sampler_name: 'euler', scheduler: 'normal' };
const negativePrompt = cb.comfyui?.negativePrompt || '';
const ckptName = cb.comfyui?.checkpoint || process.env.COMFYUI_CHECKPOINT || '';
const comfyOutputDir = cb.outputDir || process.env.COMFYUI_OUTPUT_DIR || '';
const startWaitMs = 15 * 1000;

if (!ckptName) {
  throw new Error('未指定 checkpoint，请在风格包 coverBg.comfyui.checkpoint 或环境变量 COMFYUI_CHECKPOINT 中设置');
}
if (!comfyOutputDir) {
  throw new Error('未指定 ComfyUI 输出目录，请在风格包 coverBg.outputDir 或环境变量 COMFYUI_OUTPUT_DIR 中设置');
}

// ─── 从稿件 slides 区读取 bgPrompt ────
function parseSlidesBgPrompt(mdFile) {
  if (!mdFile || !fs.existsSync(mdFile)) return '';
  const text = fs.readFileSync(mdFile, 'utf-8');
  const m = text.match(/```slides\s*([\s\S]*?)```/);
  if (!m) return '';
  const section = m[1];
  // 找 cover 条目的 bgPrompt 值
  const coverMatch = section.match(/(?:^|\n)\s*-\s*type:\s*cover[\s\S]*?(?=\n\s*-\s*type:|$)/);
  if (!coverMatch) return '';
  const block = coverMatch[0];
  const bgMatch = block.match(/bgPrompt:\s*"([^"]*)"/);
  return bgMatch ? bgMatch[1] : '';
}

const bgPrompt = parseSlidesBgPrompt(mdPath);

// ─── 工具 ────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── 步骤1：检查 ComfyUI 是否在线，未运行则启动 ────
async function ensureComfyUI() {
  // 先试一次
  try {
    const res = await fetch(comfyuiUrl + '/system_stats');
    if (res.ok) { console.log('  ✓ ComfyUI 已运行'); return; }
  } catch {}

  console.log('  → ComfyUI 未运行，启动中...');
  await new Promise((resolve) => {
    exec('powershell.exe -Command "& { Start-Process -WindowStyle Normal -FilePath D:\\ComfyUI\\.venv\\Scripts\\python.exe -ArgumentList main.py,--port,8188,--listen -WorkingDirectory D:\\ComfyUI }"', (err) => resolve());
  });

  console.log(`    等待 ${startWaitMs / 1000} 秒...`);
  await sleep(startWaitMs);

  // 重试一次
  try {
    const res = await fetch(comfyuiUrl + '/system_stats');
    if (res.ok) { console.log('  ✓ ComfyUI 已就绪'); return; }
  } catch {}
  throw new Error('ComfyUI 启动后仍不可达，请检查');
}

// ─── 步骤2：提交生成 ────────────────
async function submitGeneration() {
  const prompt = bgPrompt || 'dark background, minimalist composition';
  const seed = Math.floor(Math.random() * 1000000000);

  const payload = {
    prompt: {
      "3": {
        "class_type": "KSampler",
        "inputs": {
          "seed": seed,
          "steps": comfyParams.steps || 25,
          "cfg": comfyParams.cfg || 7,
          "sampler_name": comfyParams.sampler_name || 'euler',
          "scheduler": comfyParams.scheduler || 'normal',
          "denoise": 1,
          "model": ["4", 0],
          "positive": ["6", 0],
          "negative": ["7", 0],
          "latent_image": ["5", 0]
        }
      },
      "4": {
        "class_type": "CheckpointLoaderSimple",
        "inputs": { "ckpt_name": ckptName }
      },
      "5": {
        "class_type": "EmptyLatentImage",
        "inputs": { "width": 1242, "height": 1660, "batch_size": 1 }
      },
      "6": {
        "class_type": "CLIPTextEncode",
        "inputs": { "text": prompt, "clip": ["4", 1] }
      },
      "7": {
        "class_type": "CLIPTextEncode",
        "inputs": { "text": negativePrompt, "clip": ["4", 1] }
      },
      "8": {
        "class_type": "VAEDecode",
        "inputs": { "samples": ["3", 0], "vae": ["4", 2] }
      },
      "9": {
        "class_type": "SaveImage",
        "inputs": { "filename_prefix": "ComfyUI", "images": ["8", 0] }
      }
    }
  };

  const res = await fetch(comfyuiUrl + '/prompt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    throw new Error('提交失败: ' + res.statusText);
  }

  const data = await res.json();
  console.log(`  ✓ 已提交，prompt_id: ${data.prompt_id}`);
  return data.prompt_id;
}

// ─── 步骤3：轮询出图 ────────────────
async function pollGeneration(promptId) {
  const check = async () => {
    try {
      const res = await fetch(comfyuiUrl + `/history/${promptId}`);
      if (!res.ok) return null;
      const data = await res.json();
      return data[promptId] || null;
    } catch { return null; }
  };

  // 第1次：35秒（实测最优值）
  console.log('    等35秒...');
  await sleep(35000);
  let result = await check();
  if (result?.status?.completed) return result;
  console.log('    未完成');

  // 第2次：15秒
  console.log('    等15秒...');
  await sleep(15000);
  result = await check();
  if (result?.status?.completed) return result;
  console.log('    未完成');

  // 第3次：15秒
  console.log('    等15秒...');
  await sleep(15000);
  result = await check();
  if (result?.status?.completed) return result;

  throw new Error('出图超时，可能卡住了');
}

// ─── 步骤4：拷贝文件 ────────────────
function copyOutput(historyResult) {
  const outputs = historyResult.outputs;
  if (!outputs) throw new Error('未找到输出文件');

  for (const nodeId of Object.keys(outputs)) {
    const node = outputs[nodeId];
    if (node.images && node.images.length > 0) {
      const img = node.images[0];
      const srcPath = path.join(comfyOutputDir, img.filename);
      const dstName = cover.bgImage || `${img.filename}`;
      const dstPath = path.join(outDir, dstName);

      if (fs.existsSync(srcPath)) {
        fs.copyFileSync(srcPath, dstPath);
        console.log(`  ✓ 底图已生成: ${dstName}`);
        return;
      }
    }
  }

  throw new Error('找不到输出文件');
}

// ─── 主流程 ──────────────────────────
async function main() {
  console.log('── 封面底图生成 ──────────────');
  try {
    await ensureComfyUI();
    const promptId = await submitGeneration();
    const history = await pollGeneration(promptId);
    copyOutput(history);
  } catch (err) {
    console.error('\n✗', err.message);
    process.exitCode = 1;
  } finally {
    console.log('  ※ ComfyUI 保持运行，请手动关闭');
    console.log('──────────────────────────────');
  }
}

main();
