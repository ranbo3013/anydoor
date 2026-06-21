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

### 环境要求

- Node.js >= 18
- pnpm（`npm install -g pnpm`）

### 安装与启动

```bash
# 克隆仓库
git clone https://github.com/ranbo3013/anydoor.git
cd anydoor

# 安装依赖
pnpm install

# 启动（前端 + 后端同时启动）
pnpm dev
```

启动后：
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

## 🛠 技术栈

- **前端**：Taro + React + Tailwind CSS + shadcn/ui
- **后端**：NestJS + node-fetch
- **存储**：本地 JSON 文件
- **协议**：OpenAI Chat Completions / Responses API / Anthropic 兼容

## 📁 项目结构

```
server/src/gateway/
├── gateway.types.ts       # 类型定义
├── gateway.store.ts       # 本地 JSON 存储
├── gateway.service.ts     # 路由解析 + 协议转换
├── gateway.controller.ts  # API 接口 + 代理转发
└── gateway.module.ts      # NestJS 模块

src/pages/index/
└── index.tsx              # 前端管理面板
```

## 📄 License

MIT
