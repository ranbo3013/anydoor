import { useState, useEffect, useCallback } from "react"
import { View, Text, ScrollView } from "@tarojs/components"
import { Network } from "@/network"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  LayoutDashboard, Server, Route, FileText, Settings,
  Plus, Trash2, WifiOff, Copy, Check,
  DoorOpen, ArrowRight, Pencil, Sparkles, Brain,
  Terminal, MessageSquare, Code, Download, Upload,
  Eye, EyeOff
} from "lucide-react-taro"
import Taro from "@tarojs/taro"

// ========== Types ==========
interface Provider {
  id: string
  name: string
  type: "openai_chat" | "openai_responses" | "anthropic"
  baseUrl: string
  apiKey: string
  models: string[]
  enabled: boolean
  createdAt: string
  updatedAt: string
}

interface RouteConfig {
  id: string
  cliTool: string
  providerId: string
  providerName?: string
  providerType?: string
  model: string
  enabled: boolean
  createdAt: string
}

interface ProxyLog {
  id: string
  timestamp: string
  direction: string
  cliTool: string
  provider: string
  model: string
  endpoint: string
  statusCode: number
  duration: number
  error?: string
}

interface GatewayStatus {
  running: boolean
  proxyPort: number
  totalRequests: number
  providers: { id: string; name: string; connected: boolean }[]
}

// ========== Sidebar Navigation ==========
const NAV_ITEMS = [
  { key: "dashboard", label: "仪表盘", Icon: LayoutDashboard },
  { key: "providers", label: "供应商", Icon: Server },
  { key: "routes", label: "路由", Icon: Route },
  { key: "logs", label: "请求日志", Icon: FileText },
  { key: "settings", label: "设置", Icon: Settings },
]

