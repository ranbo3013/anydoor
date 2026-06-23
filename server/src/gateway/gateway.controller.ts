import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, Req, Res, Logger, HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { GatewayService } from './gateway.service';
import { Provider, RouteConfig } from './gateway.types';
import * as store from './gateway.store';
import { curlRequest, curlStream } from './curl-fetch';
import { chatChunkToResponsesEvent } from './chat-to-responses';

@Controller('gateway')
export class GatewayController {
  private readonly logger = new Logger(GatewayController.name);

  constructor(private readonly gatewayService: GatewayService) {}

  // ========== Status ==========

  @Get('status')
  getStatus() {
    console.log('[Gateway] GET /api/gateway/status');
    const status = this.gatewayService.getStatus(3000);
    return { code: 200, msg: 'success', data: status };
  }

  @Get('_info')
  getInfo() {
    console.log('[Gateway] GET /api/gateway/_info');
    const providers = this.gatewayService.getProviders();
    const routes = this.gatewayService.getRoutes();
    return {
      code: 200,
      msg: 'success',
      data: {
        providerCount: providers.length,
        routeCount: routes.length,
        port: 3000,
        host: 'localhost',
      },
    };
  }

  // ========== Provider CRUD ==========

  @Get('providers')
  getProviders() {
    console.log('[Gateway] GET /api/gateway/providers');
    const providers = this.gatewayService.getProviders();
    return { code: 200, msg: 'success', data: providers };
  }

  @Get('providers/:id')
  getProvider(@Param('id') id: string) {
    console.log(`[Gateway] GET /api/gateway/providers/${id}`);
    const provider = this.gatewayService.getProviderById(id);
    if (!provider) {
      return { code: 404, msg: 'Provider not found', data: null };
    }
    return { code: 200, msg: 'success', data: provider };
  }

  @Post('providers')
  createProvider(@Body() body: Omit<Provider, 'id' | 'createdAt' | 'updatedAt'>) {
    console.log('[Gateway] POST /api/gateway/providers', JSON.stringify({ ...body, apiKey: '***' }));
    const provider = this.gatewayService.createProvider(body);
    return { code: 200, msg: 'success', data: provider };
  }

  @Put('providers/:id')
  updateProvider(@Param('id') id: string, @Body() body: Partial<Provider>) {
    console.log(`[Gateway] PUT /api/gateway/providers/${id}`, JSON.stringify({ ...body, apiKey: '***' }));
    const provider = this.gatewayService.updateProvider(id, body);
    if (!provider) {
      return { code: 404, msg: 'Provider not found', data: null };
    }
    return { code: 200, msg: 'success', data: provider };
  }

  @Delete('providers/:id')
  deleteProvider(@Param('id') id: string) {
    console.log(`[Gateway] DELETE /api/gateway/providers/${id}`);
    const deleted = this.gatewayService.deleteProvider(id);
    if (!deleted) {
      return { code: 404, msg: 'Provider not found', data: null };
    }
    return { code: 200, msg: 'success', data: null };
  }

  @Post('providers/:id/test')
  async testProvider(@Param('id') id: string) {
    console.log(`[Gateway] POST /api/gateway/providers/${id}/test`);
    const result = await this.gatewayService.testProvider(id);
    return { code: 200, msg: 'success', data: result };
  }

  @Post('providers/test')
  async testProviderDirect(@Body() body: { baseUrl: string; apiKey: string; type?: string }) {
    console.log(`[Gateway] POST /api/gateway/providers/test - ${body.baseUrl} type=${body.type}`);
    if (!body.baseUrl) {
      return { code: 400, msg: 'Base URL is required', data: { success: false, message: 'Base URL 不能为空' } };
    }
    const result = await this.gatewayService.testProviderConnection(body.baseUrl, body.apiKey || '', body.type);
    return { code: 200, msg: 'success', data: result };
  }

  // ========== Route CRUD ==========

