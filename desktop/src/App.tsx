import React, { useState, useEffect, useCallback } from 'react'
import {
  LayoutDashboard, Server, Route, ScrollText, Settings as SettingsIcon,
  Activity, Zap, ChevronRight, ChevronLeft, ChevronsLeft, ChevronsRight, Plus, Trash2, Edit3,
  Power, PowerOff, RefreshCw, Download, Database,
  Terminal, Copy, CheckCircle2, XCircle, Clock,
  AlertTriangle, Info, ArrowRightLeft, Shield, Upload, RotateCcw, X,
  ChartBar, TrendingUp, Coins, Calendar,
  type LucideIcon,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────
interface Provider {
  id: string
  name: string
  type: 'openai_chat' | 'openai_responses' | 'anthropic'
  baseUrl: string
  apiKey: string
  models: string[]
  enabled: boolean
  createdAt: string
  updatedAt: string
}

interface Route {
  id: string
  name: string
  cliTool: 'codex' | 'claude-code' | 'cursor' | 'custom'
  model: string
  providerId: string
  enabled: boolean
  createdAt?: string
}

interface ProxyLog {
  id: string
  timestamp: string
  method: string
  path: string
  statusCode: number
  duration: number
  cliTool: string
  model: string
  provider: string
}

interface HealthStatus {
  [providerId: string]: {
    healthy: boolean
    lastCheck: string
    latency: number
    error?: string
  }
}

interface LogStorageInfo {
  proxyLogCount: number
  proxyLogSizeKB: number
  electronLogSizeKB: number
  totalSizeKB: number
}

type Page = 'dashboard' | 'providers' | 'routes' | 'stats' | 'logs' | 'settings'

// ─── API Helper ──────────────────────────────────────────
const API = {
  async get<T>(url: string): Promise<T> {
    const res = await fetch(url)
    const json = await res.json()
    console.log(`GET ${url}`, json)
    return json.data !== undefined ? json.data : json
  },
  async post<T>(url: string, data?: unknown): Promise<T> {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: data ? JSON.stringify(data) : undefined,
    })
    const json = await res.json()
    console.log(`POST ${url}`, data, json)
    return json.data !== undefined ? json.data : json
  },
  async put<T>(url: string, data: unknown): Promise<T> {
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const json = await res.json()
    console.log(`PUT ${url}`, data, json)
    return json.data !== undefined ? json.data : json
  },
  async del(url: string): Promise<void> {
    const res = await fetch(url, { method: 'DELETE' })
    console.log(`DELETE ${url}`, res.status)
  },
}

// ─── Toast System ─────────────────────────────────────────────
interface ToastItem { id: number; type: 'success' | 'error' | 'info'; message: string }
let toastId = 0
const toastListeners: Set<(toasts: ToastItem[]) => void> = new Set()
let currentToasts: ToastItem[] = []

function showToast(type: ToastItem['type'], message: string) {
  const item: ToastItem = { id: ++toastId, type, message }
  currentToasts = [...currentToasts, item]
  toastListeners.forEach(fn => fn([...currentToasts]))
}

function dismissToast(id: number) {
  currentToasts = currentToasts.filter(t => t.id !== id)
  toastListeners.forEach(fn => fn([...currentToasts]))
}