// ========== Provider Form ==========
function ProviderForm({ provider, onSave, onCancel }: {
  provider?: Provider
  onSave: (data: any) => any
  onCancel: () => void
}) {
  const [name, setName] = useState(provider?.name || "")
  const [type, setType] = useState<Provider["type"]>(provider?.type || "openai_chat")
  const [baseUrl, setBaseUrl] = useState(provider?.baseUrl || "")
  const [apiKey, setApiKey] = useState(provider?.apiKey || "")
  const [models, setModels] = useState(provider?.models?.join(", ") || "")
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [savedProviderId, setSavedProviderId] = useState(provider?.id || "")
  const [showKey, setShowKey] = useState(false)

  const handleTest = async () => {
    if (!savedProviderId) {
      const data = { name, type, baseUrl, apiKey, models: models.split(",").map(m => m.trim()).filter(Boolean), enabled: true }
      const result = await onSave(data)
      if (result?.id) {
        setSavedProviderId(result.id)
        setTesting(true)
        try {
          const res = await Network.request({ url: `/api/gateway/providers/${result.id}/test`, method: "POST" })
          console.log("[ProviderForm] test result:", res.data)
          setTestResult(res.data?.data || { success: false, message: "未知结果" })
        } catch (err: any) {
          setTestResult({ success: false, message: err.message })
        }
        setTesting(false)
      }
      return
    }
    setTesting(true)
    try {
      const res = await Network.request({ url: `/api/gateway/providers/${savedProviderId}/test`, method: "POST" })
      console.log("[ProviderForm] test result:", res.data)
      setTestResult(res.data?.data || { success: false, message: "未知结果" })
    } catch (err: any) {
      setTestResult({ success: false, message: err.message })
    }
    setTesting(false)
  }

  const handleSave = () => {
    const data = {
      name, type, baseUrl, apiKey,
      models: models.split(",").map(m => m.trim()).filter(Boolean),
      enabled: provider?.enabled ?? true,
    }
    onSave(data)
  }

  const apiFormats: { value: Provider["type"]; label: string }[] = [
    { value: "openai_chat", label: "OpenAI Chat Completions" },
    { value: "openai_responses", label: "OpenAI Responses" },
    { value: "anthropic", label: "Anthropic Messages" },
  ]

  return (
    <View className="flex flex-col gap-4">
      <View className="flex flex-col gap-2">
        <Label className="text-sm font-medium text-on-surface">名称</Label>
        <View className="bg-surface-container rounded-md px-3 py-2">
          <Input className="w-full bg-transparent text-sm text-on-surface" placeholder="例如：Agnes" value={name} onInput={e => setName(e.detail.value)} />
        </View>
      </View>

      <View className="flex flex-col gap-2">
        <Label className="text-sm font-medium text-on-surface">API 格式</Label>
        <View className="flex flex-row gap-2">
          {apiFormats.map(f => (
            <View
              key={f.value}
              onClick={() => setType(f.value)}
              className={`px-3 py-2 rounded-md ${type === f.value ? "bg-primary" : "bg-surface-container"}`}
            >
              <Text className={`block text-xs ${type === f.value ? "text-on-primary font-medium" : "text-on-surface-variant"}`}>
                {f.label}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View className="flex flex-col gap-2">
        <Label className="text-sm font-medium text-on-surface">接口地址</Label>
        <View className="bg-surface-container rounded-md px-3 py-2">
          <Input className="w-full bg-transparent text-sm text-on-surface font-mono" placeholder="https://api.example.com/v1" value={baseUrl} onInput={e => setBaseUrl(e.detail.value)} />
        </View>
      </View>

      <View className="flex flex-col gap-2">
        <Label className="text-sm font-medium text-on-surface">API 密钥</Label>
        <View className="flex flex-row items-center gap-2">
          <View className="flex-1 bg-surface-container rounded-md px-3 py-2">
            <Input className="w-full bg-transparent text-sm text-on-surface font-mono" placeholder="sk-..." value={apiKey} onInput={e => setApiKey(e.detail.value)} type={showKey ? "text" : "safe-password"} />
          </View>
          <View onClick={() => setShowKey(!showKey)} className="p-2 bg-surface-container rounded-md">
            {showKey ? <EyeOff size={16} color="#6B7280" /> : <Eye size={16} color="#6B7280" />}
          </View>
        </View>
      </View>

      <View className="flex flex-col gap-2">
        <Label className="text-sm font-medium text-on-surface">模型列表</Label>
        <View className="bg-surface-container rounded-md px-3 py-2">
          <Input className="w-full bg-transparent text-sm text-on-surface" placeholder="用逗号分隔，例如：model-a, model-b" value={models} onInput={e => setModels(e.detail.value)} />
        </View>
      </View>

      {testResult && (
        <View className={`p-3 rounded-md ${testResult.success ? "bg-success bg-opacity-10 border border-success" : "bg-error bg-opacity-10 border border-error"}`}>
          <Text className={`block text-xs ${testResult.success ? "text-success" : "text-error"}`}>{testResult.message}</Text>
        </View>
      )}

      <View className="flex flex-row gap-3 mt-2">
        <Button variant="outline" className="flex-1 border-outline-variant text-on-surface" onClick={onCancel}>
          <Text>取消</Text>
        </Button>
        <Button variant="outline" className="flex-1 border-outline-variant text-on-surface" onClick={handleTest} disabled={testing || !baseUrl || !apiKey}>
          <Text>{testing ? "测试中..." : "测试连接"}</Text>
        </Button>
        <Button className="flex-1 bg-primary text-on-primary" onClick={handleSave} disabled={!name || !baseUrl || !apiKey}>
          <Text>保存</Text>
        </Button>
      </View>
    </View>
  )
}

// ========== 仪表盘 ==========
function DashboardView({ status, providers, routes }: {
  status: GatewayStatus | null
  providers: Provider[]
  routes: RouteConfig[]
}) {
  const [copiedCli, setCopiedCli] = useState("")

  const copyConfig = async (cliTool: string) => {
    try {
      const res = await Network.request({ url: `/api/gateway/config/${cliTool}` })
      const config = res.data?.data
      if (!config) return
      const text = config.configFile || JSON.stringify(config.envVars || config, null, 2)
      await Taro.setClipboardData({ data: text })
      setCopiedCli(cliTool)
      setTimeout(() => setCopiedCli(""), 2000)
    } catch (err) {
      console.error("[Dashboard] copyConfig error:", err)
    }
  }

  const enabledRoutes = routes.filter(r => r.enabled)
  const enabledProviders = providers.filter(p => p.enabled)

  return (
    <ScrollView className="flex-1 overflow-y-auto" scrollY>
      <View className="p-8">
        {/* 统计卡片 */}
        <View className="flex flex-row gap-5 mb-6">
          <View className="flex-1 bg-surface rounded-lg p-5" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <View className="flex flex-row items-center gap-3 mb-3">
              <View className="w-10 h-10 rounded-lg bg-primary bg-opacity-10 flex items-center justify-center">
                <LayoutDashboard size={20} color="#6C5CE7" />
              </View>
              <Text className="block text-sm text-on-surface-variant">网关状态</Text>
            </View>
            <View className="flex flex-row items-center gap-2">
              <View className={`w-2 h-2 rounded-full ${status?.running ? "bg-success" : "bg-error"}`} />
              <Text className="block text-lg font-semibold text-on-surface">{status?.running ? "运行中" : "已停止"}</Text>
            </View>
          </View>

          <View className="flex-1 bg-surface rounded-lg p-5" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <View className="flex flex-row items-center gap-3 mb-3">
              <View className="w-10 h-10 rounded-lg bg-success bg-opacity-10 flex items-center justify-center">
                <Server size={20} color="#10B981" />
              </View>
              <Text className="block text-sm text-on-surface-variant">活跃供应商</Text>
            </View>
            <Text className="block text-2xl font-bold text-on-surface">{enabledProviders.length}</Text>
          </View>

          <View className="flex-1 bg-surface rounded-lg p-5" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <View className="flex flex-row items-center gap-3 mb-3">
              <View className="w-10 h-10 rounded-lg bg-blue-500 bg-opacity-10 flex items-center justify-center">
                <Route size={20} color="#3B82F6" />
              </View>
              <Text className="block text-sm text-on-surface-variant">活跃路由</Text>
            </View>
            <Text className="block text-2xl font-bold text-on-surface">{enabledRoutes.length}</Text>
          </View>

          <View className="flex-1 bg-surface rounded-lg p-5" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <View className="flex flex-row items-center gap-3 mb-3">
              <View className="w-10 h-10 rounded-lg bg-amber-500 bg-opacity-10 flex items-center justify-center">
                <FileText size={20} color="#F59E0B" />
              </View>
              <Text className="block text-sm text-on-surface-variant">总请求数</Text>
            </View>
            <Text className="block text-2xl font-bold text-on-surface">{status?.totalRequests || 0}</Text>
          </View>
        </View>

        {/* 路由地图 */}
        <View className="bg-surface rounded-lg p-5 mb-6" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
          <Text className="block text-sm font-semibold text-on-surface-variant uppercase tracking-wider mb-4">路由地图</Text>
          {enabledRoutes.length === 0 ? (
            <View className="flex flex-col items-center py-8">
              <Route size={32} color="#D1D5DB" />
              <Text className="block text-sm text-on-surface-variant mt-3">暂无路由配置</Text>
              <Text className="block text-xs text-on-surface-variant mt-1">前往「路由」页面添加</Text>
            </View>
          ) : (
            <View className="flex flex-col gap-3">
              {enabledRoutes.map(route => (
                <View key={route.id} className="flex flex-row items-center gap-4 p-4 bg-surface-container-low rounded-lg">
                  <View className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-400 to-purple-500 flex items-center justify-center">
                    <Terminal size={24} color="#FFFFFF" />
                  </View>
                  <View>
                    <Text className="block text-sm font-semibold text-on-surface">{route.cliTool}</Text>
                    <Text className="block text-xs text-on-surface-variant mt-1">
                      {route.cliTool === "codex" ? "OpenAI Responses API" : "Anthropic Messages API"}
                    </Text>
                  </View>
                  <View className="flex flex-row items-center gap-2 mx-4">
                    <View className="h-px w-8 bg-outline-variant" />
                    <ArrowRight size={16} color="#6C5CE7" />
                    <View className="h-px w-8 bg-outline-variant" />
                  </View>
                  <View className="flex flex-row items-center gap-3">
                    <View className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center">
                      <Sparkles size={20} color="#FFFFFF" />
                    </View>
                    <View>
                      <Text className="block text-sm font-semibold text-on-surface">{route.providerName || route.providerId}</Text>
                      <Text className="block text-xs text-on-surface-variant">{route.model}</Text>
                    </View>
                  </View>
                  <View className="flex-1" />
                  <View onClick={() => copyConfig(route.cliTool)} className="p-2 bg-surface-container rounded-md">
                    {copiedCli === route.cliTool ? <Check size={14} color="#10B981" /> : <Copy size={14} color="#6B7280" />}
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* 配置指南 */}
        <View className="bg-surface rounded-lg p-5" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
          <View className="flex flex-row items-center gap-2 mb-4">
            <Code size={16} color="#6B7280" />
            <Text className="block text-sm font-semibold text-on-surface-variant uppercase tracking-wider">CLI 配置指南</Text>
          </View>
          <View className="p-4 bg-surface-container-low rounded-lg border border-outline-variant mb-3">
            <View className="flex flex-row items-center gap-2 mb-2">
              <Terminal size={14} color="#6B7280" />
              <Text className="block text-xs font-semibold text-on-surface-variant">Codex (~/.codex/config.toml)</Text>
            </View>
            <View className="bg-surface-container rounded-md p-3">
              <Text className="block text-xs font-mono text-on-surface">
                {`base_url = "http://localhost:${status?.proxyPort || 3000}/api/gateway/proxy"\nwire_api = "responses"`}
              </Text>
            </View>
          </View>
          <View className="p-4 bg-surface-container-low rounded-lg border border-outline-variant">
            <View className="flex flex-row items-center gap-2 mb-2">
              <MessageSquare size={14} color="#6B7280" />
              <Text className="block text-xs font-semibold text-on-surface-variant">Claude Code (~/.zshrc)</Text>
            </View>
            <View className="bg-surface-container rounded-md p-3">
              <Text className="block text-xs font-mono text-on-surface">
                {`export ANTHROPIC_BASE_URL="http://localhost:${status?.proxyPort || 3000}/api/gateway/proxy"\nexport ANTHROPIC_API_KEY="gateway-proxy-key"`}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </ScrollView>
  )
}

// ========== 供应商 ==========
function ProvidersView({ providers, refresh }: {
  providers: Provider[]
  refresh: () => void
}) {
  const [showDialog, setShowDialog] = useState(false)
  const [editingProvider, setEditingProvider] = useState<Provider | undefined>(undefined)

  const handleSave = async (data: any) => {
    try {
      if (editingProvider) {
        await Network.request({ url: `/api/gateway/providers/${editingProvider.id}`, method: "PUT", data })
      } else {
        await Network.request({ url: "/api/gateway/providers", method: "POST", data })
      }
      setShowDialog(false)
      setEditingProvider(undefined)
      refresh()
    } catch (err) {
      console.error("[Providers] save error:", err)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await Network.request({ url: `/api/gateway/providers/${id}`, method: "DELETE" })
      refresh()
    } catch (err) {
      console.error("[Providers] delete error:", err)
    }
  }

  const providerGradients = [
    "from-emerald-400 to-teal-500",
    "from-blue-400 to-indigo-500",
    "from-amber-400 to-orange-500",
    "from-rose-400 to-pink-500",
    "from-cyan-400 to-sky-500",
  ]

  return (
    <ScrollView className="flex-1 overflow-y-auto" scrollY>
      <View className="p-8">
        {providers.length === 0 ? (
          <View className="bg-surface rounded-lg p-12 flex flex-col items-center" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <WifiOff size={40} color="#D1D5DB" />
            <Text className="block text-sm text-on-surface-variant mt-4">暂无供应商配置</Text>
            <Text className="block text-xs text-on-surface-variant mt-1">添加一个供应商以开始使用</Text>
            <Button className="mt-4 bg-primary text-on-primary" size="sm" onClick={() => { setEditingProvider(undefined); setShowDialog(true) }}>
              <View className="flex flex-row items-center gap-2">
                <Plus size={14} color="#FFFFFF" />
                <Text className="text-xs">添加供应商</Text>
              </View>
            </Button>
          </View>
        ) : (
          <View className="grid grid-cols-2 gap-5">
            {providers.map((provider, idx) => (
              <View key={provider.id} className="bg-surface rounded-lg p-5" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                <View className="flex flex-row items-center justify-between mb-4">
                  <View className="flex flex-row items-center gap-3">
                    <View className={`w-10 h-10 rounded-lg bg-gradient-to-br ${providerGradients[idx % providerGradients.length]} flex items-center justify-center`}>
                      <Sparkles size={20} color="#FFFFFF" />
                    </View>
                    <View>
                      <Text className="block text-sm font-semibold text-on-surface">{provider.name}</Text>
                      <Text className="block text-xs text-on-surface-variant">
                        {provider.type === "openai_chat" ? "OpenAI Chat Completions" : provider.type === "openai_responses" ? "OpenAI Responses" : "Anthropic Messages"}
                      </Text>
                    </View>
                  </View>
                  <Badge className={provider.enabled ? "bg-success bg-opacity-15 text-success" : "bg-on-surface-variant bg-opacity-10 text-on-surface-variant"}>
                    <View className="flex flex-row items-center gap-2">
                      <View className={`w-1 h-1 rounded-full ${provider.enabled ? "bg-success" : "bg-on-surface-variant"}`} />
                      <Text className="text-xs font-medium">{provider.enabled ? "已连接" : "已断开"}</Text>
                    </View>
                  </Badge>
                </View>

                <View className="flex flex-col gap-2 mb-4">
                  <View className="flex flex-row items-center justify-between">
                    <Text className="block text-xs text-on-surface-variant">接口地址</Text>
                    <Text className="block text-xs text-on-surface font-mono" numberOfLines={1}>{provider.baseUrl}</Text>
                  </View>
                  <View className="flex flex-row items-center justify-between">
                    <Text className="block text-xs text-on-surface-variant">API 密钥</Text>
                    <Text className="block text-xs text-on-surface font-mono">sk-****{provider.apiKey?.slice(-4) || ""}</Text>
                  </View>
                  <View className="flex flex-row items-center justify-between">
                    <Text className="block text-xs text-on-surface-variant">模型</Text>
                    <Text className="block text-xs text-on-surface" numberOfLines={1}>{provider.models.join(", ")}</Text>
                  </View>
                </View>

                <View className="flex flex-row gap-2">
                  <Button variant="outline" className="flex-1 border-outline-variant text-on-surface" size="sm" onClick={() => { setEditingProvider(provider); setShowDialog(true) }}>
                    <View className="flex flex-row items-center gap-2">
                      <Pencil size={12} color="#6B7280" />
                      <Text className="text-xs">编辑</Text>
                    </View>
                  </Button>
                  <Button variant="outline" className="border-error border-opacity-30 text-error" size="sm" onClick={() => handleDelete(provider.id)}>
                    <Trash2 size={12} color="#EF4444" />
                  </Button>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="bg-surface max-w-lg">
          <DialogHeader>
            <DialogTitle>
              <Text className="text-on-surface">{editingProvider ? "编辑供应商" : "添加供应商"}</Text>
            </DialogTitle>
          </DialogHeader>
          <ProviderForm
            provider={editingProvider}
            onSave={handleSave}
            onCancel={() => { setShowDialog(false); setEditingProvider(undefined) }}
          />
        </DialogContent>
      </Dialog>
    </ScrollView>
  )
}

// ========== 路由 ==========
function RoutesView({ routes, providers, refresh }: {
  routes: RouteConfig[]
  providers: Provider[]
  refresh: () => void
}) {
  const [showDialog, setShowDialog] = useState(false)
  const [editingRoute, setEditingRoute] = useState<RouteConfig | undefined>(undefined)
  const [cliTool, setCliTool] = useState("codex")
  const [providerId, setProviderId] = useState("")
  const [model, setModel] = useState("")

  const cliTools = [
    { value: "claude-code", label: "Claude Code", Icon: MessageSquare, gradient: "from-amber-400 to-orange-500" },
    { value: "codex", label: "Codex", Icon: Terminal, gradient: "from-violet-400 to-purple-500" },
    { value: "cursor", label: "Cursor", Icon: Code, gradient: "from-cyan-400 to-blue-500" },
  ]

  const selectedProvider = providers.find(p => p.id === providerId)
  const availableModels = selectedProvider?.models || []

  const resetForm = () => {
    setCliTool("codex")
    setProviderId("")
    setModel("")
    setEditingRoute(undefined)
  }

  const handleSave = async () => {
    if (!cliTool || !providerId || !model) return
    try {
      if (editingRoute) {
        await Network.request({ url: `/api/gateway/routes/${editingRoute.id}`, method: "PUT", data: { cliTool, providerId, model, enabled: editingRoute.enabled } })
      } else {
        await Network.request({ url: "/api/gateway/routes", method: "POST", data: { cliTool, providerId, model, enabled: true } })
      }
      setShowDialog(false)
      resetForm()
      refresh()
    } catch (err) {
      console.error("[Routes] save error:", err)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await Network.request({ url: `/api/gateway/routes/${id}`, method: "DELETE" })
      refresh()
    } catch (err) {
      console.error("[Routes] delete error:", err)
    }
  }

  const openEdit = (route: RouteConfig) => {
    setEditingRoute(route)
    setCliTool(route.cliTool)
    setProviderId(route.providerId)
    setModel(route.model)
    setShowDialog(true)
  }

  const openAdd = () => {
    resetForm()
    if (providers.length > 0) {
      setProviderId(providers[0].id)
    }
    setShowDialog(true)
  }

  const getCliToolMeta = (tool: string) => cliTools.find(t => t.value === tool) || cliTools[0]
  const providerGradients = [
    "from-emerald-400 to-teal-500",
    "from-blue-400 to-indigo-500",
    "from-amber-400 to-orange-500",
    "from-rose-400 to-pink-500",
  ]

  return (
    <ScrollView className="flex-1 overflow-y-auto" scrollY>
      <View className="p-8">
        {routes.length === 0 ? (
          <View className="bg-surface rounded-lg p-12 flex flex-col items-center" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <Route size={40} color="#D1D5DB" />
            <Text className="block text-sm text-on-surface-variant mt-4">暂无路由配置</Text>
            <Text className="block text-xs text-on-surface-variant mt-1">添加路由以将 CLI 工具连接到模型供应商</Text>
            <Button className="mt-4 bg-primary text-on-primary" size="sm" onClick={openAdd}>
              <View className="flex flex-row items-center gap-2">
                <Plus size={14} color="#FFFFFF" />
                <Text className="text-xs">添加路由</Text>
              </View>
            </Button>
          </View>
        ) : (
          <View className="flex flex-col gap-4">
            {routes.map(route => {
              const cliMeta = getCliToolMeta(route.cliTool)
              const pIdx = providers.findIndex(p => p.id === route.providerId)
              return (
                <View key={route.id} className="bg-surface rounded-lg p-5" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                  <View className="flex flex-row items-center justify-between">
                    <View className="flex flex-row items-center gap-4">
                      <View className={`w-12 h-12 rounded-xl bg-gradient-to-br ${cliMeta.gradient} flex items-center justify-center`}>
                        <cliMeta.Icon size={24} color="#FFFFFF" />
                      </View>
                      <View>
                        <Text className="block text-base font-semibold text-on-surface">{cliMeta.label}</Text>
                        <Text className="block text-xs text-on-surface-variant mt-1">
                          {route.cliTool === "codex" ? "OpenAI Responses API" : "Anthropic Messages API"}
                        </Text>
                      </View>
                      <View className="flex flex-row items-center gap-2 mx-4">
                        <View className="h-px w-8 bg-outline-variant" />
                        <ArrowRight size={16} color="#6C5CE7" />
                        <View className="h-px w-8 bg-outline-variant" />
                      </View>
                      <View className="flex flex-row items-center gap-3">
                        <View className={`w-10 h-10 rounded-lg bg-gradient-to-br ${providerGradients[pIdx >= 0 ? pIdx % providerGradients.length : 0]} flex items-center justify-center`}>
                          <Brain size={20} color="#FFFFFF" />
                        </View>
                        <View>
                          <Text className="block text-sm font-semibold text-on-surface">{route.providerName || route.providerId}</Text>
                          <Text className="block text-xs text-on-surface-variant">{route.model}</Text>
                        </View>
                      </View>
                    </View>
                    <View className="flex flex-row items-center gap-3">
                      <Badge className={route.enabled ? "bg-success bg-opacity-15 text-success" : "bg-on-surface-variant bg-opacity-10 text-on-surface-variant"}>
                        <View className="flex flex-row items-center gap-2">
                          <View className={`w-1 h-1 rounded-full ${route.enabled ? "bg-success" : "bg-on-surface-variant"}`} />
                          <Text className="text-xs font-medium">{route.enabled ? "已启用" : "已禁用"}</Text>
                        </View>
                      </Badge>
                      <Button variant="outline" className="border-outline-variant text-on-surface-variant" size="sm" onClick={() => openEdit(route)}>
                        <Pencil size={12} color="#6B7280" />
                      </Button>
                      <Button variant="outline" className="border-error border-opacity-30 text-error" size="sm" onClick={() => handleDelete(route.id)}>
                        <Trash2 size={12} color="#EF4444" />
                      </Button>
                    </View>
                  </View>
                </View>
              )
            })}
          </View>
        )}
      </View>

      <Dialog open={showDialog} onOpenChange={(open) => { setShowDialog(open); if (!open) resetForm() }}>
        <DialogContent className="bg-surface max-w-lg">
          <DialogHeader>
            <DialogTitle>
              <Text className="text-on-surface">{editingRoute ? "编辑路由" : "添加路由"}</Text>
            </DialogTitle>
          </DialogHeader>
          <View className="flex flex-col gap-4">
            <View className="flex flex-col gap-2">
              <Label className="text-sm font-medium text-on-surface">CLI 工具</Label>
              <View className="flex flex-row gap-2">
                {cliTools.map(t => (
                  <View
                    key={t.value}
                    onClick={() => setCliTool(t.value)}
                    className={`px-3 py-2 rounded-md ${cliTool === t.value ? "bg-primary" : "bg-surface-container"}`}
                  >
                    <Text className={`block text-xs ${cliTool === t.value ? "text-on-primary font-medium" : "text-on-surface-variant"}`}>
                      {t.label}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            <View className="flex flex-col gap-2">
              <Label className="text-sm font-medium text-on-surface">供应商</Label>
              <View className="flex flex-row gap-2 flex-wrap">
                {providers.map(p => (
                  <View
                    key={p.id}
                    onClick={() => { setProviderId(p.id); setModel("") }}
                    className={`px-3 py-2 rounded-md ${providerId === p.id ? "bg-primary" : "bg-surface-container"}`}
                  >
                    <Text className={`block text-xs ${providerId === p.id ? "text-on-primary font-medium" : "text-on-surface-variant"}`}>
                      {p.name}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            <View className="flex flex-col gap-2">
              <Label className="text-sm font-medium text-on-surface">模型</Label>
              {availableModels.length > 0 ? (
                <View className="flex flex-row gap-2 flex-wrap">
                  {availableModels.map(m => (
                    <View
                      key={m}
                      onClick={() => setModel(m)}
                      className={`px-3 py-2 rounded-md ${model === m ? "bg-primary" : "bg-surface-container"}`}
                    >
                      <Text className={`block text-xs ${model === m ? "text-on-primary font-medium" : "text-on-surface-variant"}`}>
                        {m}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <View className="bg-surface-container rounded-md px-3 py-2">
                  <Input className="w-full bg-transparent text-sm text-on-surface" placeholder="模型名称" value={model} onInput={e => setModel(e.detail.value)} />
                </View>
              )}
            </View>

            <View className="flex flex-row gap-3 mt-2">
              <Button variant="outline" className="flex-1 border-outline-variant text-on-surface" onClick={() => { setShowDialog(false); resetForm() }}>
                <Text>取消</Text>
              </Button>
              <Button className="flex-1 bg-primary text-on-primary" onClick={handleSave} disabled={!cliTool || !providerId || !model}>
                <Text>保存</Text>
              </Button>
            </View>
          </View>
        </DialogContent>
      </Dialog>
    </ScrollView>
  )
}

// ========== 日志 ==========
function LogsView({ logs, refresh }: { logs: ProxyLog[]; refresh: () => void }) {
  const [autoRefresh, setAutoRefresh] = useState(false)

  useEffect(() => {
    if (!autoRefresh) return
    const timer = setInterval(refresh, 3000)
    return () => clearInterval(timer)
  }, [autoRefresh, refresh])

  const formatTime = (ts: string) => {
    const d = new Date(ts)
    return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`
  }

  const getStatusStyle = (code: number) => {
    if (code >= 200 && code < 300) return "bg-success bg-opacity-15 text-success"
    if (code >= 400 && code < 500) return "bg-warning bg-opacity-15 text-warning"
    return "bg-error bg-opacity-15 text-error"
  }

  return (
    <ScrollView className="flex-1 overflow-y-auto" scrollY>
      <View className="p-8">
        {/* 自动刷新控制 */}
        <View className="flex flex-row items-center justify-end gap-3 mb-4">
          <View className="flex flex-row items-center gap-2" onClick={() => setAutoRefresh(!autoRefresh)}>
            <View className={`w-2 h-2 rounded-full ${autoRefresh ? "bg-success" : "bg-on-surface-variant"}`} />
            <Text className="block text-xs text-on-surface-variant">自动刷新</Text>
          </View>
        </View>

        {logs.length === 0 ? (
          <View className="bg-surface rounded-lg p-12 flex flex-col items-center" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <FileText size={40} color="#D1D5DB" />
            <Text className="block text-sm text-on-surface-variant mt-4">暂无请求日志</Text>
            <Text className="block text-xs text-on-surface-variant mt-1">当网关转发请求时，日志将显示在此处</Text>
          </View>
        ) : (
          <View className="bg-surface rounded-lg overflow-hidden" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            {/* Table Header */}
            <View className="flex flex-row items-center bg-surface-container-low border-b border-outline px-5 py-3">
              <Text className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider w-16">状态</Text>
              <Text className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider w-20">时间</Text>
              <Text className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider flex-1">CLI 工具</Text>
              <Text className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider w-24">端点</Text>
              <Text className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider w-20">供应商</Text>
              <Text className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider w-28">模型</Text>
              <Text className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider w-16 text-right">耗时</Text>
            </View>

            {/* Table Rows */}
            {[...logs].reverse().map(log => (
              <View key={log.id} className="flex flex-row items-center px-5 py-3 border-b border-outline-variant">
                <View className="w-16">
                  <Badge className={getStatusStyle(log.statusCode)}>
                    <Text className="text-xs font-medium">{log.statusCode}</Text>
                  </Badge>
                </View>
                <Text className="block text-xs text-on-surface-variant font-mono w-20">{formatTime(log.timestamp)}</Text>
                <Text className="block text-sm text-on-surface font-medium flex-1">{log.cliTool}</Text>
                <Text className="block text-xs text-on-surface-variant font-mono w-24" numberOfLines={1}>{log.endpoint}</Text>
                <Text className="block text-sm text-on-surface w-20">{log.provider}</Text>
                <Text className="block text-xs text-on-surface-variant w-28" numberOfLines={1}>{log.model}</Text>
                <Text className="block text-xs text-on-surface-variant w-16 text-right">{log.duration}ms</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  )
}

// ========== 设置 ==========
function SettingsView() {
  const [autoStart, setAutoStart] = useState(true)
  const [sseEnabled, setSseEnabled] = useState(true)
  const [logRetention, setLogRetention] = useState("30")
  const [showProxyKey, setShowProxyKey] = useState(false)

  return (
    <ScrollView className="flex-1 overflow-y-auto" scrollY>
      <View className="p-8 max-w-2xl">
        {/* 网关配置 */}
        <View className="mb-8">
          <Text className="block text-sm font-semibold text-on-surface-variant uppercase tracking-wider mb-4">网关配置</Text>
          <View className="bg-surface rounded-lg divide-y divide-outline-variant" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <View className="px-5 py-4 flex flex-row items-center justify-between">
              <View>
                <Text className="block text-sm font-medium text-on-surface">监听端口</Text>
                <Text className="block text-xs text-on-surface-variant mt-1">网关服务监听的本地端口</Text>
              </View>
              <View className="bg-surface-container rounded-md px-3 py-2 w-24">
                <Input className="w-full bg-transparent text-sm font-mono text-on-surface text-center" value="3000" disabled />
              </View>
            </View>
            <View className="px-5 py-4 flex flex-row items-center justify-between">
              <View>
                <Text className="block text-sm font-medium text-on-surface">代理密钥</Text>
                <Text className="block text-xs text-on-surface-variant mt-1">CLI 工具连接网关时使用的 API Key</Text>
              </View>
              <View className="flex flex-row items-center gap-2">
                <View className="bg-surface-container rounded-md px-3 py-2">
                  <Input className="w-full bg-transparent text-sm font-mono text-on-surface-variant" value={showProxyKey ? "gateway-proxy-key" : "••••••••"} disabled />
                </View>
                <View onClick={() => setShowProxyKey(!showProxyKey)} className="p-2 bg-surface-container rounded-md">
                  {showProxyKey ? <EyeOff size={16} color="#6B7280" /> : <Eye size={16} color="#6B7280" />}
                </View>
              </View>
            </View>
            <View className="px-5 py-4 flex flex-row items-center justify-between">
              <View>
                <Text className="block text-sm font-medium text-on-surface">自动启动</Text>
                <Text className="block text-xs text-on-surface-variant mt-1">开机时自动启动网关服务</Text>
              </View>
              <View onClick={() => setAutoStart(!autoStart)} className={`relative w-10 h-6 rounded-full ${autoStart ? "bg-primary" : "bg-surface-container-high"}`}>
                <View className={`absolute top-1 w-4 h-4 rounded-full bg-white ${autoStart ? "right-1" : "left-1"}`} style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
              </View>
            </View>
            <View className="px-5 py-4 flex flex-row items-center justify-between">
              <View>
                <Text className="block text-sm font-medium text-on-surface">SSE 流式传输</Text>
                <Text className="block text-xs text-on-surface-variant mt-1">启用流式事件实时转换</Text>
              </View>
              <View onClick={() => setSseEnabled(!sseEnabled)} className={`relative w-10 h-6 rounded-full ${sseEnabled ? "bg-primary" : "bg-surface-container-high"}`}>
                <View className={`absolute top-1 w-4 h-4 rounded-full bg-white ${sseEnabled ? "right-1" : "left-1"}`} style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
              </View>
            </View>
          </View>
        </View>

        {/* 数据管理 */}
        <View className="mb-8">
          <Text className="block text-sm font-semibold text-on-surface-variant uppercase tracking-wider mb-4">数据管理</Text>
          <View className="bg-surface rounded-lg divide-y divide-outline-variant" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <View className="px-5 py-4 flex flex-row items-center justify-between">
              <View>
                <Text className="block text-sm font-medium text-on-surface">日志保留天数</Text>
                <Text className="block text-xs text-on-surface-variant mt-1">超过保留天数的请求日志将被自动清除</Text>
              </View>
              <View className="bg-surface-container rounded-md px-3 py-2 w-24">
                <Input className="w-full bg-transparent text-sm font-mono text-on-surface text-center" value={logRetention} onInput={e => setLogRetention(e.detail.value)} />
              </View>
            </View>
            <View className="px-5 py-4 flex flex-row items-center justify-between">
              <View>
                <Text className="block text-sm font-medium text-on-surface">导出配置</Text>
                <Text className="block text-xs text-on-surface-variant mt-1">将供应商和路由配置导出为 JSON 文件</Text>
              </View>
              <Button variant="outline" className="border-outline-variant text-on-surface" size="sm">
                <View className="flex flex-row items-center gap-2">
                  <Download size={14} color="#1A1A2E" />
                  <Text className="text-xs">导出</Text>
                </View>
              </Button>
            </View>
            <View className="px-5 py-4 flex flex-row items-center justify-between">
              <View>
                <Text className="block text-sm font-medium text-on-surface">导入配置</Text>
                <Text className="block text-xs text-on-surface-variant mt-1">从 JSON 文件导入供应商和路由配置</Text>
              </View>
              <Button variant="outline" className="border-outline-variant text-on-surface" size="sm">
                <View className="flex flex-row items-center gap-2">
                  <Upload size={14} color="#1A1A2E" />
                  <Text className="text-xs">导入</Text>
                </View>
              </Button>
            </View>
            <View className="px-5 py-4 flex flex-row items-center justify-between">
              <View>
                <Text className="block text-sm font-medium text-on-surface">清除所有数据</Text>
                <Text className="block text-xs text-on-surface-variant mt-1">删除所有供应商、路由和日志数据</Text>
              </View>
              <Button className="bg-error bg-opacity-10 text-error" size="sm">
                <Text className="text-xs">清除</Text>
              </Button>
            </View>
          </View>
        </View>

        {/* 关于 */}
        <View>
          <Text className="block text-sm font-semibold text-on-surface-variant uppercase tracking-wider mb-4">关于</Text>
          <View className="bg-surface rounded-lg px-5 py-4" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <View className="flex flex-row items-center gap-3 mb-3">
              <View className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
                <DoorOpen size={20} color="#FFFFFF" />
              </View>
              <View>
                <Text className="block text-sm font-semibold text-on-surface">AnyDoor</Text>
                <Text className="block text-xs text-on-surface-variant">v1.0.0</Text>
              </View>
            </View>
            <Text className="block text-xs text-on-surface-variant leading-relaxed">本地 AI 模型网关，让 Codex 和 Claude Code 等编程工具灵活连接 Agnes、DeepSeek 等大模型。支持 OpenAI Responses API 与 Chat Completions 协议自动转换。</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  )
}

// ========== 主页面 ==========
export default function Index() {
  const [activeNav, setActiveNav] = useState("dashboard")
  const [status, setStatus] = useState<GatewayStatus | null>(null)
  const [providers, setProviders] = useState<Provider[]>([])
  const [routes, setRoutes] = useState<RouteConfig[]>([])
  const [logs, setLogs] = useState<ProxyLog[]>([])

  const fetchStatus = useCallback(async () => {
    try {
      const res = await Network.request({ url: "/api/gateway/status" })
      console.log("[Index] fetchStatus:", res.data)
      setStatus(res.data?.data || null)
    } catch (err) {
      console.error("[Index] fetchStatus error:", err)
    }
  }, [])

  const fetchProviders = useCallback(async () => {
    try {
      const res = await Network.request({ url: "/api/gateway/providers" })
      console.log("[Index] fetchProviders:", res.data)
      setProviders(res.data?.data || [])
    } catch (err) {
      console.error("[Index] fetchProviders error:", err)
    }
  }, [])

  const fetchRoutes = useCallback(async () => {
    try {
      const res = await Network.request({ url: "/api/gateway/routes" })
      console.log("[Index] fetchRoutes:", res.data)
      setRoutes(res.data?.data || [])
    } catch (err) {
      console.error("[Index] fetchRoutes error:", err)
    }
  }, [])

  const fetchLogs = useCallback(async () => {
    try {
      const res = await Network.request({ url: "/api/gateway/logs" })
      console.log("[Index] fetchLogs:", res.data)
      setLogs(res.data?.data || [])
    } catch (err) {
      console.error("[Index] fetchLogs error:", err)
    }
  }, [])

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchStatus(), fetchProviders(), fetchRoutes(), fetchLogs()])
  }, [fetchStatus, fetchProviders, fetchRoutes, fetchLogs])

  useEffect(() => {
    refreshAll()
  }, [refreshAll])

  // Force Taro H5 containers to full desktop width/height
  useEffect(() => {
    const forceDesktopLayout = () => {
      const selectors = ['#app', '.taro-tabbar__container', '.taro-tabbar__panel', '.taro_page', '[data-page]']
      selectors.forEach(sel => {
        document.querySelectorAll(sel).forEach((el: Element) => {
          const htmlEl = el as HTMLElement
          htmlEl.style.width = '100%'
          htmlEl.style.maxWidth = 'none'
          htmlEl.style.height = '100%'
        })
      })
    }
    forceDesktopLayout()
    const timer = setInterval(forceDesktopLayout, 500)
    return () => clearInterval(timer)
  }, [])

  const titles: Record<string, string> = {
    dashboard: "仪表盘",
    providers: "供应商",
    routes: "路由",
    logs: "请求日志",
    settings: "设置",
  }

  const renderContent = () => {
    switch (activeNav) {
      case "dashboard":
        return <DashboardView status={status} providers={providers} routes={routes} />
      case "providers":
        return <ProvidersView providers={providers} refresh={() => { fetchProviders(); fetchStatus() }} />
      case "routes":
        return <RoutesView routes={routes} providers={providers} refresh={() => { fetchRoutes(); fetchStatus() }} />
      case "logs":
        return <LogsView logs={logs} refresh={fetchLogs} />
      case "settings":
        return <SettingsView />
      default:
        return null
    }
  }

  return (
    <View style={{ display: 'flex', flexDirection: 'row', width: '100%', height: '100vh', backgroundColor: 'var(--background)', overflow: 'hidden' }}>
      {/* Sidebar */}
      <View style={{ width: '240px', minWidth: '240px', flexShrink: 0, backgroundColor: 'var(--sidebar)', display: 'flex', flexDirection: 'column' }}>
        {/* Logo */}
        <View style={{ padding: '20px', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '12px' }}>
          <View className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
            <DoorOpen size={20} color="#FFFFFF" />
          </View>
          <Text className="text-white font-semibold text-base tracking-tight">AnyDoor</Text>
        </View>

        {/* Navigation */}
        <View style={{ flex: 1, padding: '0 12px', marginTop: '8px' }}>
          {NAV_ITEMS.map(item => {
            const isActive = activeNav === item.key
            return (
              <View
                key={item.key}
                onClick={() => setActiveNav(item.key)}
                style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '12px', padding: '12px', borderRadius: '8px', marginBottom: '4px', backgroundColor: isActive ? 'var(--sidebar-active)' : 'transparent' }}
              >
                <item.Icon size={16} color={isActive ? "#FFFFFF" : "#A0A0B8"} />
                <Text className={`block text-sm ${isActive ? "text-white font-medium" : "text-sidebar-text"}`}>
                  {item.label}
                </Text>
              </View>
            )
          })}
        </View>

        {/* Status indicator */}
        <View style={{ padding: '0 12px 16px' }}>
          <View style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'var(--sidebar-hover)' }}>
            <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
              <View className={`w-2 h-2 rounded-full ${status?.running ? "bg-success" : "bg-error"}`} />
              <Text className="block text-xs text-sidebar-text">{status?.running ? "网关运行中" : "网关已停止"}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Main content */}
      <View style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <View style={{ padding: '20px 32px', display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', backgroundColor: 'var(--surface)' }}>
          <Text className="block text-xl font-semibold text-on-surface">{titles[activeNav]}</Text>
        </View>
        {/* Content */}
        <View style={{ flex: 1, overflow: 'hidden' }}>
          {renderContent()}
        </View>
      </View>
    </View>
  )
}