  @Get('routes')
  getRoutes() {
    console.log('[Gateway] GET /api/gateway/routes');
    const routes = this.gatewayService.getRoutes();
    // Enrich routes with provider info
    const enriched = routes.map(r => {
      const provider = this.gatewayService.getProviderById(r.providerId);
      return {
        ...r,
        providerName: provider?.name || 'Unknown',
        providerType: provider?.type || 'openai_chat',
      };
    });
    return { code: 200, msg: 'success', data: enriched };
  }

  @Post('routes')
  createRoute(@Body() body: Omit<RouteConfig, 'id' | 'createdAt'>) {
    console.log('[Gateway] POST /api/gateway/routes', JSON.stringify(body));
    const route = this.gatewayService.createRoute(body);
    return { code: 200, msg: 'success', data: route };
  }

  @Put('routes/:id')
  updateRoute(@Param('id') id: string, @Body() body: Partial<RouteConfig>) {
    console.log(`[Gateway] PUT /api/gateway/routes/${id}`, JSON.stringify(body));
    const route = this.gatewayService.updateRoute(id, body);
    if (!route) {
      return { code: 404, msg: 'Route not found', data: null };
    }
    return { code: 200, msg: 'success', data: route };
  }

  @Delete('routes/:id')
  deleteRoute(@Param('id') id: string) {
    console.log(`[Gateway] DELETE /api/gateway/routes/${id}`);
    const deleted = this.gatewayService.deleteRoute(id);
    if (!deleted) {
      return { code: 404, msg: 'Route not found', data: null };
    }
    return { code: 200, msg: 'success', data: null };
  }

  // ========== Logs ==========

  @Get('logs')
  getLogs(@Query('limit') limit?: string) {
    console.log('[Gateway] GET /api/gateway/logs');
    const logs = this.gatewayService.getLogs(limit ? parseInt(limit) : 100);
    return { code: 200, msg: 'success', data: logs };
  }

  @Delete('logs')
  clearLogs() {
    console.log('[Gateway] DELETE /api/gateway/logs');
    this.gatewayService.clearLogs();
    return { code: 200, msg: 'success', data: null };
  }

  // ========== Proxy Endpoint ==========
  // This is the main proxy that CLI tools connect to.
  // It intercepts requests, resolves routes, converts protocols, and forwards.

