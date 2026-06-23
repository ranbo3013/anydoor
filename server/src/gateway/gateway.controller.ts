import { Controller, Get, Post, Put, Delete, Body, Param, Query, Req, Res, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { GatewayService } from './gateway.service';
import { Provider, RouteConfig, ProxyLog, ApiFormat } from './gateway.types';
import * as store from './gateway.store';
import { curlRequest, curlStream } from './curl-fetch';
import {
  processChatChunk,
  createStreamState,
  buildResponseCreated,
  buildResponseInProgress,
  formatSseEvent,
  resetSeq,
} from './chat-to-responses';

@Controller('gateway')
export class GatewayController {
  constructor(private readonly gatewayService: GatewayService) {}

  // ========== Provider CRUD ==========

  @Get('providers')
  async getProviders() {
    console.log('[Gateway] GET /api/gateway/providers');
    const providers = await this.gatewayService.getAllProviders();
    return { code: 200, msg: 'success', data: providers };
  }

  @Get('providers/:id')
  getProvider(@Param('id') id: string) {
    console.log(`[Gateway] GET /api/gateway/providers/${id}`);
    const provider = this.gatewayService.getProvider(id);
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
    const result = await this.gatewayService.testProviderConnection(body.baseUrl, body.apiKey || '', (body.type || 'openai_chat') as ApiFormat);
    return { code: 200, msg: 'success', data: result };
  }

  // ========== Route CRUD ==========

  @Get('routes')
  getRoutes() {
    console.log('[Gateway] GET /api/gateway/routes');
    const routes = this.gatewayService.getAllRoutes();
    // Enrich routes with provider info
    const enriched = routes.map(r => {
      const provider = this.gatewayService.getProvider(r.providerId);
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

  // ========== Health Check ==========

  @Get('health')
  async healthCheck() {
    const providers = await this.gatewayService.getAllProviders();
    const routes = this.gatewayService.getAllRoutes();
    const uptime = process.uptime();
    return {
      code: 200,
      msg: 'success',
      data: {
        status: 'ok',
        uptime: Math.floor(uptime),
        providerCount: providers.length,
        routeCount: routes.length,
        activeRoutes: routes.filter(r => r.enabled).length,
        version: '1.0.0',
      },
    };
  }

  // ========== Provider Health Status ==========

  @Get('providers-health')
  async getProvidersHealth() {
    const providers = await this.gatewayService.getAllProviders();
    const healthResults = await Promise.all(
      providers.map(async (p) => {
        try {
          const result = await this.gatewayService.testProviderConnection(p.baseUrl, p.apiKey, p.type);
          return {
            id: p.id,
            name: p.name,
            healthy: result.success,
            latency: result.latency,
            lastChecked: Date.now(),
          };
        } catch {
          return {
            id: p.id,
            name: p.name,
            healthy: false,
            latency: -1,
            lastChecked: Date.now(),
          };
        }
      })
    );
    return { code: 200, msg: 'success', data: healthResults };
  }

  // ========== Proxy Auth Token ==========

  @Get('proxy-token')
  getProxyToken() {
    const token = store.getProxyToken();
    return { code: 200, msg: 'success', data: { token, enabled: store.isProxyAuthEnabled() } };
  }

  @Post('proxy-token')
  setProxyToken(@Body() body: { token?: string; enabled?: boolean }) {
    if (body.token !== undefined) {
      store.setProxyToken(body.token);
    }
    if (body.enabled !== undefined) {
      store.setProxyAuthEnabled(body.enabled);
    }
    return { code: 200, msg: 'success', data: null };
  }

  // ========== Proxy Endpoint ==========
  // This is the main proxy that CLI tools connect to.
  // It intercepts requests, resolves routes, converts protocols, and forwards.

  @Post('proxy/*')
  async proxyRequest(@Req() req: Request, @Res() res: Response) {
    const startTime = Date.now();
    const ts = () => `[+${Date.now() - startTime}ms]`;

    // Verify proxy auth token if enabled
    if (store.isProxyAuthEnabled()) {
      const authHeader = req.headers['authorization'] as string;
      const expectedToken = store.getProxyToken();
      const providedToken = authHeader?.replace('Bearer ', '') || authHeader?.replace('bearer ', '');
      if (providedToken !== expectedToken) {
        return res.status(HttpStatus.UNAUTHORIZED).json({
          error: { message: 'Invalid proxy token', type: 'auth_error' },
        });
      }
    }

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

    const { provider, route: routeConfig } = route;
    const model = routeConfig.model;
    const targetFormat = store.getTargetFormat(provider.type, originalEndpoint);
    const upstreamUrl = store.buildUpstreamUrl(provider.baseUrl, targetFormat, originalEndpoint);

    console.log(`[Gateway Proxy] ${ts()} Route: ${cliTool} -> ${provider.name} (${model}) | Format: ${targetFormat} | URL: ${upstreamUrl}`);

    // Convert request body based on protocol
    let upstreamBody: any;

    if (targetFormat === 'anthropic') {
      upstreamBody = store.chatToAnthropic(
        originalEndpoint.includes('/responses')
          ? store.responsesToChatCompletions(req.body)
          : req.body,
        model,
      );
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
    }

    const isStream = upstreamBody.stream === true;
    const responseId = `resp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    console.log(`[Gateway Proxy] ${ts()} Body size: ${JSON.stringify(upstreamBody).length} bytes | Stream: ${isStream}`);

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

      console.log(`[Gateway Proxy] ${ts()} Forwarding via curl to: ${upstreamUrl} | Stream: ${isStream}`);

      // Helper to write SSE event and flush immediately
      const writeSse = (data: string) => {
        res.write(data);
        if (typeof (res as any).flush === 'function') {
          (res as any).flush();
        }
      };

      if (isStream) {
        // Use curl subprocess for streaming (bypasses Cloudflare TLS fingerprint)
        const curlProc = curlStream(upstreamUrl, {}, {
          method: 'POST',
          headers,
          body: JSON.stringify(upstreamBody),
          timeout: 120,
        });
        console.log(`[Gateway Proxy] ${ts()} curl subprocess started`);

        // Handle SSE streaming
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');

        const needConvert = originalEndpoint.includes('/responses');

        // State for tracking conversion progress
        const streamState = createStreamState();
        let hasCompleted = false;

        if (needConvert) {
          resetSeq();
          // Send response.created
          writeSse(formatSseEvent(buildResponseCreated(responseId, model)));
          // Send response.in_progress
          writeSse(formatSseEvent(buildResponseInProgress(responseId, model)));
        }

        // Improved SSE buffer: handle cross-chunk data: lines
        let sseBuffer = '';
        let firstChunk = true;

        curlProc.stdout!.on('data', (chunk: Buffer) => {
          if (firstChunk) {
            console.log(`[Gateway Proxy] ${ts()} FIRST chunk from upstream (${chunk.length} bytes)`);
            firstChunk = false;
          }
          sseBuffer += chunk.toString();

          // Process complete SSE events (delimited by double newline)
          while (true) {
            const eventEnd = sseBuffer.indexOf('\n\n');
            if (eventEnd === -1) break; // No complete event yet

            const eventBlock = sseBuffer.substring(0, eventEnd);
            sseBuffer = sseBuffer.substring(eventEnd + 2);

            // Parse each line in the event block
            let eventData = '';
            for (const line of eventBlock.split('\n')) {
              const trimmed = line.trim();
              if (trimmed.startsWith('data: ')) {
                eventData = trimmed.slice(6).trim();
              }
            }

            if (!eventData) continue;

            if (eventData === '[DONE]') {
              console.log(`[Gateway Proxy] ${ts()} Received [DONE] from upstream, hasCompleted=${hasCompleted}`);
              if (needConvert && !hasCompleted) {
                const syntheticStop = { choices: [{ finish_reason: 'stop', delta: {} }], usage: null };
                const fallbackEvents = processChatChunk(syntheticStop, responseId, model, streamState);
                console.log(`[Gateway Proxy] ${ts()} [DONE] FALLBACK events: ${fallbackEvents.map(e => e.eventType).join(',')}`);
                for (const event of fallbackEvents) {
                  if (event.eventType === 'response.completed') hasCompleted = true;
                  writeSse(formatSseEvent(event));
                }
              }
              // Only forward [DONE] for non-converted streams (Chat Completions passthrough)
              // Codex Responses API does not expect [DONE]
              if (!needConvert) {
                writeSse('data: [DONE]\n\n');
              }
              continue;
            }

            try {
              const parsed = JSON.parse(eventData);

              if (needConvert) {
                if (targetFormat === 'anthropic') {
                  const convertedEvent = store.anthropicChunkToResponsesEvent(parsed, responseId);
                  if (convertedEvent) {
                    writeSse(formatSseEvent(convertedEvent));
                  }
                } else {
                  const events = processChatChunk(parsed, responseId, model, streamState);
                  for (const event of events) {
                    if (event.eventType === 'response.completed') {
                      hasCompleted = true;
                      console.log(`[Gateway Proxy] ${ts()} SENDING response.completed, output items: ${event.data?.response?.output?.length}, content len: ${event.data?.response?.output?.[0]?.content?.[0]?.text?.length || 0}`);
                    }
                    console.log(`[Gateway Proxy] ${ts()} -> event: ${event.eventType}`);
                    writeSse(formatSseEvent(event));
                  }
                }
              } else {
                writeSse(`data: ${JSON.stringify(parsed)}\n\n`);
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
          console.log(`[Gateway Proxy] ${ts()} curl process closed (code: ${code}), buffer remaining: ${sseBuffer.length} bytes, hasCompleted: ${hasCompleted}`);
          // Process any remaining buffer data
          if (sseBuffer.trim()) {
            const remaining = sseBuffer.trim();
            if (remaining.startsWith('data: ')) {
              const data = remaining.slice(6).trim();
              if (data === '[DONE]') {
                if (needConvert && !hasCompleted) {
                  const syntheticStop = { choices: [{ finish_reason: 'stop', delta: {} }], usage: null };
                  const fallbackEvents = processChatChunk(syntheticStop, responseId, model, streamState);
                  for (const event of fallbackEvents) {
                    if (event.eventType === 'response.completed') hasCompleted = true;
                    writeSse(formatSseEvent(event));
                  }
                }
                // Only forward [DONE] for non-converted streams (Chat Completions passthrough)
                if (!needConvert) {
                  writeSse('data: [DONE]\n\n');
                }
              } else {
                try {
                  const parsed = JSON.parse(data);
                  if (needConvert && targetFormat !== 'anthropic') {
                    const events = processChatChunk(parsed, responseId, model, streamState);
                    for (const event of events) {
                      if (event.eventType === 'response.completed') hasCompleted = true;
                      writeSse(formatSseEvent(event));
                    }
                  }
                } catch { /* skip */ }
              }
            }
          }
          // Ensure response.completed is sent even if stream ended abruptly
          if (needConvert && !hasCompleted) {
            const contentStr = typeof streamState.collectedContent === 'string' ? streamState.collectedContent.substring(0, 100) : JSON.stringify(streamState.collectedContent)?.substring(0, 100);
            console.log(`[Gateway Proxy] ${ts()} SENDING FALLBACK response.completed, collectedContent: "${contentStr}"`);
            const syntheticStop = { choices: [{ finish_reason: 'stop', delta: {} }], usage: null };
            const fallbackEvents = processChatChunk(syntheticStop, responseId, model, streamState);
            for (const event of fallbackEvents) {
              console.log(`[Gateway Proxy] ${ts()} FALLBACK event: ${event.eventType}`);
              writeSse(formatSseEvent(event));
            }
          }
          console.log(`[Gateway Proxy] ${ts()} Stream completed`);
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
        // Non-streaming: use curlRequest with retry
        console.log(`[Gateway Proxy] ${ts()} Non-streaming request via curl`);
        const response = await curlRequest(upstreamUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(upstreamBody),
          timeout: 60000,
          maxRetries: 2,
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
    // Verify proxy auth token if enabled
    if (store.isProxyAuthEnabled()) {
      const authHeader = req.headers['authorization'] as string;
      const expectedToken = store.getProxyToken();
      const providedToken = authHeader?.replace('Bearer ', '') || authHeader?.replace('bearer ', '');
      if (providedToken !== expectedToken) {
        return res.status(HttpStatus.UNAUTHORIZED).json({
          error: { message: 'Invalid proxy token', type: 'auth_error' },
        });
      }
    }

    const originalPath = req.params[0] || '';
    const cliTool = this.detectCliTool(`/${originalPath}`, {});
    const route = this.gatewayService.resolveRoute(cliTool);

    if (!route) {
      return res.status(HttpStatus.NOT_FOUND).json({
        error: { message: `No active route for: ${cliTool}`, type: 'route_not_found' },
      });
    }

    const { provider } = route;

    // Use cached models if available
    if (originalPath.endsWith('/models') || originalPath === 'models') {
      const cached = store.getCachedModels(provider.id);
      if (cached) {
        return res.status(200).type('application/json').send(JSON.stringify({ object: 'list', data: cached.map(id => ({ id, object: 'model' })) }));
      }
    }

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

      const response = await curlRequest(upstreamUrl, { headers, timeout: 30000, maxRetries: 1 });

      // Cache models response
      if (originalPath.endsWith('/models') || originalPath === 'models') {
        try {
          const modelsData = JSON.parse(response.body);
          store.setCachedModels(provider.id, provider.id, modelsData.data?.map((m: any) => m.id) || []);
        } catch { /* skip caching */ }
      }

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

    const { provider, route: routeConfig } = route;
    const model = routeConfig.model;
    const proxyBaseUrl = `http://localhost:3000/api/gateway/proxy`;
    const proxyToken = store.getProxyToken();
    const authEnabled = store.isProxyAuthEnabled();

    const configs: Record<string, any> = {
      'claude-code': {
        description: 'Claude Code configuration',
        envVars: {
          ANTHROPIC_BASE_URL: `${proxyBaseUrl}`,
          ANTHROPIC_API_KEY: authEnabled ? proxyToken : 'gateway-proxy-key',
        },
        configFile: `# ~/.claude/settings.json
{
  "apiBaseUrl": "${proxyBaseUrl}",
  "apiKey": "${authEnabled ? proxyToken : 'gateway-proxy-key'}"
}`,
        note: 'Set environment variables or update Claude Code settings file',
      },
      'codex': {
        description: 'Codex configuration',
        configFile: `# ~/.codex/config.toml
model = "${model}"
model_provider = "custom"

[model_providers.custom]
name = "custom"
wire_api = "responses"
requires_openai_auth = true
base_url = "${proxyBaseUrl}/v1"`,
        envVars: authEnabled ? { OPENAI_API_KEY: proxyToken } : { OPENAI_API_KEY: 'anydoor-proxy' },
        note: 'Codex uses Responses API format. The gateway will auto-convert to Chat Completions.',
      },
      'cursor': {
        description: 'Cursor configuration',
        envVars: {
          OPENAI_BASE_URL: `${proxyBaseUrl}`,
          OPENAI_API_KEY: authEnabled ? proxyToken : 'gateway-proxy-key',
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
      const routes = this.gatewayService.getAllRoutes();
      const matchedRoute = routes.find(r => r.enabled);
      if (matchedRoute) return matchedRoute.cliTool;
    }
    return 'codex'; // Default fallback
  }
}
