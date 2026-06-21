import { useState, useEffect, useCallback } from "react"
import { View, Text, ScrollView } from "@tarojs/components"
import { Network } from "@/network"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Card, CardHeader, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Activity, Server, Route, FileText, Plus, Trash2, Wifi, WifiOff, Copy, Check, Settings } from "lucide-react-taro"
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
          setTestResult(res.data?.data || { success: false, message: "Unknown result" })
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
      setTestResult(res.data?.data || { success: false, message: "Unknown result" })
    } catch (err: any) {
      setTestResult({ success: false, message: err.message })
    }
    setTesting(false)
  }

  const handleSave = () => {
    const data = {
      name,
      type,
      baseUrl,
      apiKey,
      models: models.split(",").map(m => m.trim()).filter(Boolean),
      enabled: provider?.enabled ?? true,
    }
    onSave(data)
  }

  const apiFormats: { value: Provider["type"]; label: string }[] = [
    { value: "openai_chat", label: "OpenAI Chat" },
    { value: "openai_responses", label: "OpenAI Responses" },
    { value: "anthropic", label: "Anthropic" },
  ]

  return (
    <View className="flex flex-col gap-4">
      <View className="flex flex-col gap-2">
        <Label>Name</Label>
        <View className="bg-slate-700 rounded-md px-3 py-2">
          <Input className="w-full bg-transparent text-slate-200" placeholder="e.g. Agnes, DeepSeek" value={name} onInput={e => setName(e.detail.value)} />
        </View>
      </View>

      <View className="flex flex-col gap-2">
        <Label>API Format</Label>
        <View className="flex flex-row gap-2">
          {apiFormats.map(f => (
            <View key={f.value} onClick={() => setType(f.value)} className={`px-3 py-2 rounded-md ${type === f.value ? "bg-emerald-500 text-slate-900" : "bg-slate-700 text-slate-400"}`}>
              <Text className="block">{f.label}</Text>
            </View>
          ))}
        </View>
      </View>

      <View className="flex flex-col gap-2">
        <Label>Base URL</Label>
        <View className="bg-slate-700 rounded-md px-3 py-2">
          <Input className="w-full bg-transparent text-slate-200" placeholder="https://api.example.com/v1" value={baseUrl} onInput={e => setBaseUrl(e.detail.value)} />
        </View>
      </View>

      <View className="flex flex-col gap-2">
        <Label>API Key</Label>
        <View className="bg-slate-700 rounded-md px-3 py-2">
          <Input className="w-full bg-transparent text-slate-200" placeholder="sk-xxx" value={apiKey} onInput={e => setApiKey(e.detail.value)} type="safe-password" />
        </View>
      </View>

      <View className="flex flex-col gap-2">
        <Label>Models (comma separated)</Label>
        <View className="bg-slate-700 rounded-md px-3 py-2">
          <Input className="w-full bg-transparent text-slate-200" placeholder="agnes-flash, deepseek-chat" value={models} onInput={e => setModels(e.detail.value)} />
        </View>
      </View>

      {testResult && (
        <View className={`p-3 rounded-md ${testResult.success ? "bg-emerald-900 border border-emerald-700" : "bg-red-900 border border-red-700"}`}>
          <Text className={`block text-sm ${testResult.success ? "text-emerald-400" : "text-red-400"}`}>{testResult.message}</Text>
        </View>
      )}

      <View className="flex flex-row gap-3 mt-2">
        <Button variant="outline" className="flex-1 border-slate-600 text-slate-300" onClick={onCancel}>
          <Text>Cancel</Text>
        </Button>
        <Button variant="outline" className="flex-1 border-slate-600 text-slate-300" onClick={handleTest} disabled={testing || !baseUrl || !apiKey}>
          <Text>{testing ? "Testing..." : "Test"}</Text>
        </Button>
        <Button className="flex-1 bg-emerald-500 text-slate-900" onClick={handleSave} disabled={!name || !baseUrl || !apiKey}>
          <Text>Save</Text>
        </Button>
      </View>
    </View>
  )
}

