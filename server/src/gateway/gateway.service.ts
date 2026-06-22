import { Injectable, Logger } from '@nestjs/common';
import { Provider, RouteConfig, ProxyLog, GatewayStatus } from './gateway.types';
import * as store from './gateway.store';

@Injectable()
export class GatewayService {
  private readonly logger = new Logger(GatewayService.name);

  // ========== Provider ==========

  getProviders(): Provider[] {
    return store.getProviders();
  }

  getProviderById(id: string): Provider | undefined {
    return store.getProviderById(id);
  }

  createProvider(data: Omit<Provider, 'id' | 'createdAt' | 'updatedAt'>): Provider {
    this.logger.log(`Creating provider: ${data.name}`);
    return store.createProvider(data);
  }

  updateProvider(id: string, data: Partial<Provider>): Provider | null {
    this.logger.log(`Updating provider: ${id}`);
    return store.updateProvider(id, data);
  }

  deleteProvider(id: string): boolean {
    this.logger.log(`Deleting provider: ${id}`);
    return store.deleteProvider(id);
  }

  getAllProviders(): Provider[] {
    return store.getProviders();
  }

  replaceAllProviders(providers: Provider[]): void {
    this.logger.log(`Replacing all providers with ${providers.length} items`);
    store.replaceAllProviders(providers);
  }

  // ========== Route ==========

  getRoutes(): RouteConfig[] {
    return store.getRoutes();
  }

  getRouteById(id: string): RouteConfig | undefined {
    return store.getRouteById(id);
  }

  createRoute(data: Omit<RouteConfig, 'id' | 'createdAt'>): RouteConfig {
    this.logger.log(`Creating route: ${data.cliTool} -> ${data.providerId}`);
    return store.createRoute(data);
  }

  updateRoute(id: string, data: Partial<RouteConfig>): RouteConfig | null {
    this.logger.log(`Updating route: ${id}`);
    return store.updateRoute(id, data);
  }

  deleteRoute(id: string): boolean {
    this.logger.log(`Deleting route: ${id}`);
    return store.deleteRoute(id);
  }

  getAllRoutes(): RouteConfig[] {
    return store.getRoutes();
  }

  replaceAllRoutes(routes: RouteConfig[]): void {
    this.logger.log(`Replacing all routes with ${routes.length} items`);
    store.replaceAllRoutes(routes);
  }

  // ========== Logs ==========

  getLogs(limit?: number): ProxyLog[] {
    return store.getLogs(limit);
  }

  clearLogs(): void {
    store.clearLogs();
  }

  // ========== Status ==========

  getStatus(proxyPort: number): GatewayStatus {
    return store.getGatewayStatus(proxyPort);
  }

  // ========== Route Resolution ==========

  /**
   * Resolve which provider and model to use for a given CLI tool
   */
  resolveRoute(cliTool: string): { provider: Provider; model: string } | null {
    const routes = store.getRoutes();
    const enabledRoute = routes.find(r => r.cliTool === cliTool && r.enabled);
    if (!enabledRoute) return null;

    const provider = store.getProviderById(enabledRoute.providerId);
    if (!provider || !provider.enabled) return null;

    return { provider, model: enabledRoute.model };
  }

  /**
   * Test connectivity to a provider by ID
   */
  async testProvider(id: string): Promise<{ success: boolean; message: string; latency?: number }> {
    const provider = store.getProviderById(id);
    if (!provider) {
      return { success: false, message: 'Provider not found' };
    }
    return this.testProviderConnection(provider.baseUrl, provider.apiKey, provider.type);
  }

  /**
   * Test connectivity to a provider by URL and API key
   */
  async testProviderConnection(baseUrl: string, apiKey: string, type?: string): Promise<{ success: boolean; message: string; latency?: number; detail?: string; modelCount?: number; models?: string[] }> {
    const startTime = Date.now();
    try {
      const { curlRequest } = require('./curl-fetch');

      // Normalize: remove trailing slashes
      let normalizedUrl = baseUrl.replace(/\/+$/, '');

      // Build the full test URL
      let testUrl: string;
      let headers: Record<string, string>;

      if (type === 'anthropic') {
        testUrl = normalizedUrl.includes('/v1') ? `${normalizedUrl}/messages` : `${normalizedUrl}/v1/messages`;
        headers = {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        };
      } else {
        if (normalizedUrl.endsWith('/v1')) {
          testUrl = `${normalizedUrl}/models`;
        } else if (normalizedUrl.includes('/v1/')) {
          testUrl = `${normalizedUrl}/models`;
        } else {
          testUrl = `${normalizedUrl}/v1/models`;
        }
        headers = {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        };
      }

      console.log(`[TestConnection] Testing via curl: ${testUrl} (type: ${type || 'openai_chat'})`);

      const response = await curlRequest(testUrl, { headers, timeout: 15000 });
      const latency = Date.now() - startTime;

      console.log(`[TestConnection] Response: ${response.statusCode}, Body: ${response.body.substring(0, 200)}`);

      if (response.statusCode === 200) {
        try {
          const data = JSON.parse(response.body);
          const models = Array.isArray(data?.data) ? data.data.map((m: any) => m.id || m.name || m.model).filter(Boolean) : [];
          const modelCount = models.length;
          return {
            success: true,
            message: `连接成功 (${latency}ms)，可用模型: ${modelCount} 个`,
            latency,
            modelCount,
            models,
          };
        } catch {
          return {
            success: true,
            message: `连接成功 (${latency}ms)`,
            latency,
          };
        }
      } else if (response.statusCode === 401 || response.statusCode === 403) {
        return {
          success: false,
          message: 'API Key 无效或无权限',
          latency,
          detail: response.body.substring(0, 200),
        };
      } else if (response.statusCode === 404) {
        return {
          success: false,
          message: 'API 端点不存在，请检查 Base URL 格式',
          latency,
          detail: `请求地址: ${testUrl}`,
        };
      } else if (response.statusCode === 0) {
        return {
          success: false,
          message: '连接失败: 无法连接到服务器',
          latency,
          detail: '请检查 Base URL 是否正确，确保可以访问',
        };
      } else {
        // Check if response looks like Cloudflare block page
        if (response.body.includes('Cloudflare') || response.body.includes('blocked')) {
          return {
            success: false,
            message: `被 Cloudflare 拦截 (HTTP ${response.statusCode})`,
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
      }
    } catch (err: any) {
      return {
        success: false,
        message: `连接失败: ${err.message}`,
        latency: Date.now() - startTime,
        detail: `请检查 Base URL 是否正确，确保可以访问。常见问题：URL 格式错误、网络代理、防火墙拦截`,
      };
    }
  }
}