  @Post('proxy/*')
  async proxyRequest(@Req() req: Request, @Res() res: Response) {
    const startTime = Date.now();
    // Extract the original endpoint path (everything after /api/gateway/proxy/)
    const originalPath = req.params[0] || '';
    const originalEndpoint = `/${originalPath}`;

    // Determine which CLI tool is making the request based on endpoint pattern
    const cliTool = this.detectCliTool(originalEndpoint, req.body);

    console.log(`[Gateway Proxy] ${req.method} ${originalEndpoint} (detected: ${cliTool})`);

    // Resolve route
    const route = this.gatewayService.resolveRoute(cliTool);

    if (!route) {
      const errorMsg = `No active route found for CLI tool: ${cliTool}. Please configure a route in the gateway settings.`;
      console.error(`[Gateway Proxy] ${errorMsg}`);
      store.addLog({
        direction: 'inbound',
        cliTool,
        provider: 'none',
        model: req.body?.model || 'unknown',
        endpoint: originalEndpoint,
        statusCode: 404,
        duration: Date.now() - startTime,
        error: errorMsg,
      });
      return res.status(HttpStatus.NOT_FOUND).json({
        error: { message: errorMsg, type: 'route_not_found' },
      });
    }

    const { provider, model } = route;
    const targetFormat = store.getTargetFormat(provider.type, originalEndpoint);
    const upstreamUrl = store.buildUpstreamUrl(provider.baseUrl, targetFormat, originalEndpoint);

    console.log(`[Gateway Proxy] Route: ${cliTool} -> ${provider.name} (${model}) | Format: ${targetFormat} | URL: ${upstreamUrl}`);

    // Convert request body based on protocol
    let upstreamBody: any;
    let authHeader: string;

    if (targetFormat === 'anthropic') {
      upstreamBody = store.chatToAnthropic(
        originalEndpoint.includes('/responses')
          ? store.responsesToChatCompletions(req.body)
          : req.body,
        model,
      );
      authHeader = `x-api-key: ${provider.apiKey}`;
    } else {
      // openai_chat format
      if (originalEndpoint.includes('/responses')) {
        // Convert Responses API to Chat Completions
        upstreamBody = store.responsesToChatCompletions(req.body);
        console.log('[Gateway Proxy] Converted Responses -> Chat Completions');
      } else {
        upstreamBody = req.body;
      }
      upstreamBody.model = model;
      authHeader = `Bearer ${provider.apiKey}`;
    }

    const isStream = upstreamBody.stream === true;
    const responseId = `resp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (targetFormat === 'anthropic') {
        headers['x-api-key'] = provider.apiKey;
        headers['anthropic-version'] = '2023-06-01';
      } else {
        headers['Authorization'] = `Bearer ${provider.apiKey}`;
      }

      console.log(`[Gateway Proxy] Forwarding via curl to: ${upstreamUrl} | Stream: ${isStream}`);

      if (isStream) {
        // Use curl subprocess for streaming (bypasses Cloudflare TLS fingerprint)
        const curlProc = curlStream(upstreamUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(upstreamBody),
          timeout: 120,
        });

        // Handle SSE streaming
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');

        const needConvert = originalEndpoint.includes('/responses');

        // Accumulate content for building complete response.completed
        const collectedContent = { text: '', toolCalls: [] as any[] };
        let hasCompleted = false;

        if (needConvert) {
          res.write(`data: ${JSON.stringify({
            type: 'response.created',
            response: {
              id: responseId,
              object: 'response',
              status: 'in_progress',
              created_at: Math.floor(Date.now() / 1000),
              model,
              output: [],
            },
          })}\n\n`);
        }

        let buffer = '';

        curlProc.stdout!.on('data', (chunk: Buffer) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (data === '[DONE]') {
              // Only send response.completed if we haven't already
              // (it's normally sent when finish_reason='stop' in the chunk)
              if (needConvert && !hasCompleted) {
                res.write(`data: ${JSON.stringify({
                  type: 'response.completed',
                  response: {
                    id: responseId,
                    object: 'response',
                    status: 'completed',
                    created_at: Math.floor(Date.now() / 1000),
                    model,
                    output: collectedContent.text ? [{
                      type: 'message',
                      id: `msg_${Date.now()}`,
                      role: 'assistant',
                      content: [{ type: 'output_text', text: collectedContent.text }],
                    }] : [],
                  },
                })}\n\n`);
              }
              res.write('data: [DONE]\n\n');
              continue;
            }

            try {
              const parsed = JSON.parse(data);

              if (needConvert) {
                const convertedEvent = targetFormat === 'anthropic'
                  ? store.anthropicChunkToResponsesEvent(parsed, responseId)
                  : chatChunkToResponsesEvent(parsed, responseId, collectedContent);

                if (convertedEvent) {
                  if (convertedEvent.type === 'response.completed') {
                    hasCompleted = true;
                  }
                  res.write(`data: ${JSON.stringify(convertedEvent)}\n\n`);
                }
              } else {
                res.write(`data: ${JSON.stringify(parsed)}\n\n`);
              }
            } catch {
              // Skip unparseable chunks
            }
          }
        });

        curlProc.stderr!.on('data', (chunk: Buffer) => {
          const msg = chunk.toString().trim();
          if (msg) {
            console.log(`[Gateway Proxy] curl stderr: ${msg}`);
          }
        });

        curlProc.on('close', (code: number) => {
          store.addLog({
            direction: 'outbound',
            cliTool,
            provider: provider.name,
            model,
            endpoint: originalEndpoint,
            statusCode: code === 0 ? 200 : 502,
            duration: Date.now() - startTime,
          });
          res.end();
        });

        curlProc.on('error', (err: Error) => {
          console.error('[Gateway Proxy] curl process error:', err);
          store.addLog({
            direction: 'outbound',
            cliTool,
            provider: provider.name,
            model,
            endpoint: originalEndpoint,
            statusCode: 500,
            duration: Date.now() - startTime,
            error: err.message,
          });
          res.end();
        });

        // Handle client disconnect
        req.on('close', () => {
          if (!curlProc.killed) {
            curlProc.kill();
          }
        });

      } else {
        // Non-streaming: use curlRequest
        const response = await curlRequest(upstreamUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(upstreamBody),
          timeout: 60000,
        });

        if (response.statusCode >= 400) {
          console.error(`[Gateway Proxy] Upstream error: HTTP ${response.statusCode} - ${response.body.substring(0, 200)}`);

          store.addLog({
            direction: 'outbound',
            cliTool,
            provider: provider.name,
            model,
            endpoint: originalEndpoint,
            statusCode: response.statusCode,
            duration: Date.now() - startTime,
            error: response.body.slice(0, 500),
          });

          if (originalEndpoint.includes('/responses')) {
            return res.status(response.statusCode).json({
              error: {
                message: `Upstream error from ${provider.name}: ${response.body.slice(0, 200)}`,
                type: 'upstream_error',
                code: response.statusCode,
                param: '',
                provider: provider.name,
                model,
                endpoint: originalEndpoint,
                upstream_status: response.statusCode,
              },
            });
          }
          return res.status(response.statusCode).type('application/json').send(response.body);
        }

        store.incrementRequests();

        if (originalEndpoint.includes('/responses')) {
          // Convert Chat Completions response to Responses API format
          try {
            const chatResponse = JSON.parse(response.body);
            const convertedResponse = targetFormat === 'anthropic'
              ? store.anthropicResponseToResponses(chatResponse)
              : store.chatResponseToResponses(chatResponse);
            store.addLog({
              direction: 'outbound',
              cliTool,
              provider: provider.name,
              model,
              endpoint: originalEndpoint,
              statusCode: 200,
              duration: Date.now() - startTime,
            });
            return res.status(HttpStatus.OK).json(convertedResponse);
          } catch {
            return res.type('application/json').send(response.body);
          }
        }

        store.addLog({
          direction: 'outbound',
          cliTool,
          provider: provider.name,
          model,
          endpoint: originalEndpoint,
          statusCode: 200,
          duration: Date.now() - startTime,
        });

        return res.type('application/json').send(response.body);
      }
    } catch (err: any) {
      console.error('[Gateway Proxy] Error:', err.message);
      store.addLog({
        direction: 'outbound',
        cliTool,
        provider: provider.name,
        model,
        endpoint: originalEndpoint,
        statusCode: 500,
        duration: Date.now() - startTime,
        error: err.message,
      });
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: { message: `Gateway proxy error: ${err.message}`, type: 'proxy_error' },
      });
    }
  }

  // ========== Non-POST proxy (GET models, etc.) ==========

  @Get('proxy/*')
  async proxyGetRequest(@Req() req: Request, @Res() res: Response) {
    const originalPath = req.params[0] || '';
    const cliTool = this.detectCliTool(`/${originalPath}`, {});
    const route = this.gatewayService.resolveRoute(cliTool);

    if (!route) {
      return res.status(HttpStatus.NOT_FOUND).json({
        error: { message: `No active route for: ${cliTool}`, type: 'route_not_found' },
      });
    }

    const { provider } = route;
    const upstreamUrl = `${provider.baseUrl.replace(/\/+$/, '')}/${originalPath}`;

    console.log(`[Gateway Proxy GET] ${upstreamUrl}`);

    try {
      const headers: Record<string, string> = {};
      if (provider.type === 'anthropic') {
        headers['x-api-key'] = provider.apiKey;
        headers['anthropic-version'] = '2023-06-01';
      } else {
        headers['Authorization'] = `Bearer ${provider.apiKey}`;
      }

      const response = await curlRequest(upstreamUrl, { headers, timeout: 30000 });

      return res
        .status(response.statusCode || 200)
        .type('application/json')
        .send(response.body);
    } catch (err: any) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: { message: err.message, type: 'proxy_error' },
      });
    }
  }

  // ========== CLI Config Export ==========
  // Returns the configuration that should be set in CLI tools

  @Get('config/:cliTool')
  getCliConfig(@Param('cliTool') cliTool: string) {
    console.log(`[Gateway] GET /api/gateway/config/${cliTool}`);
    const route = this.gatewayService.resolveRoute(cliTool);
    if (!route) {
      return {
        code: 404,
        msg: `No active route for ${cliTool}`,
        data: null,
      };
    }

    const { provider, model } = route;
    const proxyBaseUrl = `http://localhost:3000/api/gateway/proxy`;

    const configs: Record<string, any> = {
      'claude-code': {
        description: 'Claude Code configuration',
        envVars: {
          ANTHROPIC_BASE_URL: `${proxyBaseUrl}`,
          ANTHROPIC_API_KEY: 'gateway-proxy-key',
        },
        configFile: `# ~/.claude/settings.json
{
  "apiBaseUrl": "${proxyBaseUrl}",
  "apiKey": "gateway-proxy-key"
}`,
        note: 'Set environment variables or update Claude Code settings file',
      },
      'codex': {
        description: 'Codex configuration',
        configFile: `# ~/.codex/config.toml
base_url = "${proxyBaseUrl}"
wire_api = "responses"`,
        note: 'Codex uses Responses API format. The gateway will auto-convert to Chat Completions.',
      },
      'cursor': {
        description: 'Cursor configuration',
        envVars: {
          OPENAI_BASE_URL: `${proxyBaseUrl}`,
          OPENAI_API_KEY: 'gateway-proxy-key',
        },
        note: 'Set in Cursor Settings > Models > OpenAI API Base URL',
      },
    };

    const config = configs[cliTool] || {
      description: `${cliTool} configuration`,
      baseUrl: proxyBaseUrl,
      model,
      provider: provider.name,
    };

    return {
      code: 200,
      msg: 'success',
      data: {
        cliTool,
        provider: provider.name,
        model,
        proxyBaseUrl,
        ...config,
      },
    };
  }

