# Snapflow 中国网络环境优化指南

> 本指南是付费风格包附赠内容，帮助国内用户顺畅搭建 Snapflow 环境。

---

## 目录

- [Git 安装](#git-安装)
- [npm 镜像配置](#npm-镜像配置)
- [浏览器选择](#浏览器选择)
- [GitHub 访问](#github-访问)
- [opencode 安装](#opencode-安装)
- [常见问题排查](#常见问题排查)

---

## Git 安装

### 镜像站下载（推荐）

浏览器打开淘宝镜像站，找到最新版 `Git-xxx-64-bit.exe` 下载：

```
https://registry.npmmirror.com/binary.html?path=git-for-windows/
```

### 命令行下载

```powershell
curl -L -o Git-2.45.2-64-bit.exe https://registry.npmmirror.com/-/binary/git-for-windows/v2.45.2.windows.1/Git-2.45.2-64-bit.exe
```

### 验证安装

```powershell
git --version
```

---

## npm 镜像配置

### 临时代理（单次使用）

```powershell
npm install --registry https://registry.npmmirror.com
```

### 永久配置（推荐）

```powershell
npm config set registry https://registry.npmmirror.com
```

配置后所有 `npm install` 自动走淘宝镜像，无需每次加参数。

### 恢复官方源

```powershell
npm config delete registry
```

---

## 浏览器选择

Snapflow 截图需要浏览器，按优先级推荐：

### 方案一：Edge（推荐）

Windows 预装，零安装成本。

```powershell
npm run demo:edge
```

> 精简版 Windows 可能不含 Edge，自行下载安装即可。

### 方案二：Chrome

```powershell
npm run demo:chrome
```

### 方案三：Playwright 自带 Chromium

```powershell
npx playwright install chromium
npm run demo
```

> 国内网络下 Chromium 下载可能失败，优先使用方案一或二。

---

## GitHub 访问

### hosts 劫持问题

部分代理软件（Watt Toolkit / Steam++、Clash、Nekoray）会修改 Windows hosts 文件将 GitHub 域名指向 `127.0.0.1`。

**症状**：浏览器能访问 GitHub，但 `git push` / `git clone` 报 `Failed to connect to github.com port 443`。

**检查方法**：

```powershell
# 在 WSL 中查看
getent hosts github.com

# 在 Windows 中查看 hosts 文件
cat C:\Windows\System32\drivers\etc\hosts
```

如果返回 `127.0.0.1`，说明被劫持了。

**解法**：

1. 临时方案：关闭代理软件后再执行 git 操作
2. 永久方案：在代理软件设置中关闭"修改 hosts"或"系统代理"功能

### clone 加速

如果 `git clone` 太慢，使用镜像代理：

```bash
git clone https://ghproxy.com/https://github.com/zhuchaoai/snapflow.git
```

或者直接下 ZIP（无需 git）：

> GitHub 页面 → 绿色 **Code** 按钮 → **Download ZIP**

---

## opencode 安装

### 淘宝镜像

```powershell
npm install -g opencode-ai --registry https://registry.npmmirror.com
```

### 验证

```powershell
opencode --version
```

---

## 常见问题排查

### Q：npm install 卡住不动

用淘宝镜像重试。

### Q：截图报"浏览器启动失败"

没装对应浏览器。换成 `--channel msedge` 或 `--channel chrome`。

### Q：git push 报 443 错误

关掉 Watt Toolkit / 代理软件。

### Q：WSL 中连不上 GitHub

检查 Windows hosts 文件有无 GitHub 条目，删除或关掉代理软件。

---

> **最后更新**：2026-07-23
> 
> 本指南持续更新，购买风格包后如有新问题可联系作者补充。
