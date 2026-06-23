import { Injectable } from '@nestjs/common';
import { curlRequest, curlStream, CurlStreamCallbacks } from './curl-fetch';
import {
  getProviders, getProviderById, createProvider, updateProvider, deleteProvider,
  getRoutes, createRoute, updateRoute, deleteRoute,
  getLogs, addLog, clearLogs,
  getGatewayStatus, incrementRequests,
  replaceAllProviders, replaceAllRoutes,
  getCachedModels, setCachedModels,
  getProviderHealth, setProviderHealth, isHealthCheckNeeded, getAllProviderHealth,
  decryptProvider,
} from './gateway.store';
import { Provider, RouteConfig, ProxyLog, GatewayStatus, ApiFormat } from './gateway.types';

@Injectable()
export class GatewayService {
  // ========== Provider CRUD ==========

  getAllProviders(): Provider[] {
    return getProviders();
  }

  getProvider(id: string): Provider | undefined {
    return getProviderById(id);
  }

  createProvider(data: Omit<Provider, 'id' | 'createdAt' | 'updatedAt'>): Provider {
    return createProvider(data);
  }

  updateProvider(id: string, data: Partial<Provider>): Provider | null {
    return updateProvider(id, data);
  }

  deleteProvider(id: string): boolean {
    return deleteProvider(id);
  }

  // ========== Route CRUD ==========

  getAllRoutes(): RouteConfig[] {
    return getRoutes();
  }

  createRoute(data: Omit<RouteConfig, 'id' | 'createdAt'>): RouteConfig {
    return createRoute(data);
  }

  updateRoute(id: string, data: Partial<RouteConfig>): RouteConfig | null {
    return updateRoute(id, data);
  }

  deleteRoute(id: string): boolean {
    return deleteRoute(id);
  }

  // ========== Logs ==========

  getLogs(limit?: number): ProxyLog[] {
    return getLogs(limit);
  }

  clearLogs(): void {
    clearLogs();
  }

  // ========== Status ==========

  getStatus(proxyPort: number): GatewayStatus {
    return getGatewayStatus(proxyPort);
  }

  incrementRequestCount(): number {
    return incrementRequests();
  }

  // ========== Import/Export ==========

  replaceAllProviders(providers: Provider[]): void {
    replaceAllProviders(providers);
  }

  replaceAllRoutes(routes: RouteConfig[]): void {
    replaceAllRoutes(routes);
  }

  // ========== Test Connection ==========

  async testProvider(id: string) {
    const provider = getProviderById(id);
    if (!provider) {
      return { success: false, message: '供应商不存在' };
    }
    return this.testProviderConnection(provider.baseUrl, provider.apiKey, provider.type);
  }

  async testProviderDirect(baseUrl: string, apiKey: string, type: ApiFormat) {
    return this.testProviderConnection(baseUrl, apiKey, type);
  }

  async testProviderConnection(baseUrl: string, apiKey: string, type: ApiFormat) {
    const startTime = Date.now();

    try {
      let testUrl: string;
      const headers: Record<string, string> = {};

      if (type === 'anthropic') {
        // Anthropic: use /v1/messages with a minimal request
        const base = baseUrl.replace(/\/+$/, '');
        if (base.endsWith('/v1') || base.includes('/v1/')) {
          testUrl = `${base}/messages`;
        } else {
          testUrl = `${base}/v1/messages`;
        }
        headers['x-api-key'] = apiKey;
        headers['anthropic-version'] = '2023-06-01';
        headers['Content-Type'] = 'application/json';

        const response = await curlRequest(testUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: 'claude-3-haiku-20240307',
            max_tokens: 1,
            messages: [{ role: 'user', content: 'hi' }],
          }),
          timeout: 15,
        });

        const latency = Date.now() - startTime;

