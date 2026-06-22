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
   * Test connectivity to a provider
   */
  async testProvider(id: string): Promise<{ success: boolean; message: string; latency?: number }> {
    const provider = store.getProviderById(id);
    if (!provider) {
      return { success: false, message: 'Provider not found' };
    }

    const startTime = Date.now();
    try {
      const https = require('https');
      const http = require('http');
      const client = provider.baseUrl.startsWith('https') ? https : http;

      const url = new URL(`${provider.baseUrl.replace(/\/+$/, '')}/models`);
      
      return new Promise((resolve) => {
        const req = client.request(
          {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${provider.apiKey}`,
              'Content-Type': 'application/json',
            },
            timeout: 10000,
          },
          (res: any) => {
            const latency = Date.now() - startTime;
            let body = '';
            res.on('data', (chunk: any) => { body += chunk; });
            res.on('end', () => {
              if (res.statusCode === 200 || res.statusCode === 401) {
                // 401 means the API key is wrong but the server is reachable
                resolve({
                  success: res.statusCode === 200,
                  message: res.statusCode === 200 ? `Connected (${latency}ms)` : 'API key is invalid',
                  latency,
                });
              } else {
                resolve({
                  success: false,
                  message: `HTTP ${res.statusCode}`,
                  latency,
                });
              }
            });
          },
        );

        req.on('error', (err: any) => {
          resolve({
            success: false,
            message: `Connection failed: ${err.message}`,
            latency: Date.now() - startTime,
          });
        });

        req.on('timeout', () => {
          req.destroy();
          resolve({
            success: false,
            message: 'Connection timed out',
            latency: Date.now() - startTime,
          });
        });

        req.end();
      });
    } catch (err: any) {
      return {
        success: false,
        message: `Error: ${err.message}`,
        latency: Date.now() - startTime,
      };
    }
  }
}
