# AnyDoor 🚪

**任意门** — 本地 AI 模型网关，一键连接 Claude Code / Codex 到任意大模型。

就像哆啦A梦的任意门，打开门，想到哪个模型就到哪个模型。

## ✨ 功能特性

- **Provider 管理**：添加 Agnes、DeepSeek、OpenAI 等任意 OpenAI 兼容 API
- **路由配置**：为每个 CLI 工具指定使用哪个 Provider 和模型
- **协议转换**：自动将 Codex 的 Responses API 转换为 Chat Completions 格式
- **SSE 流式透传**：实时转换流式响应事件
- **Web 管理面板**：浏览器管理供应商、路由、查看请求日志
- **CLI 配置导出**：一键生成 Codex / Claude Code 配置
- **Mac 桌面应用**：支持 .dmg 安装包，系统托盘常驻

## 🏗 架构

```
┌─────────────┐     ┌──────────────────────────────────┐
│ Claude Code │────▶│                                  │
│ Codex       │────▶│  AnyDoor 网关 (NestJS)           │
│ 其他 CLI    │────▶│  ├─ 代理端口 :3000/api/gateway   │
└─────────────┘     │  ├─ 协议转换 (Responses ↔ Chat)  │
                    │  └─ 管理面板 UI :5000             │
┌─────────────┐     │                                  │
│ 浏览器      │────▶│  管理面板 (添加Provider/配置路由) │
└─────────────┘     └──────────┬───────────┬───────────┘
                               │           │
                    ┌──────────▼──┐  ┌──────▼───────┐
                    │ Agnes API   │  │ DeepSeek API  │
                    └─────────────┘  └──────────────┘
```

## 🚀 快速开始

### 方式一：桌面应用（Mac 推荐方式）

1. 从 [Releases](https://github.com/ranbo3013/anydoor/releases) 下载 `AnyDoor.dmg`
2. 双击打开，拖到「应用程序」文件夹
3. 启动 AnyDoor，系统托盘出现门图标
4. 浏览器自动打开管理面板

### 方式二：从源码运行

#### 环境要求

- Node.js >= 18
- pnpm（`npm install -g pnpm`）

#### 安装与启动

```bash
# 克隆仓库
git clone https://github.com/ranbo3013/anydoor.git
cd anydoor

# 安装依赖
pnpm install

# 方式 A：Web 模式启动（前端 + 后端）
pnpm dev

# 方式 B：桌面应用开发模式（需要 macOS）
pnpm dev:desktop
```

Web 模式启动后：
- **管理面板**：http://localhost:5000
- **网关代理**：http://localhost:3000/api/gateway/proxy

### 配置供应商

在管理面板的「供应商」页面添加：

| 字段 | Agnes 示例 | DeepSeek 示例 |
|---|---|---|
| 名称 | Agnes | DeepSeek |
| API 格式 | OpenAI Chat | OpenAI Chat |
| 接口地址 | `https://apihub.agnes-ai.com/v1` | `https://api.deepseek.com/v1` |
| API 密钥 | 你的 Agnes Key | 你的 DeepSeek Key |
| 模型列表 | `agnes-2.0-flash` | `deepseek-chat, deepseek-coder` |

### 配置路由

在「路由」页面为 CLI 工具指定供应商和模型：

| CLI 工具 | 供应商 | 模型 |
|---|---|---|
| Codex | Agnes | agnes-2.0-flash |
| Claude Code | DeepSeek | deepseek-chat |

### 连接 CLI 工具

在「路由」页面点击「导出配置」，或手动配置：

**Codex** — 编辑 `~/.codex/config.toml`：
```toml
base_url = "http://localhost:3000/api/gateway/proxy"
wire_api = "responses"
```

**Claude Code** — 设置环境变量：
```bash
export ANTHROPIC_BASE_URL="http://localhost:3000/api/gateway/proxy"
export ANTHROPIC_API_KEY="gateway-proxy-key"
```

## 📦 打包 Mac 桌面应用

```bash
# 1. 构建前端 + 后端 + Electron
pnpm build:desktop

# 2. 生成应用图标（首次）
node electron/generate-icon.js

# 3. 打包 .dmg 安装包
npx electron-builder --mac
```

打包完成后，安装包在 `release/` 目录下：
- `AnyDoor-1.0.0-universal.dmg` — Mac 安装包
- `AnyDoor-1.0.0-universal-mac.zip` — 免安装版

### 桌面应用功能

- ✅ 双击启动，自动运行后端网关
- ✅ 系统托盘常驻，关闭窗口不退出
- ✅ 托盘菜单显示代理地址，点击复制
- ✅ Dock 图标点击恢复窗口
- ✅ macOS 原生窗口样式

## 🛠 技术栈

- **前端**：Taro + React + Tailwind CSS + shadcn/ui
- **后端**：NestJS + node-fetch
- **桌面**：Electron
- **打包**：electron-builder (.dmg)
- **存储**：本地 JSON 文件
- **协议**：OpenAI Chat Completions / Responses API / Anthropic 兼容

## 📁 项目结构

```
├── electron/                 # Electron 桌面应用
│   ├── main.ts              # 主进程（启动服务 + 窗口 + 托盘）
│   ├── build.js             # Electron 编译脚本
│   ├── generate-icon.js     # 图标生成脚本
│   ├── entitlements.mac.plist  # macOS 权限声明
│   └── assets/              # 应用图标
├── server/src/gateway/      # 后端网关核心
│   ├── gateway.types.ts     # 类型定义
│   ├── gateway.store.ts     # 本地 JSON 存储
│   ├── gateway.service.ts   # 路由解析 + 协议转换
│   ├── gateway.controller.ts # API 接口 + 代理转发
│   └── gateway.module.ts    # NestJS 模块
├── src/pages/index/         # 前端管理面板
│   └── index.tsx            # 主界面
└── dist/                    # 前端构建产物
```

## 📄 License

MIT
