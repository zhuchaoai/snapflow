/**
 * comfy-lifecycle.js — ComfyUI 延迟退出生命周期管理（纯 Linux / Ubuntu）
 *
 * 核心思路：以"最后一次脚本调用结束"为准，闲置超过阈值（默认 30min）后
 * 自动退出 ComfyUI，释放 GPU 显存。多个脚本并发使用安全：
 *   - 状态文件共享 + 原子写（临时文件 + rename），并发刷新取最后值
 *   - 看门狗进程幂等去重（watchdog.pid 探活），最多 1 个存活
 *   - 只管理"脚本自己启动"的实例（startedByUs），用户手动开的 ComfyUI 绝不杀
 *
 * 被截图/底图脚本 require：
 *   const lifecycle = require('./comfy-lifecycle.js');
 *   lifecycle.markManaged({ url });   // 脚本真正执行了启动命令时登记（仅此分支登记）
 *   lifecycle.touch();                // 每次调用结束刷新 lastUsedAt
 *   lifecycle.schedule();             // 排程/刷新看门狗（幂等）
 *
 * CLI 看门狗模式（由 schedule() 自动 spawn，detached + unref）：
 *   node comfy-lifecycle.js --watchdog
 *
 * 环境变量：
 *   COMFYUI_IDLE_TIMEOUT_MS   闲置超时毫秒（默认 30 分钟）
 *   COMFYUI_POLL_INTERVAL_MS  看门狗轮询间隔毫秒（默认 30s）
 *   COMFYUI_STOP_CMD           停止命令（默认 bash -lc 'comfyui stop'）
 *   COMFYUI_URL                ComfyUI 地址（默认 http://127.0.0.1:8188）
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, exec } = require('child_process');

const STATE_DIR = path.join(os.homedir(), '.cache', 'snapflow');
const STATE_FILE = path.join(STATE_DIR, 'comfyui-lifecycle.json');
const WATCHDOG_PID_FILE = path.join(STATE_DIR, 'comfyui-watchdog.pid');
const WATCHDOG_LOG_FILE = path.join(STATE_DIR, 'comfyui-watchdog.log');

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;   // 30 min
const POLL_INTERVAL_MS = 30 * 1000;           // 轮询间隔
const IS_WIN = process.platform === 'win32';

// 停止命令平台默认：linux/darwin 用 bash + comfyui 脚本；win32 用 PowerShell + comfyui.ps1
const DEFAULT_STOP_CMD = IS_WIN
  ? `powershell -NoProfile -ExecutionPolicy Bypass -File "${path.join(os.homedir(), '.local', 'bin', 'comfyui.ps1')}" stop`
  : "bash -lc 'comfyui stop'";

// 强杀兜底（优雅停止失败后）：win32 无 pkill，用 Stop-Process
const DEFAULT_KILL_CMD = IS_WIN
  ? 'powershell -NoProfile -Command "Get-Process python* -ErrorAction SilentlyContinue | Stop-Process -Force"'
  : "bash -lc 'pkill -9 -f \"python main.py --listen\"'";

const DEFAULT_URL = 'http://127.0.0.1:8188';

// ─── 配置 ──────────────────────────────────────────
function getTimeoutMs() {
  const v = parseInt(process.env.COMFYUI_IDLE_TIMEOUT_MS || '', 10);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_TIMEOUT_MS;
}
function getPollIntervalMs() {
  const v = parseInt(process.env.COMFYUI_POLL_INTERVAL_MS || '', 10);
  return Number.isFinite(v) && v > 0 ? v : POLL_INTERVAL_MS;
}
function getStopCmd() {
  return process.env.COMFYUI_STOP_CMD || DEFAULT_STOP_CMD;
}
function getKillCmd() {
  return process.env.COMFYUI_KILL_CMD || DEFAULT_KILL_CMD;
}
function getUrl() {
  return process.env.COMFYUI_URL || DEFAULT_URL;
}

// ─── 状态文件（原子写） ────────────────────────────
function readState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')); }
  catch { return null; }
}
function writeState(state) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const tmp = STATE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STATE_FILE);
}
function clearState() {
  try { fs.unlinkSync(STATE_FILE); } catch {}
}

// ─── 对外 API ──────────────────────────────────────
/**
 * 登记托管实例：仅在脚本真正执行了启动命令（ComfyUI 由脚本拉起）后调用。
 * ComfyUI 已在线（用户手动启动）时不要调用——看门狗只管理登记过的实例。
 */
