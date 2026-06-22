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
      const https = require('https');
      const http = require('http');

      // Normalize URL and determine test endpoint based on provider type
      let normalizedUrl = baseUrl.replace(/\/+$/, '');
      
      // For OpenAI-compatible APIs, ensure URL ends with /v1
      if (type !== 'anthropic' && !normalizedUrl.endsWith('/v1')) {
        normalizedUrl += '/v1';
      }

      const client = normalizedUrl.startsWith('https') ? https : http;
      
      // Anthropic uses different auth header and endpoint
      let testPath: string;
      let headers: Record<string, string>;
      
      if (type === 'anthropic') {
        // Anthropic: test with /v1/messages (just check if the endpoint responds)
        testPath = '/v1/messages';
        headers = {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        };
      } else {
        // OpenAI-compatible: test with /v1/models
        testPath = `${normalizedUrl.endsWith('/v1') ? '' : '/v1'}/models`;
        headers = {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        };
      }
      
      const baseUrlForPath = type === 'anthropic' ? normalizedUrl : normalizedUrl;
      const url = new URL(testPath, baseUrlForPath.startsWith('http') ? baseUrlForPath : `https://${baseUrlForPath}`);
      console.log(`[TestConnection] Testing: ${url.toString()} (type: ${type || 'openai_chat'})`);
      
      return new Promise((resolve) => {
        const req = client.request(
          {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method: 'GET',
            headers: type === 'anthropic' ? headers : {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            timeout: 15000,
          },
          (res: any) => {
            const latency = Date.now() - startTime;
            let body = '';
            res.on('data', (chunk: any) => { body += chunk; });
            res.on('end', () => {
              console.log(`[TestConnection] Response: ${res.statusCode}, Body: ${body.substring(0, 200)}`);
              if (res.statusCode === 200) {
                try {
                  const data = JSON.parse(body);
                  const models = Array.isArray(data?.data) ? data.data.map((m: any) => m.id || m.name || m.model).filter(Boolean) : [];
                  const modelCount = models.length;
                  resolve({
                    success: true,
                    message: `连接成功 (${latency}ms)，可用模型: ${modelCount} 个`,
                    latency,
                    modelCount,
                    models,
                  });
                } catch {
                  resolve({
                    success: true,
                    message: `连接成功 (${latency}ms)`,
                    latency,
                  });
                }
              } else if (res.statusCode === 401 || res.statusCode === 403) {
                resolve({
                  success: false,
                  message: 'API Key 无效或无权限',
                  latency,
                  detail: body.substring(0, 200),
                });
              } else if (res.statusCode === 404) {
                resolve({
                  success: false,
                  message: 'API 端点不存在，请检查 Base URL 格式',
                  latency,
                  detail: `请求地址: ${url.toString()}`,
                });
              } else {
                resolve({
                  success: false,
                  message: `HTTP ${res.statusCode}`,
                  latency,
                  detail: body.substring(0, 200),
                });
              }
            });
          },
        );

        req.on('error', (err: any) => {
          console.log(`[TestConnection] Error: ${err.message}`);
          resolve({
            success: false,
            message: `连接失败: ${err.message}`,
            latency: Date.now() - startTime,
            detail: `请检查 Base URL 是否正确，确保可以访问。常见问题：URL 格式错误、网络代理、防火墙拦截`,
          });
        });

        req.on('timeout', () => {
          req.destroy();
          resolve({
            success: false,
            message: '连接超时 (15秒)',
            latency: Date.now() - startTime,
            detail: '请检查网络连接，确保可以访问该 API 地址',
          });
        });

        req.end();
      });
    } catch (err: any) {
      return {
        success: false,
        message: `请求构建失败: ${err.message}`,
      };
    }
  }
}