  // ========== Export / Import Config ==========

  @Get('config')
  async exportConfig() {
    console.log('[Gateway] GET /api/gateway/config (export)');
    const providers = await this.gatewayService.getAllProviders();
    const routes = await this.gatewayService.getAllRoutes();
    return {
      code: 200,
      msg: 'success',
      data: { providers, routes, version: '1.0.0' },
    };
  }

  @Post('config')
  async importConfig(@Body() body: { providers?: any[]; routes?: any[] }) {
    console.log('[Gateway] POST /api/gateway/config (import)', JSON.stringify(body).slice(0, 200));
    try {
      if (body.providers) {
        await this.gatewayService.replaceAllProviders(body.providers);
      }
      if (body.routes) {
        await this.gatewayService.replaceAllRoutes(body.routes);
      }
      return { code: 200, msg: 'success', data: null };
    } catch (error) {
      return { code: 500, msg: error.message, data: null };
    }
  }

  // ========== Helper ==========

  private detectCliTool(endpoint: string, body: any): string {
    // Detect based on endpoint pattern and request body
    if (endpoint.includes('/responses')) {
      return 'codex'; // Codex uses Responses API
    }
    if (endpoint.includes('/v1/messages') || body?.model?.startsWith('claude')) {
      return 'claude-code'; // Claude Code uses Messages API
    }
    if (endpoint.includes('/chat/completions')) {
      return 'codex'; // Could be any OpenAI-compatible CLI
    }
    // Default: try to match by model name
    if (body?.model) {
      const routes = this.gatewayService.getRoutes();
      const matchedRoute = routes.find(r => r.enabled);
      if (matchedRoute) return matchedRoute.cliTool;
    }
    return 'codex'; // Default fallback
  }
}