// ========== Dashboard Tab ==========
function DashboardTab({ status, providers, routes }: {
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
    <View className="flex flex-col gap-4">
      {/* Status Card */}
      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="p-4">
          <View className="flex flex-row items-center gap-3 mb-4">
            <View className={`w-3 h-3 rounded-full ${status?.running ? "bg-emerald-500" : "bg-red-500"}`} />
            <Text className="block text-lg font-semibold text-slate-200">
              Gateway {status?.running ? "Running" : "Stopped"}
            </Text>
          </View>
          <View className="flex flex-row gap-4">
            <View className="flex-1 bg-slate-700 rounded-lg p-3">
              <Text className="block text-xs text-slate-400 mb-1">Total Requests</Text>
              <Text className="block text-xl font-bold text-slate-200">{status?.totalRequests || 0}</Text>
            </View>
            <View className="flex-1 bg-slate-700 rounded-lg p-3">
              <Text className="block text-xs text-slate-400 mb-1">Active Providers</Text>
              <Text className="block text-xl font-bold text-emerald-400">{enabledProviders.length}</Text>
            </View>
            <View className="flex-1 bg-slate-700 rounded-lg p-3">
              <Text className="block text-xs text-slate-400 mb-1">Active Routes</Text>
              <Text className="block text-xl font-bold text-blue-400">{enabledRoutes.length}</Text>
            </View>
          </View>
        </CardContent>
      </Card>

      {/* Route Map */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader className="p-4 pb-2">
          <View className="flex flex-row items-center gap-2">
            <Route size={18} color="#10b981" />
            <Text className="block text-base font-semibold text-slate-200">Route Map</Text>
          </View>
        </CardHeader>
        <CardContent className="p-4 pt-2">
          {enabledRoutes.length === 0 ? (
            <Text className="block text-sm text-slate-500">No routes configured. Go to Routes tab to set up.</Text>
          ) : (
            <View className="flex flex-col gap-2">
              {enabledRoutes.map(route => (
                <View key={route.id} className="flex flex-row items-center gap-3 bg-slate-700 rounded-lg p-3">
                  <Badge variant="secondary" className="bg-blue-500 text-blue-100 border-blue-400">
                    <Text className="text-xs">{route.cliTool}</Text>
                  </Badge>
                  <Text className="block text-slate-500">→</Text>
                  <Badge variant="secondary" className="bg-emerald-500 text-emerald-100 border-emerald-400">
                    <Text className="text-xs">{route.providerName || route.providerId}</Text>
                  </Badge>
                  <Badge variant="outline" className="border-slate-600 text-slate-400">
                    <Text className="text-xs">{route.model}</Text>
                  </Badge>
                  <View className="flex-1" />
                  <View onClick={() => copyConfig(route.cliTool)} className="p-1">
                    {copiedCli === route.cliTool ? <Check size={14} color="#10b981" /> : <Copy size={14} color="#94a3b8" />}
                  </View>
                </View>
              ))}
            </View>
          )}
        </CardContent>
      </Card>

      {/* Quick Setup */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader className="p-4 pb-2">
          <View className="flex flex-row items-center gap-2">
            <Settings size={18} color="#f59e0b" />
            <Text className="block text-base font-semibold text-slate-200">CLI Setup Guide</Text>
          </View>
        </CardHeader>
        <CardContent className="p-4 pt-2">
          <Text className="block text-sm text-slate-400 mb-3">Configure your CLI tools to connect through the gateway:</Text>
          <View className="bg-slate-900 rounded-lg p-3 mb-2">
            <Text className="block text-xs text-amber-400 mb-1">Codex (~/.codex/config.toml)</Text>
            <Text className="block text-xs text-slate-300 font-mono">base_url = &quot;http://localhost:3000/api/gateway/proxy&quot;{"\n"}wire_api = &quot;responses&quot;</Text>
          </View>
          <View className="bg-slate-900 rounded-lg p-3 mb-2">
            <Text className="block text-xs text-amber-400 mb-1">Claude Code (environment variables)</Text>
            <Text className="block text-xs text-slate-300 font-mono">ANTHROPIC_BASE_URL=http://localhost:3000/api/gateway/proxy{"\n"}ANTHROPIC_API_KEY=gateway-proxy-key</Text>
          </View>
        </CardContent>
      </Card>
    </View>
  )
}

// ========== Providers Tab ==========
function ProvidersTab({ providers, refresh }: {
  providers: Provider[]
  refresh: () => void
}) {
  const [showDialog, setShowDialog] = useState(false)
  const [editingProvider, setEditingProvider] = useState<Provider | undefined>(undefined)

  const handleSave = async (data: any) => {
    try {
      if (editingProvider) {
        await Network.request({
          url: `/api/gateway/providers/${editingProvider.id}`,
          method: "PUT",
          data,
        })
      } else {
        await Network.request({
          url: "/api/gateway/providers",
          method: "POST",
          data,
        })
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

  const handleToggle = async (provider: Provider) => {
    try {
      await Network.request({
        url: `/api/gateway/providers/${provider.id}`,
        method: "PUT",
        data: { enabled: !provider.enabled },
      })
      refresh()
    } catch (err) {
      console.error("[Providers] toggle error:", err)
    }
  }

  return (
    <View className="flex flex-col gap-3">
      <View className="flex flex-row items-center justify-between">
        <Text className="block text-base font-semibold text-slate-200">Model Providers</Text>
        <Button className="bg-emerald-500 text-slate-900" size="sm" onClick={() => { setEditingProvider(undefined); setShowDialog(true) }}>
          <View className="flex flex-row items-center gap-1">
            <Plus size={14} color="#0f172a" />
            <Text className="text-xs">Add</Text>
          </View>
        </Button>
      </View>

      {providers.length === 0 ? (
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-8 items-center">
            <WifiOff size={32} color="#475569" />
            <Text className="block text-sm text-slate-500 mt-3">No providers configured</Text>
            <Text className="block text-xs text-slate-600 mt-1">Add a provider to get started</Text>
          </CardContent>
        </Card>
      ) : (
        providers.map(provider => (
          <Card key={provider.id} className="bg-slate-800 border-slate-700">
            <CardContent className="p-4">
              <View className="flex flex-row items-center gap-3 mb-3">
                <View className={`w-3 h-3 rounded-full ${provider.enabled ? "bg-emerald-500" : "bg-slate-600"}`} />
                <Text className="block text-sm font-semibold text-slate-200 flex-1">{provider.name}</Text>
                <Switch checked={provider.enabled} onCheckedChange={() => handleToggle(provider)} />
              </View>
              <View className="flex flex-col gap-2 mb-3">
                <View className="flex flex-row items-center gap-2">
                  <Text className="block text-xs text-slate-500 w-16">Format</Text>
                  <Badge variant="outline" className="border-slate-600">
                    <Text className="text-xs text-slate-400">{provider.type === "openai_chat" ? "Chat Completions" : provider.type === "openai_responses" ? "Responses" : "Anthropic"}</Text>
                  </Badge>
                </View>
                <View className="flex flex-row items-center gap-2">
                  <Text className="block text-xs text-slate-500 w-16">Base URL</Text>
                  <Text className="block text-xs text-slate-400 flex-1" numberOfLines={1}>{provider.baseUrl}</Text>
                </View>
                <View className="flex flex-row items-center gap-2">
                  <Text className="block text-xs text-slate-500 w-16">Models</Text>
                  <View className="flex flex-row flex-wrap gap-1 flex-1">
                    {provider.models.map(m => (
                      <Badge key={m} variant="secondary" className="bg-slate-700 text-slate-300">
                        <Text className="text-xs">{m}</Text>
                      </Badge>
                    ))}
                  </View>
                </View>
              </View>
              <View className="flex flex-row gap-2">
                <Button variant="outline" size="sm" className="border-slate-600 text-slate-400 flex-1" onClick={() => { setEditingProvider(provider); setShowDialog(true) }}>
                  <Text className="text-xs">Edit</Text>
                </Button>
                <Button variant="outline" size="sm" className="border-red-800 text-red-400 flex-1" onClick={() => handleDelete(provider.id)}>
                  <Trash2 size={12} color="#f87171" />
                  <Text className="text-xs text-red-400">Delete</Text>
                </Button>
              </View>
            </CardContent>
          </Card>
        ))
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="bg-slate-800 border-slate-700">
          <DialogHeader>
            <DialogTitle>
              <Text className="text-slate-200">{editingProvider ? "Edit Provider" : "Add Provider"}</Text>
            </DialogTitle>
          </DialogHeader>
          <ProviderForm
            provider={editingProvider}
            onSave={handleSave}
            onCancel={() => { setShowDialog(false); setEditingProvider(undefined) }}
          />
        </DialogContent>
      </Dialog>
    </View>
  )
}

// ========== Routes Tab ==========
function RoutesTab({ routes, providers, refresh }: {
  routes: RouteConfig[]
  providers: Provider[]
  refresh: () => void
}) {
  const [showDialog, setShowDialog] = useState(false)
  const [editingRoute, setEditingRoute] = useState<RouteConfig | undefined>(undefined)

  // Form state
  const [cliTool, setCliTool] = useState("codex")
  const [providerId, setProviderId] = useState("")
  const [model, setModel] = useState("")

  const cliTools = [
    { value: "claude-code", label: "Claude Code" },
    { value: "codex", label: "Codex" },
    { value: "cursor", label: "Cursor" },
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
        await Network.request({
          url: `/api/gateway/routes/${editingRoute.id}`,
          method: "PUT",
          data: { cliTool, providerId, model, enabled: editingRoute.enabled },
        })
      } else {
        await Network.request({
          url: "/api/gateway/routes",
          method: "POST",
          data: { cliTool, providerId, model, enabled: true },
        })
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

  const handleToggle = async (route: RouteConfig) => {
    try {
      await Network.request({
        url: `/api/gateway/routes/${route.id}`,
        method: "PUT",
        data: { enabled: !route.enabled },
      })
      refresh()
    } catch (err) {
      console.error("[Routes] toggle error:", err)
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

  return (
    <View className="flex flex-col gap-3">
      <View className="flex flex-row items-center justify-between">
        <Text className="block text-base font-semibold text-slate-200">Routes</Text>
        <Button className="bg-emerald-500 text-slate-900" size="sm" onClick={openAdd}>
          <View className="flex flex-row items-center gap-1">
            <Plus size={14} color="#0f172a" />
            <Text className="text-xs">Add</Text>
          </View>
        </Button>
      </View>

      {routes.length === 0 ? (
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-8 items-center">
            <Route size={32} color="#475569" />
            <Text className="block text-sm text-slate-500 mt-3">No routes configured</Text>
            <Text className="block text-xs text-slate-600 mt-1">Add a route to connect CLI tools to providers</Text>
          </CardContent>
        </Card>
      ) : (
        routes.map(route => (
          <Card key={route.id} className="bg-slate-800 border-slate-700">
            <CardContent className="p-4">
              <View className="flex flex-row items-center gap-3 mb-2">
                <Badge className="bg-blue-500 text-blue-100 border-blue-400">
                  <Text className="text-xs">{route.cliTool}</Text>
                </Badge>
                <Text className="block text-slate-500">→</Text>
                <Badge className="bg-emerald-500 text-emerald-100 border-emerald-400">
                  <Text className="text-xs">{route.providerName || route.providerId}</Text>
                </Badge>
                <View className="flex-1" />
                <Switch checked={route.enabled} onCheckedChange={() => handleToggle(route)} />
              </View>
              <View className="flex flex-row items-center gap-2 mb-3">
                <Text className="block text-xs text-slate-500">Model:</Text>
                <Badge variant="outline" className="border-slate-600 text-slate-400">
                  <Text className="text-xs">{route.model}</Text>
                </Badge>
              </View>
              <View className="flex flex-row gap-2">
                <Button variant="outline" size="sm" className="border-slate-600 text-slate-400 flex-1" onClick={() => openEdit(route)}>
                  <Text className="text-xs">Edit</Text>
                </Button>
                <Button variant="outline" size="sm" className="border-red-800 text-red-400 flex-1" onClick={() => handleDelete(route.id)}>
                  <Trash2 size={12} color="#f87171" />
                  <Text className="text-xs text-red-400">Delete</Text>
                </Button>
              </View>
            </CardContent>
          </Card>
        ))
      )}

      <Dialog open={showDialog} onOpenChange={(open) => { setShowDialog(open); if (!open) resetForm() }}>
        <DialogContent className="bg-slate-800 border-slate-700">
          <DialogHeader>
            <DialogTitle>
              <Text className="text-slate-200">{editingRoute ? "Edit Route" : "Add Route"}</Text>
            </DialogTitle>
          </DialogHeader>
          <View className="flex flex-col gap-4">
            <View className="flex flex-col gap-2">
              <Label>CLI Tool</Label>
              <View className="flex flex-row gap-2">
                {cliTools.map(t => (
                  <View key={t.value} onClick={() => setCliTool(t.value)} className={`px-3 py-2 rounded-md ${cliTool === t.value ? "bg-blue-500 bg-opacity-20 border border-blue-500" : "bg-slate-700"}`}>
                    <Text className={`block text-xs ${cliTool === t.value ? "text-blue-400" : "text-slate-400"}`}>{t.label}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View className="flex flex-col gap-2">
              <Label>Provider</Label>
              <View className="flex flex-row gap-2 flex-wrap">
                {providers.map(p => (
                  <View key={p.id} onClick={() => { setProviderId(p.id); setModel("") }} className={`px-3 py-2 rounded-md ${providerId === p.id ? "bg-emerald-500 bg-opacity-20 border border-emerald-500" : "bg-slate-700"}`}>
                    <Text className={`block text-xs ${providerId === p.id ? "text-emerald-400" : "text-slate-400"}`}>{p.name}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View className="flex flex-col gap-2">
              <Label>Model</Label>
              {availableModels.length > 0 ? (
                <View className="flex flex-row gap-2 flex-wrap">
                  {availableModels.map(m => (
                    <View key={m} onClick={() => setModel(m)} className={`px-3 py-2 rounded-md ${model === m ? "bg-amber-500 bg-opacity-20 border border-amber-500" : "bg-slate-700"}`}>
                      <Text className={`block text-xs ${model === m ? "text-amber-400" : "text-slate-400"}`}>{m}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <View className="bg-slate-700 rounded-md px-3 py-2">
                  <Input className="w-full bg-transparent text-slate-200" placeholder="Model name" value={model} onInput={e => setModel(e.detail.value)} />
                </View>
              )}
            </View>

            <View className="flex flex-row gap-3 mt-2">
              <Button variant="outline" className="flex-1 border-slate-600 text-slate-300" onClick={() => { setShowDialog(false); resetForm() }}>
                <Text>Cancel</Text>
              </Button>
              <Button className="flex-1 bg-emerald-500 text-slate-900" onClick={handleSave} disabled={!cliTool || !providerId || !model}>
                <Text>Save</Text>
              </Button>
            </View>
          </View>
        </DialogContent>
      </Dialog>
    </View>
  )
}

// ========== Logs Tab ==========
function LogsTab({ logs, refresh }: { logs: ProxyLog[]; refresh: () => void }) {
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

  return (
    <View className="flex flex-col gap-3">
      <View className="flex flex-row items-center justify-between">
        <Text className="block text-base font-semibold text-slate-200">Request Logs</Text>
        <View className="flex flex-row items-center gap-3">
          <View className="flex flex-row items-center gap-2" onClick={() => setAutoRefresh(!autoRefresh)}>
            <View className={`w-2 h-2 rounded-full ${autoRefresh ? "bg-emerald-500" : "bg-slate-600"}`} />
            <Text className="block text-xs text-slate-400">Auto</Text>
          </View>
          <Button variant="outline" size="sm" className="border-slate-600 text-slate-400" onClick={refresh}>
            <Text className="text-xs">Refresh</Text>
          </Button>
        </View>
      </View>

      {logs.length === 0 ? (
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-8 items-center">
            <FileText size={32} color="#475569" />
            <Text className="block text-sm text-slate-500 mt-3">No request logs yet</Text>
            <Text className="block text-xs text-slate-600 mt-1">Logs will appear when the gateway forwards requests</Text>
          </CardContent>
        </Card>
      ) : (
        [...logs].reverse().map(log => (
          <Card key={log.id} className="bg-slate-800 border-slate-700">
            <CardContent className="p-3">
              <View className="flex flex-row items-center gap-2 mb-1">
                <Text className="block text-xs text-slate-500">{formatTime(log.timestamp)}</Text>
                <Text className="block text-xs text-slate-600">{log.direction === "inbound" ? "→" : "←"}</Text>
                <Badge variant={log.statusCode === 200 ? "default" : "destructive"} className={log.statusCode === 200 ? "bg-emerald-500 text-emerald-100" : "bg-red-500 text-red-100"}>
                  <Text className="text-xs">{log.statusCode}</Text>
                </Badge>
                <Text className="block text-xs text-slate-400 flex-1" numberOfLines={1}>{log.endpoint}</Text>
                <Text className="block text-xs text-slate-500">{log.duration}ms</Text>
              </View>
              <View className="flex flex-row items-center gap-2">
                <Badge variant="outline" className="border-slate-600">
                  <Text className="text-xs text-slate-400">{log.cliTool}</Text>
                </Badge>
                <Badge variant="outline" className="border-slate-600">
                  <Text className="text-xs text-slate-400">{log.provider}</Text>
                </Badge>
                <Badge variant="outline" className="border-slate-600">
                  <Text className="text-xs text-slate-400">{log.model}</Text>
                </Badge>
              </View>
              {log.error && (
                <Text className="block text-xs text-red-400 mt-1" numberOfLines={2}>{log.error}</Text>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </View>
  )
}

// ========== Main Page ==========
export default function Index() {
  const [activeTab, setActiveTab] = useState("dashboard")
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

  return (
    <View className="min-h-screen bg-slate-900">
      {/* Header */}
      <View className="bg-slate-800 border-b border-slate-700 px-4 pt-12 pb-3">
        <View className="flex flex-row items-center gap-2">
          <Activity size={20} color="#10b981" />
          <Text className="block text-lg font-bold text-slate-200">AI Gateway</Text>
        </View>
        <Text className="block text-xs text-slate-500 mt-1">Local proxy for CLI → Model provider</Text>
      </View>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
        <View className="px-4 pt-3">
          <TabsList className="w-full flex flex-row bg-slate-800 rounded-lg p-1">
            <TabsTrigger value="dashboard" className="flex-1">
              <View className="flex flex-row items-center gap-1">
                <Server size={12} color={activeTab === "dashboard" ? "#e2e8f0" : "#94a3b8"} />
                <Text className="text-xs">Dashboard</Text>
              </View>
            </TabsTrigger>
            <TabsTrigger value="providers" className="flex-1">
              <View className="flex flex-row items-center gap-1">
                <Wifi size={12} color={activeTab === "providers" ? "#e2e8f0" : "#94a3b8"} />
                <Text className="text-xs">Providers</Text>
              </View>
            </TabsTrigger>
            <TabsTrigger value="routes" className="flex-1">
              <View className="flex flex-row items-center gap-1">
                <Route size={12} color={activeTab === "routes" ? "#e2e8f0" : "#94a3b8"} />
                <Text className="text-xs">Routes</Text>
              </View>
            </TabsTrigger>
            <TabsTrigger value="logs" className="flex-1">
              <View className="flex flex-row items-center gap-1">
                <FileText size={12} color={activeTab === "logs" ? "#e2e8f0" : "#94a3b8"} />
                <Text className="text-xs">Logs</Text>
              </View>
            </TabsTrigger>
          </TabsList>
        </View>

        <ScrollView className="flex-1 px-4 pt-3 pb-8" scrollY>
          <TabsContent value="dashboard">
            <DashboardTab status={status} providers={providers} routes={routes} />
          </TabsContent>

          <TabsContent value="providers">
            <ProvidersTab providers={providers} refresh={() => { fetchProviders(); fetchStatus() }} />
          </TabsContent>

          <TabsContent value="routes">
            <RoutesTab routes={routes} providers={providers} refresh={() => { fetchRoutes(); fetchStatus() }} />
          </TabsContent>

          <TabsContent value="logs">
            <LogsTab logs={logs} refresh={fetchLogs} />
          </TabsContent>
        </ScrollView>
      </Tabs>
    </View>
  )
}
