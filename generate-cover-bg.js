/**
 * generate-cover-bg.js — ComfyUI 封面底图一键生成脚本
 *
 * 功能：提交生成 → 轮询出图 → 拷贝重命名
 * 用法：node generate-cover-bg.js --config "篇目/Images/content.json" --md "篇目/Manuscript/稿件.md" [--style-pack style-pack.json]
 *
 * bgPrompt 从 --md 指定的稿件 slides 区读取，content.json 不存此字段。
 * ComfyUI URL、checkpoint、参数、输出目录从风格包 coverBg 段读取。
 *
 * 前置条件：ComfyUI 必须已启动（由 agent 用 MCP 命令启动）
 *           6篇循环时仅需启动一次，脚本自动识别已完成状态
 *
 * 注意：本脚本只处理1张底图。6篇循环由Skill控制。
 */

const fs = require('fs');
const path = require('path');

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

if (!ckptName) {
  console.error('✗ 未指定 checkpoint，请在风格包 coverBg.comfyui.checkpoint 或环境变量 COMFYUI_CHECKPOINT 中设置');
  process.exit(1);
}
if (!comfyOutputDir) {
  console.error('✗ 未指定 ComfyUI 输出目录，请在风格包 coverBg.outputDir 或环境变量 COMFYUI_OUTPUT_DIR 中设置');
  process.exit(1);
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

// ─── 步骤1：检查 ComfyUI 是否在线 ────
async function ensureComfyUI() {
  try {
    const res = await fetch(comfyuiUrl + '/system_stats');
    if (res.ok) return;
  } catch {}
  console.error('✗ ComfyUI 未运行，请先用 MCP 命令启动');
  process.exit(1);
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
    console.error('✗ 提交失败:', res.statusText);
    process.exit(1);
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

  console.error('✗ 出图超时，可能卡住了');
  process.exit(1);
}

// ─── 步骤4：拷贝文件 ────────────────
function copyOutput(historyResult) {
  const outputs = historyResult.outputs;
  if (!outputs) {
    console.error('✗ 未找到输出文件');
    process.exit(1);
  }

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

  console.error('✗ 找不到输出文件');
  process.exit(1);
}

// ─── 主流程 ──────────────────────────
async function main() {
  console.log('── 封面底图生成 ──────────────');
  await ensureComfyUI();
  const promptId = await submitGeneration();
  const history = await pollGeneration(promptId);

  copyOutput(history);
  console.log('──────────────────────────────');
}

main().catch(err => {
  console.error('\n✗ 脚本运行失败:', err.message);
  process.exit(1);
});
