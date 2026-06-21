# AI Gateway - 设计指南

## 品牌定位
本地 AI 模型网关，协议转换代理。连接 Claude Code / Codex 与任意大模型（Agnes、DeepSeek 等）。

## 配色方案

| 用途 | Tailwind 类名 | 色值 |
|---|---|---|
| 主色（活跃/成功） | `text-emerald-500` `bg-emerald-500` | #10b981 |
| 警告 | `text-amber-500` | #f59e0b |
| 错误/断开 | `text-red-500` | #ef4444 |
| 页面背景 | `bg-slate-900` | #0f172a |
| 卡片/面板 | `bg-slate-800` `border-slate-700` | #1e293b |
| 主文字 | `text-slate-200` | #e2e8f0 |
| 次要文字 | `text-slate-400` | #94a3b8 |
| 输入框背景 | `bg-slate-700` | #334155 |

## 间距系统
- 页面边距：`p-4`
- 卡片内边距：`p-4`
- 组件间距：`gap-3`
- 区块间距：`gap-6`

## 组件使用原则
通用 UI 组件优先使用 `@/components/ui/*`：
- Button → 操作按钮
- Card → Provider 卡片、路由卡片
- Input → API Key、Base URL 输入
- Switch → 启用/禁用开关
- Badge → 状态标签
- Select → 模型选择
- Tabs → 页面切换
- Dialog → 添加/编辑 Provider 弹窗
- Toast → 操作反馈
- Separator → 分隔线

## 导航结构
单页应用，使用 Tabs 切换：
- Tab 1: 仪表盘（状态概览 + 路由映射）
- Tab 2: Provider 管理（添加/编辑/删除模型提供商）
- Tab 3: 路由配置（配置 CLI 工具 → Provider 映射）
- Tab 4: 请求日志（实时转发日志）

## 状态展示
- Provider 状态：Badge（绿色=已连接/红色=断开/灰色=未配置）
- 网关状态：大号指示灯 + 文字
- 请求日志：时间戳 + 方向箭头 + 状态码

## 小程序约束
- 所有 UI 在 H5 端运行（本地管理工具不需要小程序端）
- 暗色主题为主
- 信息密度优先于留白