function ToastContainer() {
  const [toasts, setToasts] = React.useState<ToastItem[]>([])
  React.useEffect(() => {
    toastListeners.add(setToasts)
    return () => { toastListeners.delete(setToasts) }
  }, [])
  if (toasts.length === 0) return null
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2" style={{ maxWidth: 420 }}>
      {toasts.map(t => (
        <div key={t.id}
          className="flex items-start gap-3 px-4 py-3 rounded-lg shadow-lg border"
          style={{
            background: t.type === 'error' ? '#FEF2F2' : t.type === 'success' ? '#F0FDF4' : '#EFF6FF',
            borderColor: t.type === 'error' ? '#FECACA' : t.type === 'success' ? '#BBF7D0' : '#BFDBFE',
          }}>
          <span className="text-sm flex-1" style={{ color: t.type === 'error' ? '#991B1B' : t.type === 'success' ? '#166534' : '#1E40AF' }}>
            {t.type === 'success' ? '✅ ' : t.type === 'error' ? '❌ ' : 'ℹ️ '}{t.message}
          </span>
          <button onClick={() => dismissToast(t.id)} className="text-gray-400 hover:text-gray-600 shrink-0 mt-0.5">
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  )
}

// ─── Sidebar ─────────────────────────────────────────────
const NAV_ITEMS: { key: Page; icon: LucideIcon; label: string }[] = [
  { key: 'dashboard', icon: LayoutDashboard, label: '仪表盘' },
  { key: 'providers', icon: Server, label: '供应商' },
  { key: 'routes', icon: Route, label: '路由' },
  { key: 'stats', icon: ChartBar, label: '统计' },
  { key: 'logs', icon: ScrollText, label: '日志' },
  { key: 'settings', icon: SettingsIcon, label: '设置' },
]

function Sidebar({ page, setPage }: { page: Page; setPage: (p: Page) => void }) {
  return (
    <div
      style={{ width: 220, minWidth: 220, background: 'var(--sidebar-bg)' }}
      className="h-full flex flex-col text-white select-none"
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-6 border-b border-white/10">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg font-bold"
          style={{ background: 'linear-gradient(135deg, #6C5CE7, #A29BFE)' }}>
          门
        </div>
        <div>
          <div className="text-base font-bold tracking-wide">AnyDoor</div>
          <div className="text-xs text-white/50">任意门 · AI 网关</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-3 space-y-1">
        {NAV_ITEMS.map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => setPage(key)}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-colors ${
              page === key
                ? 'bg-white/15 text-white font-medium'
                : 'text-white/60 hover:bg-white/8 hover:text-white/90'
            }`}
          >
            <Icon size={18} />
            {label}
          </button>
        ))}
      </nav>

      {/* Status */}
      <div className="px-5 py-4 border-t border-white/10">
        <div className="flex items-center gap-2 text-xs text-white/50">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          网关运行中
        </div>
        <div className="text-xs text-white/30 mt-1">v1.0.0 · Port 3000</div>
      </div>
    </div>
  )
}

// ─── Stat Card ───────────────────────────────────────────
function StatCard({ icon: Icon, label, value, color, sub }: {
  icon: LucideIcon; label: string; value: string | number; color: string; sub?: string
}) {
  return (
    <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-2xl font-bold mt-1" style={{ color }}>{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
        </div>
        <div className="w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ background: `${color}15`, color }}>
          <Icon size={20} />
        </div>
      </div>
    </div>
  )
}

// ─── Dashboard ───────────────────────────────────────────
function Dashboard({ providers, routes, logs }: {
  providers: Provider[]; routes: Route[]; logs: ProxyLog[]
}) {
  const activeProviders = providers.filter(p => p.enabled).length
  const activeRoutes = routes.filter(r => r.enabled).length
  const totalRequests = logs.length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">仪表盘</h1>
        <p className="text-sm text-gray-500 mt-1">网关运行状态概览</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard icon={Zap} label="网关状态" value="运行中" color="#10B981" sub="Uptime: 99.9%" />
        <StatCard icon={Server} label="活跃供应商" value={activeProviders} color="#6C5CE7"
          sub={`共 ${providers.length} 个`} />
        <StatCard icon={Route} label="活跃路由" value={activeRoutes} color="#3B82F6"
          sub={`共 ${routes.length} 条`} />
        <StatCard icon={Activity} label="总请求数" value={totalRequests} color="#F59E0B"
          sub="本次会话" />
      </div>

      {/* Route Map */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">路由地图</h2>
          <p className="text-xs text-gray-500 mt-0.5">CLI 工具 → 供应商模型 的映射关系</p>
        </div>
        <div className="p-6 space-y-3">
          {routes.filter(r => r.enabled).length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <Route size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">暂无活跃路由，请先配置供应商和路由</p>
            </div>
          ) : (
            routes.filter(r => r.enabled).map(route => {
              const provider = providers.find(p => p.id === route.providerId)
              return (
                <div key={route.id} className="flex items-center gap-4 py-3 px-4 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
                  <div className="flex items-center gap-2 min-w-0">
                    <Terminal size={16} className="text-gray-400 shrink-0" />
                    <span className="text-sm font-medium text-gray-700 truncate">{route.cliTool}</span>
                  </div>
                  <ArrowRightLeft size={16} className="text-gray-300 shrink-0" />
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-sm text-gray-600 truncate">{route.model}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 shrink-0">
                      {(route.cliTool === 'codex' && providers.find(pp => pp.id === route.providerId)?.type === 'openai_chat') ? '协议转换' : '直通'}
                    </span>
                  </div>
                  <ChevronRight size={16} className="text-gray-300 shrink-0" />
                  <div className="flex items-center gap-2 min-w-0">
                    <Server size={16} className="text-gray-400 shrink-0" />
                    <span className="text-sm text-gray-600 truncate">{provider?.name || '未知'}</span>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* CLI Quick Setup */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">CLI 快速配置</h2>
          <p className="text-xs text-gray-500 mt-0.5">复制以下命令配置你的 CLI 工具</p>
        </div>
        <div className="p-6 space-y-4">
          {[
            { tool: 'Codex', cmd: 'export OPENAI_BASE_URL=http://localhost:3000/api/gateway/proxy\nexport OPENAI_API_KEY=anydoor' },
            { tool: 'Claude Code', cmd: 'export ANTHROPIC_BASE_URL=http://localhost:3000/api/gateway/proxy\nexport ANTHROPIC_API_KEY=anydoor' },
            { tool: 'Cursor', cmd: 'OPENAI BASE URL: http://localhost:3000/api/gateway/proxy\nAPI Key: anydoor' },
          ].map(({ tool, cmd }) => (
            <div key={tool} className="bg-gray-900 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-400 font-medium">{tool}</span>
                <Copy size={14} className="text-gray-500 cursor-pointer hover:text-gray-300" />
              </div>
              <code className="text-sm text-green-400 font-mono break-all">{cmd}</code>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Providers ───────────────────────────────────────────
function Providers({ providers, setProviders }: {
  providers: Provider[]; setProviders: React.Dispatch<React.SetStateAction<Provider[]>>
}) {
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [form, setForm] = useState({ name: '', type: 'openai_chat' as Provider['type'], baseUrl: '', apiKey: '', models: '', enabled: true })
  const [health, setHealth] = useState<HealthStatus>({})

  const loadProviders = useCallback(async () => {
    try {
      const data = await API.get<Provider[]>('/api/gateway/providers')
      setProviders(data || [])
    } catch { /* ignore */ }
  }, [setProviders])

  useEffect(() => { loadProviders() }, [loadProviders])

  const loadHealth = useCallback(async () => {
    try {
      const res = await API.get('/api/gateway/health')
      if (res && typeof res === 'object') setHealth(res as HealthStatus)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { loadHealth(); const t = setInterval(loadHealth, 30000); return () => clearInterval(t) }, [loadHealth])

  const handleSave = async () => {
    const payload = {
      ...form,
      models: form.models.split(',').map(m => m.trim()).filter(Boolean),
    }
    if (editId) {
      await API.put(`/api/gateway/providers/${editId}`, payload)
    } else {
      await API.post('/api/gateway/providers', payload)
    }
    setShowForm(false)
    setEditId(null)
    setForm({ name: '', type: 'openai_chat', baseUrl: '', apiKey: '', models: '', enabled: true })
    loadProviders()
  }

  const handleEdit = (p: Provider) => {
    setEditId(p.id)
    setForm({ name: p.name, type: p.type, baseUrl: p.baseUrl, apiKey: p.apiKey, models: p.models.join(', '), enabled: p.enabled })
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    await API.del(`/api/gateway/providers/${id}`)
    loadProviders()
  }

  const handleTest = async (id: string) => {
    setTesting(true)
    try {
      const res: any = await API.post(`/api/gateway/providers/${id}/test`)
      console.log('handleTest result:', res)
      if (res?.success) {
        showToast('success', '连接成功！' + (res.message ? ' ' + res.message : ''))
      } else {
        showToast('error', '连接失败：' + (res?.message || '请检查配置'))
      }
    } catch (e: any) {
      showToast('error', '连接失败：' + (e.message || '请检查配置'))
    } finally {
      setTesting(false)
    }
  }

  const handleTestDirect = async () => {
    if (!form.baseUrl) {
      showToast('info', '请先填写 Base URL')
      return
    }
    setTesting(true)
    try {
      const res: any = await API.post('/api/gateway/providers/test', { baseUrl: form.baseUrl, apiKey: form.apiKey, type: form.type })
      console.log('Test result:', res)
      if (res?.success) {
        showToast('success', '连接成功！')
      } else {
        showToast('error', `连接失败：${res?.message || '请检查 Base URL 和 API Key'}`)
      }
    } catch (e: any) {
      console.error('Test error:', e)
      showToast('error', `连接失败：${e?.message || '请检查 Base URL 和 API Key'}`)
    } finally {
      setTesting(false)
    }
  }

  const handleFetchModels = async () => {
    if (!form.baseUrl) {
      showToast('info', '请先填写 Base URL')
      return
    }
    setTesting(true)
    try {
      const res: any = await API.post('/api/gateway/providers/test', { baseUrl: form.baseUrl, apiKey: form.apiKey, type: form.type })
      if (res?.success && res?.models?.length > 0) {
        setForm({ ...form, models: res.models.join(', ') })
        showToast('success', `获取成功，发现 ${res.models.length} 个模型`)
      } else if (res?.success) {
        showToast('info', '连接成功但未发现模型列表，请手动填写')
      } else {
        showToast('error', `获取失败：${res?.message || '请检查 Base URL 和 API Key'}`)
      }
    } catch (e: any) {
      showToast('error', `获取失败：${e?.message || '请检查配置'}`)
    } finally {
      setTesting(false)
    }
  }

  const GRADIENTS = [
    'from-violet-500 to-purple-600',
    'from-blue-500 to-cyan-500',
    'from-emerald-500 to-teal-500',
    'from-orange-500 to-red-500',
    'from-pink-500 to-rose-500',
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">供应商管理</h1>
          <p className="text-sm text-gray-500 mt-1">配置 AI 模型供应商连接</p>
        </div>
        <button
          onClick={() => { setShowForm(true); setEditId(null); setForm({ name: '', type: 'openai_chat', baseUrl: '', apiKey: '', models: '', enabled: true }) }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors"
          style={{ background: 'var(--primary)' }}
        >
          <Plus size={16} /> 添加供应商
        </button>
      </div>

      {/* Form Dialog */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4">{editId ? '编辑供应商' : '添加供应商'}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">名称</label>
                <input className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="例如: DeepSeek" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Base URL</label>
                <input className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  value={form.baseUrl} onChange={e => setForm(f => ({ ...f, baseUrl: e.target.value }))}
                  placeholder="https://api.deepseek.com" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
                <input className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  type="password" value={form.apiKey} onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))}
                  placeholder="sk-..." />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-gray-700">模型列表（逗号分隔）</label>
                  <button
                    onClick={handleFetchModels}
                    disabled={testing || !form.baseUrl}
                    className="text-xs px-2 py-1 rounded-md bg-violet-50 text-violet-600 hover:bg-violet-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {testing ? '获取中...' : '自动获取'}
                  </button>
                </div>
                <input className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  value={form.models} onChange={e => setForm(f => ({ ...f, models: e.target.value }))}
                  placeholder="deepseek-chat, deepseek-reasoner" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">API 格式</label>
                <select className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as Provider['type'] }))}>
                  <option value="openai_chat">OpenAI Chat Completions（/v1/chat/completions）</option>
                  <option value="openai_responses">OpenAI Responses（/v1/responses）</option>
                  <option value="anthropic">Anthropic（/v1/messages）</option>
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  {form.type === 'openai_chat' && '支持 DeepSeek、Agnes、通义千问等兼容 OpenAI 的供应商'}
                  {form.type === 'openai_responses' && '支持 OpenAI 官方 Responses API'}
                  {form.type === 'anthropic' && '支持 Claude 官方 API'}
                </p>
              </div>
            </div>
            <div className="flex justify-between mt-6">
              <button onClick={handleTestDirect} disabled={testing} className="px-4 py-2 text-sm text-violet-600 hover:bg-violet-50 rounded-lg border border-violet-200 disabled:opacity-50">
                {testing ? '测试中...' : '测试连接'}
              </button>
              <div className="flex gap-3">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">取消</button>
                <button onClick={handleSave} className="px-4 py-2 text-sm text-white rounded-lg" style={{ background: 'var(--primary)' }}>保存</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cards */}
      {providers.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Server size={48} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">暂无供应商，点击右上角添加</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {providers.map((p, i) => (
            <div key={p.id} className="bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
              <div className={`h-2 bg-gradient-to-r ${GRADIENTS[i % GRADIENTS.length]}`} />
              <div className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${GRADIENTS[i % GRADIENTS.length]} flex items-center justify-center text-white text-sm font-bold`}>
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                        {p.name}
                        {health[p.id]?.healthy === true && <span className="w-2 h-2 rounded-full bg-emerald-500" title="连接正常" />}
                        {health[p.id]?.healthy === false && <span className="w-2 h-2 rounded-full bg-red-500" title="连接异常" />}
                      </h3>
                      <p className="text-xs text-gray-400">{p.type === 'openai_chat' ? 'Chat Completions' : p.type === 'openai_responses' ? 'Responses API' : 'Anthropic'}</p>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                    p.enabled ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {p.enabled ? '已启用' : '已禁用'}
                  </span>
                </div>
                <div className="text-xs text-gray-400 mb-3 truncate">{p.baseUrl}</div>
                <div className="flex flex-wrap gap-1 mb-4">
                  {p.models.map(m => (
                    <span key={m} className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">{m}</span>
                  ))}
                </div>
                <div className="flex items-center gap-2 border-t border-gray-100 pt-3">
                  <button onClick={() => handleTest(p.id)} className="flex items-center gap-1 text-xs text-gray-500 hover:text-violet-600">
                    <Zap size={12} /> 测试
                  </button>
                  <button onClick={() => handleEdit(p)} className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600">
                    <Edit3 size={12} /> 编辑
                  </button>
                  <button onClick={() => handleDelete(p.id)} className="flex items-center gap-1 text-xs text-gray-500 hover:text-red-600 ml-auto">
                    <Trash2 size={12} /> 删除
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Routes ──────────────────────────────────────────────
function Routes({ routes, setRoutes, providers }: {
  routes: Route[]; setRoutes: React.Dispatch<React.SetStateAction<Route[]>>; providers: Provider[]
}) {
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '', cliTool: 'codex' as Route['cliTool'], model: '',
    providerId: '', enabled: true,
  })

  const loadRoutes = useCallback(async () => {
    try {
      const data = await API.get<Route[]>('/api/gateway/routes')
      setRoutes(data || [])
    } catch { /* ignore */ }
  }, [setRoutes])

  useEffect(() => { loadRoutes() }, [loadRoutes])

  const handleSave = async () => {
    if (editId) {
      await API.put(`/api/gateway/routes/${editId}`, form)
    } else {
      await API.post('/api/gateway/routes', form)
    }
    setShowForm(false)
    setEditId(null)
    setForm({ name: '', cliTool: 'codex', model: '', providerId: '', enabled: true })
    loadRoutes()
  }

  const handleEdit = (r: Route) => {
    setEditId(r.id)
    setForm({ name: r.name, cliTool: r.cliTool, model: r.model, providerId: r.providerId, enabled: r.enabled })
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    await API.del(`/api/gateway/routes/${id}`)
    loadRoutes()
  }

  const handleToggle = async (r: Route) => {
    await API.put(`/api/gateway/routes/${r.id}`, { ...r, enabled: !r.enabled })
    loadRoutes()
  }

  const CLI_ICONS: Record<string, { color: string; label: string }> = {
    'codex': { color: '#10B981', label: 'Codex' },
    'claude-code': { color: '#6C5CE7', label: 'Claude Code' },
    'cursor': { color: '#3B82F6', label: 'Cursor' },
    'custom': { color: '#F59E0B', label: '自定义' },
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">路由管理</h1>
          <p className="text-sm text-gray-500 mt-1">配置 CLI 工具到供应商的路由映射</p>
        </div>
        <button onClick={() => { setShowForm(true); setEditId(null); setForm({ name: '', cliTool: 'codex', model: '', providerId: '', enabled: true }) }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium"
          style={{ background: 'var(--primary)' }}>
          <Plus size={16} /> 添加路由
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4">{editId ? '编辑路由' : '添加路由'}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">路由名称</label>
                <input className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="例如: Codex → DeepSeek" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">CLI 工具</label>
                  <select className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                    value={form.cliTool} onChange={e => setForm(f => ({ ...f, cliTool: e.target.value as Route['cliTool'] }))}>
                    <option value="codex">Codex</option>
                    <option value="claude-code">Claude Code</option>
                    <option value="cursor">Cursor</option>
                    <option value="custom">自定义</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">模型名称</label>
                <input className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
                  placeholder="deepseek-chat" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">供应商</label>
                <select className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  value={form.providerId} onChange={e => setForm(f => ({ ...f, providerId: e.target.value }))}>
                  <option value="">选择供应商</option>
                  {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">取消</button>
              <button onClick={handleSave} className="px-4 py-2 text-sm text-white rounded-lg" style={{ background: 'var(--primary)' }}>保存</button>
            </div>
          </div>
        </div>
      )}

      {routes.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Route size={48} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">暂无路由，点击右上角添加</p>
        </div>
      ) : (
        <div className="space-y-3">
          {routes.map(r => {
            const provider = providers.find(p => p.id === r.providerId)
            const cli = CLI_ICONS[r.cliTool] || CLI_ICONS['custom']
            return (
              <div key={r.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-shadow">
                <div className="flex items-center gap-4">
                  {/* CLI Tool Badge */}
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: `${cli.color}15`, color: cli.color }}>
                    <Terminal size={22} />
                  </div>

                  {/* Flow */}
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">{r.name || cli.label}</div>
                      <div className="text-xs text-gray-400">{cli.label}</div>
                    </div>
                    <ArrowRightLeft size={18} className="text-gray-300 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-gray-700 truncate">{r.model}</div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs px-1.5 py-0.5 rounded bg-violet-50 text-violet-600">
                          {(r.cliTool === 'codex' && providers.find(pp => pp.id === r.providerId)?.type === 'openai_chat') ? 'R→C' : '直通'}
                        </span>
                        {(r.cliTool === 'codex' && providers.find(pp => pp.id === r.providerId)?.type === 'openai_chat') && (
                          <span className="text-xs text-gray-400 flex items-center gap-1">
                            <Shield size={10} /> 协议转换
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight size={16} className="text-gray-300 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm text-gray-700 truncate">{provider?.name || '未知'}</div>
                      <div className="text-xs text-gray-400">{provider?.type === 'openai_chat' ? 'Chat Completions' : provider?.type === 'openai_responses' ? 'Responses API' : provider?.type === 'anthropic' ? 'Anthropic' : ''}</div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => handleToggle(r)}
                      className={`p-2 rounded-lg transition-colors ${r.enabled ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-400'}`}>
                      {r.enabled ? <Power size={16} /> : <PowerOff size={16} />}
                    </button>
                    <button onClick={() => handleEdit(r)} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-blue-600">
                      <Edit3 size={16} />
                    </button>
                    <button onClick={() => handleDelete(r.id)} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-red-600">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Logs ────────────────────────────────────────────────
const LOGS_PAGE_SIZE = 50

// ─── Usage Stats Page ──────────────────────────────────────
interface UsageStats {
  totalRequests: number
  successRequests: number
  failedRequests: number
  totalInputTokens: number
  totalOutputTokens: number
  totalTokens: number
  totalCost: number
  avgDuration: number
  byProvider: Record<string, { requests: number; inputTokens: number; outputTokens: number; cost: number }>
  byModel: Record<string, { requests: number; inputTokens: number; outputTokens: number; cost: number }>
  dailyUsage: { date: string; requests: number; inputTokens: number; outputTokens: number; cost: number }[]
}

function UsageStatsPage() {
  const [stats, setStats] = useState<UsageStats | null>(null)
  const [providers, setProviders] = useState<string[]>([])
  const [models, setModels] = useState<string[]>([])
  const [selectedProvider, setSelectedProvider] = useState('all')
  const [selectedModel, setSelectedModel] = useState('all')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [quickRange, setQuickRange] = useState('7d')

  const loadStats = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (selectedProvider !== 'all') params.set('provider', selectedProvider)
      if (selectedModel !== 'all') params.set('model', selectedModel)
      if (startDate) params.set('startDate', startDate)
      if (endDate) params.set('endDate', endDate)
      const data = await API.get<UsageStats>(`/api/gateway/stats/usage?${params.toString()}`)
      setStats(data)
    } catch (e) { console.error('Failed to load stats', e) }
  }, [selectedProvider, selectedModel, startDate, endDate])

  const loadFilters = useCallback(async () => {
    try {
      const [p, m] = await Promise.all([
        API.get<string[]>('/api/gateway/stats/providers'),
        API.get<string[]>('/api/gateway/stats/models'),
      ])
      setProviders(p)
      setModels(m)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { loadFilters() }, [loadFilters])

  useEffect(() => {
    loadStats()
    const timer = setInterval(loadStats, 30000)
    return () => clearInterval(timer)
  }, [loadStats])

  // Quick range handler
  const applyQuickRange = (range: string) => {
    setQuickRange(range)
    const now = new Date()
    let start: Date
    switch (range) {
      case '1d': start = new Date(now.getTime() - 86400000); break
      case '7d': start = new Date(now.getTime() - 7 * 86400000); break
      case '30d': start = new Date(now.getTime() - 30 * 86400000); break
      case '90d': start = new Date(now.getTime() - 90 * 86400000); break
      default: return
    }
    setStartDate(start.toISOString().substring(0, 10))
    setEndDate(now.toISOString().substring(0, 10))
  }

  // Initialize with 7d range
  useEffect(() => {
    if (!startDate && !endDate) applyQuickRange('7d')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const formatTokens = (n: number) => {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
    return n.toString()
  }

  const formatCost = (n: number) => {
    if (n === 0) return '$0.00'
    if (n < 0.01) return '<$0.01'
    return '$' + n.toFixed(2)
  }

  const formatDuration = (ms: number) => {
    if (ms < 1000) return ms + 'ms'
    return (ms / 1000).toFixed(1) + 's'
  }

  // Bar chart max height helper
  const maxDailyRequests = Math.max(...(stats?.dailyUsage.map(d => d.requests) || [1]), 1)
  const maxDailyTokens = Math.max(...(stats?.dailyUsage.map(d => d.inputTokens + d.outputTokens) || [1]), 1)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">使用统计</h1>
          <p className="text-sm text-gray-500 mt-1">AI 模型使用情况和成本分析</p>
        </div>
        <button
          onClick={loadStats}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <RefreshCw size={14} /> 刷新
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap items-end gap-4">
          {/* Quick range */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">快捷范围</label>
            <div className="flex gap-1">
              {[
                { key: '1d', label: '1天' },
                { key: '7d', label: '7天' },
                { key: '30d', label: '30天' },
                { key: '90d', label: '90天' },
              ].map(r => (
                <button
                  key={r.key}
                  onClick={() => applyQuickRange(r.key)}
                  className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                    quickRange === r.key
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          {/* Date range */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">开始日期</label>
            <input
              type="date"
              value={startDate}
              onChange={e => { setStartDate(e.target.value); setQuickRange('') }}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-md bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">结束日期</label>
            <input
              type="date"
              value={endDate}
              onChange={e => { setEndDate(e.target.value); setQuickRange('') }}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-md bg-white"
            />
          </div>
          {/* Provider filter */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">供应商</label>
            <select
              value={selectedProvider}
              onChange={e => setSelectedProvider(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-md bg-white"
            >
              <option value="all">全部供应商</option>
              {providers.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          {/* Model filter */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">模型</label>
            <select
              value={selectedModel}
              onChange={e => setSelectedModel(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-md bg-white"
            >
              <option value="all">全部模型</option>
              {models.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Activity size={16} color="#3B82F6" />
            <span className="text-xs font-medium text-gray-500">总请求数</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">{stats?.totalRequests || 0}</div>
          <div className="text-xs text-gray-400 mt-1">
            <span className="text-green-600">{stats?.successRequests || 0} 成功</span>
            {' · '}
            <span className="text-red-500">{stats?.failedRequests || 0} 失败</span>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Zap size={16} color="#8B5CF6" />
            <span className="text-xs font-medium text-gray-500">总 Token 数</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">{formatTokens(stats?.totalTokens || 0)}</div>
          <div className="text-xs text-gray-400 mt-1">
            输入 {formatTokens(stats?.totalInputTokens || 0)} · 输出 {formatTokens(stats?.totalOutputTokens || 0)}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Coins size={16} color="#F59E0B" />
            <span className="text-xs font-medium text-gray-500">预估成本</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">{formatCost(stats?.totalCost || 0)}</div>
          <div className="text-xs text-gray-400 mt-1">
            基于模型定价估算
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock size={16} color="#10B981" />
            <span className="text-xs font-medium text-gray-500">平均耗时</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">{formatDuration(stats?.avgDuration || 0)}</div>
          <div className="text-xs text-gray-400 mt-1">
            每次请求平均
          </div>
        </div>
      </div>

      {/* Daily Usage Chart */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">每日请求趋势</h3>
        {stats?.dailyUsage && stats.dailyUsage.length > 0 ? (
          <div className="space-y-3">
            {/* Requests bar chart */}
            <div>
              <div className="text-xs text-gray-500 mb-2">请求数</div>
              <div className="flex items-end gap-1" style={{ height: 120 }}>
                {stats.dailyUsage.map((d, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                    <div
                      className="w-full bg-blue-500 rounded-t-sm min-h-[2px] transition-all"
                      style={{ height: `${Math.max((d.requests / maxDailyRequests) * 100, 1)}%` }}
                      title={`${d.date}: ${d.requests} 请求`}
                    />
                  </div>
                ))}
              </div>
            </div>
            {/* X-axis labels */}
            <div className="flex gap-1">
              {stats.dailyUsage.filter((_, i) => {
                const step = Math.max(1, Math.floor(stats.dailyUsage.length / 8))
                return i % step === 0
              }).map((d, i, arr) => (
                <div key={d.date} className="flex-1 text-center">
                  <span className="text-[10px] text-gray-400">{d.date.substring(5)}</span>
                </div>
              ))}
            </div>
            {/* Tokens bar chart */}
            <div className="mt-4">
              <div className="text-xs text-gray-500 mb-2">Token 使用量</div>
              <div className="flex items-end gap-1" style={{ height: 80 }}>
                {stats.dailyUsage.map((d, i) => {
                  const tokens = d.inputTokens + d.outputTokens
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                      <div className="w-full flex flex-col rounded-t-sm overflow-hidden min-h-[2px]" style={{ height: `${Math.max((tokens / maxDailyTokens) * 100, 1)}%` }}>
                        <div className="bg-purple-400 flex-1" title={`输入: ${formatTokens(d.inputTokens)}`} />
                        <div className="bg-purple-600" style={{ height: d.outputTokens > 0 ? '40%' : 0 }} title={`输出: ${formatTokens(d.outputTokens)}`} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
            暂无使用数据
          </div>
        )}
      </div>

      {/* By Provider / By Model tables */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* By Provider */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">按供应商</h3>
          {stats?.byProvider && Object.keys(stats.byProvider).length > 0 ? (
            <div className="space-y-2">
              {Object.entries(stats.byProvider).sort((a, b) => b[1].requests - a[1].requests).map(([name, data]) => (
                <div key={name} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <div className="text-sm font-medium text-gray-900">{name}</div>
                    <div className="text-xs text-gray-400">{data.requests} 请求 · {formatTokens(data.inputTokens + data.outputTokens)} tokens</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-gray-900">{formatCost(data.cost)}</div>
                    <div className="text-xs text-gray-400">成本</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-400 text-sm">暂无数据</div>
          )}
        </div>

        {/* By Model */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">按模型</h3>
          {stats?.byModel && Object.keys(stats.byModel).length > 0 ? (
            <div className="space-y-2">
              {Object.entries(stats.byModel).sort((a, b) => b[1].requests - a[1].requests).map(([name, data]) => (
                <div key={name} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <div className="text-sm font-medium text-gray-900">{name}</div>
                    <div className="text-xs text-gray-400">{data.requests} 请求 · {formatTokens(data.inputTokens + data.outputTokens)} tokens</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-gray-900">{formatCost(data.cost)}</div>
                    <div className="text-xs text-gray-400">成本</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-400 text-sm">暂无数据</div>
          )}
        </div>
      </div>

      {/* Daily Usage Table */}
      {stats?.dailyUsage && stats.dailyUsage.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">每日明细</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 px-3 text-xs font-medium text-gray-500">日期</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-gray-500">请求数</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-gray-500">输入 Tokens</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-gray-500">输出 Tokens</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-gray-500">成本</th>
                </tr>
              </thead>
              <tbody>
                {stats.dailyUsage.slice().reverse().map(d => (
                  <tr key={d.date} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="py-2 px-3 text-gray-900">{d.date}</td>
                    <td className="py-2 px-3 text-right text-gray-600">{d.requests}</td>
                    <td className="py-2 px-3 text-right text-gray-600">{formatTokens(d.inputTokens)}</td>
                    <td className="py-2 px-3 text-right text-gray-600">{formatTokens(d.outputTokens)}</td>
                    <td className="py-2 px-3 text-right text-gray-900 font-medium">{formatCost(d.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function Logs({ logs, setLogs }: { logs: ProxyLog[]; setLogs: React.Dispatch<React.SetStateAction<ProxyLog[]>> }) {
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)

  const loadLogs = useCallback(async () => {
    try {
      const data = await API.get<ProxyLog[]>('/api/gateway/logs')
      setLogs(data || [])
    } catch { /* ignore */ }
  }, [setLogs])

  useEffect(() => {
    loadLogs()
    if (!autoRefresh) return
    const timer = setInterval(loadLogs, 3000)
    return () => clearInterval(timer)
  }, [loadLogs, autoRefresh])

  // Auto-refresh resets to page 1 when new logs arrive
  useEffect(() => {
    setCurrentPage(1)
  }, [logs.length])

  const statusColor = (code: number) => {
    if (code >= 200 && code < 300) return '#10B981'
    if (code >= 400 && code < 500) return '#F59E0B'
    return '#EF4444'
  }

  // Reverse chronological order
  const sortedLogs = [...logs].reverse()
  const totalPages = Math.max(1, Math.ceil(sortedLogs.length / LOGS_PAGE_SIZE))
  const safeCurrentPage = Math.min(currentPage, totalPages)
  const pagedLogs = sortedLogs.slice((safeCurrentPage - 1) * LOGS_PAGE_SIZE, safeCurrentPage * LOGS_PAGE_SIZE)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">请求日志</h1>
          <p className="text-sm text-gray-500 mt-1">共 {logs.length} 条记录，按时间倒序排列</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={loadLogs}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100 border border-gray-200">
            <RefreshCw size={14} /> 刷新
          </button>
          <button onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
              autoRefresh ? 'bg-violet-50 text-violet-600 border border-violet-200' : 'text-gray-600 hover:bg-gray-100 border border-gray-200'
            }`}>
            <Activity size={14} /> {autoRefresh ? '自动刷新中' : '自动刷新'}
          </button>
        </div>
      </div>

      {logs.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <ScrollText size={48} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">暂无请求日志</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-5 py-3 font-medium text-gray-500">时间</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">方法</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">路径</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">状态</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">耗时</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">CLI</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">模型</th>
                </tr>
              </thead>
              <tbody>
                {pagedLogs.map(log => (
                  <tr key={log.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-5 py-3 text-gray-500 whitespace-nowrap">
                      <Clock size={12} className="inline mr-1" />
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </td>
                    <td className="px-5 py-3 font-mono text-xs">{log.method}</td>
                    <td className="px-5 py-3 font-mono text-xs text-gray-600 max-w-48 truncate">{log.path}</td>
                    <td className="px-5 py-3">
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full"
                        style={{ background: `${statusColor(log.statusCode)}15`, color: statusColor(log.statusCode) }}>
                        {log.statusCode}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-500">{log.duration}ms</td>
                    <td className="px-5 py-3 text-gray-600">{log.cliTool}</td>
                    <td className="px-5 py-3 text-gray-600">{log.model}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">
                第 {(safeCurrentPage - 1) * LOGS_PAGE_SIZE + 1}-{Math.min(safeCurrentPage * LOGS_PAGE_SIZE, sortedLogs.length)} 条，共 {sortedLogs.length} 条
              </p>
              <div className="flex items-center gap-1">
                <button onClick={() => setCurrentPage(1)} disabled={safeCurrentPage === 1}
                  className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed">
                  <ChevronsLeft size={16} />
                </button>
                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={safeCurrentPage === 1}
                  className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed">
                  <ChevronLeft size={16} />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPages || Math.abs(p - safeCurrentPage) <= 1)
                  .reduce<(number | string)[]>((acc, p, idx, arr) => {
                    if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('...')
                    acc.push(p)
                    return acc
                  }, [])
                  .map((p, idx) =>
                    typeof p === 'string' ? (
                      <span key={`ellipsis-${idx}`} className="px-2 text-gray-400 text-sm">...</span>
                    ) : (
                      <button key={p} onClick={() => setCurrentPage(p)}
                        className={`min-w-[32px] h-8 rounded-lg text-sm ${
                          p === safeCurrentPage
                            ? 'bg-violet-600 text-white'
                            : 'text-gray-600 hover:bg-gray-100'
                        }`}>
                        {p}
                      </button>
                    )
                  )}
                <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={safeCurrentPage === totalPages}
                  className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed">
                  <ChevronRight size={16} />
                </button>
                <button onClick={() => setCurrentPage(totalPages)} disabled={safeCurrentPage === totalPages}
                  className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed">
                  <ChevronsRight size={16} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Settings ────────────────────────────────────────────
function SettingsPage() {
  const [gatewayInfo, setGatewayInfo] = useState<{ port: number; host: string; uptime: number } | null>(null)
  const [authEnabled, setAuthEnabled] = useState(false)
  const [proxyToken, setProxyToken] = useState('')
  const [newToken, setNewToken] = useState('')
  const [saved, setSaved] = useState(false)

  const [logStorage, setLogStorage] = useState<LogStorageInfo | null>(null)

  useEffect(() => {
    API.get('/api/gateway/_info').then((data: unknown) => setGatewayInfo(data as { port: number; host: string; uptime: number; providerCount: number; routeCount: number })).catch(() => {})
    API.get('/api/gateway/auth').then((data: any) => {
      if (data) { setAuthEnabled(!!data.enabled); setProxyToken(data.token || '') }
    }).catch(() => {})
    API.get('/api/gateway/logs/storage').then((data: any) => { if (data) setLogStorage(data) }).catch(() => {})
  }, [])

  const handleSaveAuth = async () => {
    try {
      await API.post('/api/gateway/auth', { enabled: authEnabled, token: newToken || undefined })
      setSaved(true); setTimeout(() => setSaved(false), 2000)
      setProxyToken(newToken || proxyToken); setNewToken('')
    } catch { showToast('error', '保存失败') }
  }

  const handleExportConfig = async () => {
    try {
      const data = await API.get('/api/gateway/config')
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = 'anydoor-config.json'; a.click()
      URL.revokeObjectURL(url)
    } catch { showToast('error', '导出失败') }
  }

  const handleImportConfig = async () => {
    const input = document.createElement('input')
    input.type = 'file'; input.accept = '.json'
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0]
      if (!file) return
      try {
        const text = await file.text()
        const config = JSON.parse(text)
        if (!confirm('导入将覆盖当前所有供应商和路由配置，确定继续？')) return
        await API.post('/api/gateway/config', config)
        showToast('success', '配置导入成功，请刷新页面查看')
        window.location.reload()
      } catch (err: any) {
        showToast('error', '导入失败: ' + (err.message || '配置文件格式错误'))
      }
    }
    input.click()
  }

  const handleResetConfig = async () => {
    if (!confirm('确定重置所有配置？此操作不可恢复！')) return
    if (!confirm('再次确认：将删除所有供应商、路由和日志数据！')) return
    try {
      await API.del('/api/gateway/providers')
      await API.del('/api/gateway/routes')
      await API.del('/api/gateway/logs')
      showToast('success', '配置已重置，请刷新页面')
      window.location.reload()
    } catch { showToast('error', '重置失败') }
  }

  const handleClearLogs = async () => {
    const totalKB = logStorage?.totalSizeKB ?? 0
    const sizeText = totalKB > 1024 ? `${(totalKB / 1024).toFixed(1)} MB` : `${totalKB} KB`
    if (confirm(`确定清理所有日志文件？\n\n将清理：\n- 代理请求日志（${logStorage?.proxyLogCount ?? 0} 条）\n- Electron 进程日志\n\n预计释放 ${sizeText} 空间`)) {
      try {
        await API.del('/api/gateway/logs/all')
        setLogStorage(null)
        showToast('success', '所有日志已清理')
      } catch { showToast('error', '清理失败') }
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-gray-900">设置</h1>
        <p className="text-sm text-gray-500 mt-1">网关配置与数据管理</p>
      </div>

      {/* Gateway Status */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <SettingsIcon size={18} className="text-gray-400" /> 网关状态
        </h2>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between py-2 border-b border-gray-50">
            <span className="text-gray-500">监听端口</span>
            <span className="font-mono text-gray-900">{gatewayInfo?.port ?? 3000}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-gray-50">
            <span className="text-gray-500">监听地址</span>
            <span className="font-mono text-gray-900">{gatewayInfo?.host ?? '0.0.0.0'}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-gray-50">
            <span className="text-gray-500">代理地址</span>
            <span className="font-mono text-gray-900">http://localhost:{gatewayInfo?.port ?? 3000}/api/gateway/proxy</span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-gray-500">运行时长</span>
            <span className="text-gray-900">{gatewayInfo?.uptime ? Math.floor(gatewayInfo.uptime / 60) + ' 分钟' : '—'}</span>
          </div>
        </div>
      </div>

      {/* Proxy Auth */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Shield size={18} className="text-gray-400" /> 代理鉴权
        </h2>
        <p className="text-xs text-gray-500 mb-4">开启后，CLI 工具需在请求头携带正确的 Authorization token 才能访问代理</p>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">启用鉴权</span>
            <button onClick={() => setAuthEnabled(!authEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${authEnabled ? 'bg-violet-500' : 'bg-gray-300'}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${authEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
          {authEnabled && (
            <>
              {proxyToken && (
                <div className="flex justify-between py-2 border-b border-gray-50">
                  <span className="text-sm text-gray-500">当前 Token</span>
                  <span className="font-mono text-sm text-gray-900">{proxyToken.slice(0, 8)}{'•'.repeat(8)}</span>
                </div>
              )}
              <div>
                <label className="text-sm text-gray-700 block mb-1">{proxyToken ? '更新 Token' : '设置 Token'}</label>
                <input type="text" value={newToken} onChange={e => setNewToken(e.target.value)} placeholder={proxyToken ? '留空则保持当前' : '输入代理访问 Token'}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500" />
              </div>
              {authEnabled && proxyToken && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                  <strong>CLI 配置需添加：</strong>
                  <code className="block mt-1 bg-amber-100 rounded px-2 py-1 font-mono">
                    export OPENAI_API_KEY={proxyToken}
                  </code>
                </div>
              )}
            </>
          )}
          <button onClick={handleSaveAuth}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-violet-500 hover:bg-violet-600 transition-colors">
            {saved ? '已保存' : '保存'}
          </button>
        </div>
      </div>

      {/* Data Management */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Database size={18} className="text-gray-400" /> 数据管理
        </h2>
        <div className="space-y-3">
          <button onClick={handleExportConfig}
            className="flex items-center gap-2 w-full px-4 py-3 rounded-lg text-sm text-left text-gray-700 hover:bg-gray-50 border border-gray-200 transition-colors">
            <Download size={16} className="text-gray-400" /> 导出配置文件
          </button>
          <button onClick={handleImportConfig}
            className="flex items-center gap-2 w-full px-4 py-3 rounded-lg text-sm text-left text-gray-700 hover:bg-gray-50 border border-gray-200 transition-colors">
            <Upload size={16} className="text-gray-400" /> 导入配置文件
          </button>
          <div className="border border-red-200 rounded-lg overflow-hidden">
            <button onClick={handleClearLogs}
              className="flex items-center justify-between w-full px-4 py-3 text-sm text-left text-red-600 hover:bg-red-50 transition-colors">
              <span className="flex items-center gap-2">
                <Trash2 size={16} /> 清理所有日志
              </span>
              {logStorage && (
                <span className="text-xs text-red-400">
                  {logStorage.proxyLogCount} 条请求日志 · {logStorage.totalSizeKB > 1024 ? `${(logStorage.totalSizeKB / 1024).toFixed(1)} MB` : `${logStorage.totalSizeKB} KB`}
                </span>
              )}
            </button>
          </div>
          <button onClick={handleResetConfig}
            className="flex items-center gap-2 w-full px-4 py-3 rounded-lg text-sm text-left text-red-600 hover:bg-red-50 border border-red-200 transition-colors">
            <RotateCcw size={16} /> 重置所有配置
          </button>
        </div>
      </div>

      {/* About */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Info size={18} className="text-gray-400" /> 关于
        </h2>
        <div className="space-y-2 text-sm text-gray-600">
          <div className="flex justify-between"><span>版本</span><span className="text-gray-900">1.0.0</span></div>
          <div className="flex justify-between"><span>运行时</span><span className="text-gray-900">NestJS + Electron</span></div>
          <div className="flex justify-between"><span>协议支持</span><span className="text-gray-900">OpenAI / Anthropic</span></div>
        </div>
      </div>
    </div>
  )
}

// ─── Main App ────────────────────────────────────────────
export default function App() {
  const [page, setPage] = useState<Page>('dashboard')
  const [providers, setProviders] = useState<Provider[]>([])
  const [routes, setRoutes] = useState<Route[]>([])
  const [logs, setLogs] = useState<ProxyLog[]>([])

  useEffect(() => {
    // Initial data load
    API.get<Provider[]>('/api/gateway/providers').then(d => setProviders(d || [])).catch(() => {})
    API.get<Route[]>('/api/gateway/routes').then(d => setRoutes(d || [])).catch(() => {})
    API.get<ProxyLog[]>('/api/gateway/logs').then(d => setLogs(d || [])).catch(() => {})
  }, [])

  return (
    <div style={{ display: 'flex', width: '100%', height: '100vh', overflow: 'hidden' }}>
      <Sidebar page={page} setPage={setPage} />
      <main className="flex-1 overflow-y-auto" style={{ background: 'var(--bg-main)' }}>
        <div className="p-8">
          {page === 'dashboard' && <Dashboard providers={providers} routes={routes} logs={logs} />}
          {page === 'providers' && <Providers providers={providers} setProviders={setProviders} />}
          {page === 'routes' && <Routes routes={routes} setRoutes={setRoutes} providers={providers} />}
          {page === 'stats' && <UsageStatsPage />}
          {page === 'logs' && <Logs logs={logs} setLogs={setLogs} />}
          {page === 'settings' && <SettingsPage />}
        </div>
      </main>
      <ToastContainer />
    </div>
  )
}