        if (response.statusCode === 200 || response.statusCode === 201) {
          return { success: true, message: '连接成功', latency, modelCount: 0, models: [] };
        }
        if (response.statusCode === 401 || response.statusCode === 403) {
          return { success: false, message: 'API Key 无效', latency, detail: response.body.substring(0, 200) };
        }
        if (response.statusCode === 400) {
          // 400 can mean the API is reachable but params are off
          return { success: true, message: '连接成功（参数需调整）', latency, modelCount: 0, models: [] };
        }
        return {
          success: false,
          message: `HTTP ${response.statusCode}`,
          latency,
          detail: response.body.substring(0, 200),
        };
      }

      // OpenAI-compatible: GET /v1/models
      const base = baseUrl.replace(/\/+$/, '');
      if (base.endsWith('/v1') || base.includes('/v1/')) {
        testUrl = `${base}/models`;
      } else {
        testUrl = `${base}/v1/models`;
      }

      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const response = await curlRequest(testUrl, {
        method: 'GET',
        headers,
        timeout: 15,
      });

      const latency = Date.now() - startTime;

      if (response.statusCode === 200) {
        try {
          const data = JSON.parse(response.body);
          const models = (data.data || []).map((m: any) => m.id).sort();
          return { success: true, message: '连接成功', latency, modelCount: models.length, models };
        } catch {
          return { success: true, message: '连接成功（无法解析模型列表）', latency, modelCount: 0, models: [] };
        }
      }

      if (response.statusCode === 401 || response.statusCode === 403) {
        return { success: false, message: 'API Key 无效', latency, detail: response.body.substring(0, 200) };
      }

      // Check for Cloudflare blocking
      if (response.body.includes('cloudflare') || response.body.includes('Sorry, you have been blocked')) {
        return {
          success: false,
          message: '被 Cloudflare 拦截',
          latency,
          detail: '该 API 地址启用了 Cloudflare 防护，请尝试使用其他 API 地址或联系服务商',
        };
      }
      return {
        success: false,
        message: `HTTP ${response.statusCode}`,
        latency,
        detail: response.body.substring(0, 200),
      };
    } catch (err: any) {
      return {
        success: false,
        message: `连接失败: ${err.message}`,
        latency: Date.now() - startTime,
        detail: `请检查 Base URL 是否正确，确保可以访问。常见问题：URL 格式错误、网络代理、防火墙拦截`,
      };
    }
  }

  // ========== Fetch Models (with cache) ==========

  async fetchModels(providerId: string): Promise<string[]> {
    // Check cache first
    const cached = getCachedModels(providerId);
    if (cached) {
      console.log(`[Gateway] Returning cached models for provider ${providerId}`);
      return cached;
    }

    const provider = getProviderById(providerId);
    if (!provider) return [];

    try {
      const base = provider.baseUrl.replace(/\/+$/, '');
      let modelsUrl: string;
      if (base.endsWith('/v1') || base.includes('/v1/')) {
        modelsUrl = `${base}/models`;
      } else {
        modelsUrl = `${base}/v1/models`;
      }

      const headers: Record<string, string> = {};
      if (provider.apiKey) {
        headers['Authorization'] = `Bearer ${provider.apiKey}`;
      }

      const response = await curlRequest(modelsUrl, {
        method: 'GET',
        headers,
        timeout: 15,
      });

      if (response.statusCode === 200) {
        const data = JSON.parse(response.body);
        const models = (data.data || []).map((m: any) => m.id).sort();
        setCachedModels(providerId, provider.id, models);
        return models;
      }
      return [];
    } catch {
      return [];
    }
  }

  // ========== Health Check ==========

  async checkProviderHealth(providerId: string): Promise<{ healthy: boolean; latency?: number; error?: string }> {
    if (!isHealthCheckNeeded(providerId)) {
      const health = getProviderHealth(providerId);
      return { healthy: health?.healthy ?? false, latency: health?.latency, error: health?.error };
    }

    const provider = getProviderById(providerId);
    if (!provider || !provider.enabled) {
      setProviderHealth(providerId, { healthy: false, lastChecked: Date.now(), error: 'Provider disabled or not found' });
      return { healthy: false, error: 'Provider disabled or not found' };
    }

    try {
      const result = await this.testProviderConnection(provider.baseUrl, provider.apiKey, provider.type);
      const healthData = {
        healthy: result.success,
        lastChecked: Date.now(),
        latency: result.latency,
        error: result.success ? undefined : result.message,
      };
      setProviderHealth(providerId, healthData);
      return healthData;
    } catch (err: any) {
      const healthData = {
        healthy: false,
        lastChecked: Date.now(),
        error: err.message,
      };
      setProviderHealth(providerId, healthData);
      return healthData;
    }
  }

  getProvidersWithHealth(): any[] {
    const providers = getProviders();
    return providers.map(p => {
      const health = getProviderHealth(p.id);
      return {
        ...p,
        health: health ? { healthy: health.healthy, lastChecked: health.lastChecked, latency: health.latency } : null,
      };
    });
  }

  // ========== Route Resolution ==========

  resolveRoute(cliTool: string): { provider: Provider; route: RouteConfig } | null {
    const routes = getRoutes();
    const route = routes.find(r => r.cliTool === cliTool && r.enabled);
    if (!route) return null;

    const provider = getProviderById(route.providerId);
    if (!provider || !provider.enabled) return null;

    return { provider, route };
  }

  resolveRouteByModel(cliTool: string, model: string): { provider: Provider; route: RouteConfig } | null {
    const routes = getRoutes();
    // First try to find a route that matches the model
    let route = routes.find(r => r.cliTool === cliTool && r.model === model && r.enabled);
    if (!route) {
      // Fall back to any route for this CLI tool
      route = routes.find(r => r.cliTool === cliTool && r.enabled);
    }
    if (!route) return null;

    const provider = getProviderById(route.providerId);
    if (!provider || !provider.enabled) return null;

    return { provider, route };
  }
}
