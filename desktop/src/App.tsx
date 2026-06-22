import { useState, useEffect, useCallback } from 'react'
import {
  LayoutDashboard, Server, Route, ScrollText, Settings as SettingsIcon,
  Activity, Zap, ChevronRight, Plus, Trash2, Edit3,
  Power, PowerOff, RefreshCw, Download, Database,
  Terminal, Copy, CheckCircle2, XCircle, Clock,
  AlertTriangle, Info, ArrowRightLeft, Shield, Upload, RotateCcw,
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

type Page = 'dashboard' | 'providers' | 'routes' | 'logs' | 'settings'

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

// ─── Sidebar ─────────────────────────────────────────────
const NAV_ITEMS: { key: Page; icon: LucideIcon; label: string }[] = [
  { key: 'dashboard', icon: LayoutDashboard, label: '仪表盘' },
  { key: 'providers', icon: Server, label: '供应商' },
  { key: 'routes', icon: Route, label: '路由' },
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

  const loadProviders = useCallback(async () => {
    try {
      const data = await API.get<Provider[]>('/api/gateway/providers')
      setProviders(data || [])
    } catch { /* ignore */ }
  }, [setProviders])

  useEffect(() => { loadProviders() }, [loadProviders])

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
        alert('✅ 连接成功！' + (res.message ? ' ' + res.message : ''))
      } else {
        alert('❌ 连接失败：' + (res?.message || '请检查配置'))
      }
    } catch (e: any) {
      alert('❌ 连接失败：' + (e.message || '请检查配置'))
    } finally {
      setTesting(false)
    }
  }

  const handleTestDirect = async () => {
    if (!form.baseUrl) {
      alert('请先填写 Base URL')
      return
    }
    setTesting(true)
    try {
      const res: any = await API.post('/api/gateway/providers/test', { baseUrl: form.baseUrl, apiKey: form.apiKey, type: form.type })
      console.log('Test result:', res)
      if (res?.success) {
        alert('连接成功！')
      } else {
        alert(`连接失败：${res?.message || '请检查 Base URL 和 API Key'}`)
      }
    } catch (e: any) {
      console.error('Test error:', e)
      alert(`连接失败：${e?.message || '请检查 Base URL 和 API Key'}`)
    } finally {
      setTesting(false)
    }
  }

  const handleFetchModels = async () => {
    if (!form.baseUrl) {
      alert('请先填写 Base URL')
      return
    }
    setTesting(true)
    try {
      const res: any = await API.post('/api/gateway/providers/test', { baseUrl: form.baseUrl, apiKey: form.apiKey, type: form.type })
      if (res?.success && res?.models?.length > 0) {
        setForm({ ...form, models: res.models.join(', ') })
        alert(`获取成功，发现 ${res.models.length} 个模型`)
      } else if (res?.success) {
        alert('连接成功但未发现模型列表，请手动填写')
      } else {
        alert(`获取失败：${res?.message || '请检查 Base URL 和 API Key'}`)
      }
    } catch (e: any) {
      alert(`获取失败：${e?.message || '请检查配置'}`)
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
                      <h3 className="font-semibold text-gray-900">{p.name}</h3>
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
function Logs({ logs, setLogs }: { logs: ProxyLog[]; setLogs: React.Dispatch<React.SetStateAction<ProxyLog[]>> }) {
  const [autoRefresh, setAutoRefresh] = useState(true)

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

  const statusColor = (code: number) => {
    if (code >= 200 && code < 300) return '#10B981'
    if (code >= 400 && code < 500) return '#F59E0B'
    return '#EF4444'
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">请求日志</h1>
          <p className="text-sm text-gray-500 mt-1">实时查看网关代理请求</p>
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
              {logs.slice(0, 100).map(log => (
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
      )}
    </div>
  )
}

// ─── Settings ────────────────────────────────────────────
function SettingsPage() {
  const [gatewayInfo, setGatewayInfo] = useState<{ port: number; host: string; uptime: number } | null>(null)

  useEffect(() => {
    API.get('/api/gateway/config/_info').then((data: unknown) => setGatewayInfo(data as { port: number; host: string; uptime: number })).catch(() => {})
  }, [])

  const handleExportConfig = async () => {
    try {
      const data = await API.get('/api/gateway/config')
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = 'anydoor-config.json'; a.click()
      URL.revokeObjectURL(url)
    } catch { alert('导出失败') }
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
        alert('配置导入成功，请刷新页面查看')
        window.location.reload()
      } catch (err: any) {
        alert('导入失败: ' + (err.message || '配置文件格式错误'))
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
      alert('配置已重置，请刷新页面')
      window.location.reload()
    } catch { alert('重置失败') }
  }

  const handleClearLogs = async () => {
    if (confirm('确定清空所有请求日志？')) {
      await API.del('/api/gateway/logs')
      alert('日志已清空')
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
          <button onClick={handleClearLogs}
            className="flex items-center gap-2 w-full px-4 py-3 rounded-lg text-sm text-left text-red-600 hover:bg-red-50 border border-red-200 transition-colors">
            <Trash2 size={16} /> 清空请求日志
          </button>
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
          {page === 'logs' && <Logs logs={logs} setLogs={setLogs} />}
          {page === 'settings' && <SettingsPage />}
        </div>
      </main>
    </div>
  )
}