function markManaged({ url } = {}) {
  const state = readState() || {};
  writeState({ ...state, startedByUs: true, url: url || getUrl(), lastUsedAt: Date.now() });
}

/** 使用结束登记：刷新 lastUsedAt（保留 startedByUs/url） */
function touch() {
  const state = readState() || {};
  writeState({ ...state, lastUsedAt: Date.now() });
}

/** 排程看门狗（幂等：已有存活看门狗则跳过，不叠加） */
function schedule() {
  if (isWatchdogAlive()) return false;
  const child = spawn(process.execPath, [__filename, '--watchdog'], {
    detached: true,
    stdio: 'ignore',
    env: process.env,
  });
  child.unref();
  return true;
}

// ─── 看门狗探活 / 去重 ─────────────────────────────
function isWatchdogAlive() {
  try {
    const pid = parseInt(fs.readFileSync(WATCHDOG_PID_FILE, 'utf-8'), 10);
    if (!Number.isFinite(pid) || pid <= 0) return false;
    process.kill(pid, 0);   // 只探活，不发送信号
    return true;
  } catch { return false; }
}

// ─── 看门狗日志（detached stdio=ignore，落盘便于排查） ──
function wlog(msg) {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.appendFileSync(WATCHDOG_LOG_FILE, `${new Date().toISOString()} ${msg}\n`);
  } catch {}
}

// ─── 看门狗主体 ────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchJson(url, pathname) {
  try {
    const res = await fetch(url + pathname);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function isRunning(url) {
  return !!(await fetchJson(url, '/system_stats'));
}

async function isQueueBusy(url) {
  const data = await fetchJson(url, '/queue');
  if (!data) return false;
  const running = data.queue_running || [];
  return running.length > 0;
}

/** 执行停止命令并等待下线，未生效则强杀兜底 */
async function stopComfyUI(url) {
  const cmd = getStopCmd();
  wlog(`执行停止: ${cmd}`);
  await new Promise(resolve => exec(cmd, () => resolve()));

  // 等待下线（最多 30s）
  for (let i = 0; i < 10; i++) {
    if (!(await isRunning(url))) return true;
    await sleep(3000);
  }
  // 兜底强杀（平台自适应：win32 用 Stop-Process，其余用 pkill）
  wlog('优雅停止未生效，尝试强杀兜底');
  await new Promise(resolve => exec(getKillCmd(), () => resolve()));
  await sleep(3000);
  return !(await isRunning(url));
}

async function watchdogMain() {
  const timeoutMs = getTimeoutMs();
  const pollIntervalMs = getPollIntervalMs();
  const url = getUrl();
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(WATCHDOG_PID_FILE, String(process.pid));
  wlog(`看门狗启动: pid=${process.pid} timeout=${Math.round(timeoutMs / 60000)}min poll=${pollIntervalMs}ms url=${url}`);

  while (true) {
    await sleep(pollIntervalMs);
    const state = readState();
    if (!state || !state.startedByUs) {
      wlog('无托管实例（状态缺失或非本脚本启动），看门狗退出');
      break;
    }

    const idleMs = Date.now() - (state.lastUsedAt || 0);
    if (idleMs < timeoutMs) continue;   // 仍在使用窗口内，继续等

    wlog(`闲置 ${Math.round(idleMs / 60000)}min 超过阈值，准备退出`);
    if (await isQueueBusy(url)) {
      wlog('队列仍有任务渲染，顺延计时');
      touch();
      continue;
    }
    if (!(await isRunning(url))) {
      wlog('ComfyUI 已不在运行，清理状态后退出');
      clearState();
      break;
    }

    const stopped = await stopComfyUI(url);
    if (stopped) wlog('ComfyUI 已停止');
    else wlog('停止未完全生效（下个使用会重新启动）');
    clearState();
    break;
  }

  // 清理看门狗 pid（仅当仍是自己的）
  try {
    if (fs.readFileSync(WATCHDOG_PID_FILE, 'utf-8') === String(process.pid)) {
      fs.unlinkSync(WATCHDOG_PID_FILE);
    }
  } catch {}
  wlog('看门狗退出');
  process.exit(0);
}

// ─── 模块导出 / CLI 入口 ───────────────────────────
module.exports = { markManaged, touch, schedule };

if (require.main === module) {
  if (process.argv.includes('--watchdog')) {
    watchdogMain();
  }
}
