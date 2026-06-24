import { Controller, Get, Post, Put, Delete, Body, Param, Query, Req, Res, HttpStatus } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
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

  @Get('logs/storage')
  getLogStorageInfo() {
    console.log('[Gateway] GET /api/gateway/logs/storage');
    const info = store.getLogStorageInfo();
    return { code: 200, msg: 'success', data: info };
  }

  @Delete('logs/all')
  clearAllLogs() {
    console.log('[Gateway] DELETE /api/gateway/logs/all');
    store.clearAllLogs();
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

  @Get('stats/usage')
  getUsageStats(@Query() query: { provider?: string; model?: string; startDate?: string; endDate?: string }) {
    const stats = store.getUsageStats({
      provider: query.provider,
      model: query.model,
      startDate: query.startDate,
      endDate: query.endDate,
    });
    return { code: 200, msg: 'success', data: stats };
  }

  @Get('stats/providers')
  getDistinctProviders() {
    return { code: 200, msg: 'success', data: store.getDistinctProviders() };
  }

  @Get('stats/models')
  getDistinctModels() {
    return { code: 200, msg: 'success', data: store.getDistinctModels() };
  }

  @Post('test-agnes-debug')
  async testAgnesDebug(@Body() body: { providerId?: string; providerName?: string }) {
    // Progressive diagnostic: read the last debug request body and test it
    // with fields progressively removed to find which one triggers Agnes's bug
    const providers = store.getProviders();
    let provider = body.providerId
      ? providers.find(p => p.id === body.providerId)
      : providers.find(p => p.name === body.providerName);

    if (!provider) {
      return {
        code: 404,
        msg: 'Provider not found',
        availableProviders: providers.map(p => ({ id: p.id, name: p.name, type: p.type })),
      };
    }

    const baseUrl = provider.baseUrl.replace(/\/+$/, '');
    const decrypted = store.decryptProvider(provider);
    const endpoint = `${baseUrl}/v1/chat/completions`;
    const debugBodyPath = path.join(os.tmpdir(), 'anydoor-debug-request.json');

    if (!fs.existsSync(debugBodyPath)) {
      return { code: 404, msg: 'No debug request file found. Trigger a Codex request first.' };
    }

    const rawBody = fs.readFileSync(debugBodyPath, 'utf-8');
    let originalBody: any;
    try {
      originalBody = JSON.parse(rawBody);
    } catch (e: any) {
      return { code: 400, msg: `Debug file is not valid JSON: ${e.message}` };
    }

    const results: Array<{ label: string; statusCode: number; body: string; error?: string }> = [];

    // Helper to test a variant
    const testVariant = async (label: string, reqBody: any) => {
      try {
        const bodyStr = JSON.stringify(reqBody);
        console.log(`[test-agnes-debug] Testing "${label}" (${bodyStr.length} chars)`);
        const result = await curlRequest(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${decrypted.apiKey}`,
          },
          body: bodyStr,
          timeout: 60000,
        });
        const success = result.statusCode === 200;
        results.push({
          label,
          statusCode: result.statusCode,
          body: result.body.substring(0, 500),
          error: success ? undefined : `HTTP ${result.statusCode}`,
        });
        console.log(`[test-agnes-debug] "${label}": ${result.statusCode} ${success ? '✅' : '❌'}`);
        return success;
      } catch (err: any) {
        results.push({ label, statusCode: 0, body: '', error: err.message });
        console.log(`[test-agnes-debug] "${label}": ERROR ${err.message}`);
        return false;
      }
    };

    // Variant 1: Full original request (as-is from debug file)
    await testVariant('full-original', originalBody);

    // Variant 2: Strip presence_penalty, frequency_penalty
    const noPenalties = { ...originalBody };
    delete noPenalties.presence_penalty;
    delete noPenalties.frequency_penalty;
    await testVariant('no-penalties', noPenalties);

    // Variant 3: Strip tools array BUT keep tool messages in conversation
    const noToolsArrayOnly = { ...originalBody };
    delete noToolsArrayOnly.tools;
    delete noToolsArrayOnly.presence_penalty;
    delete noToolsArrayOnly.frequency_penalty;
    delete noToolsArrayOnly.stop;
    await testVariant('no-tools-array-only', noToolsArrayOnly);

    // Variant 4: Keep tools array BUT strip tool_calls/tool messages from conversation
    const noToolMessages = { ...originalBody };
    delete noToolMessages.presence_penalty;
    delete noToolMessages.frequency_penalty;
    delete noToolMessages.stop;
    if (Array.isArray(noToolMessages.messages)) {
      noToolMessages.messages = noToolMessages.messages.filter((m: any) => {
        if (m.role === 'assistant' && m.tool_calls) return false;
        if (m.role === 'tool') return false;
        return true;
      });
    }
    await testVariant('tools-array-no-tool-msgs', noToolMessages);

    // Variant 5: Strip both tools array AND tool messages
    const noToolsAtAll = { ...originalBody };
    delete noToolsAtAll.tools;
    delete noToolsAtAll.presence_penalty;
    delete noToolsAtAll.frequency_penalty;
    delete noToolsAtAll.stop;
    if (Array.isArray(noToolsAtAll.messages)) {
      noToolsAtAll.messages = noToolsAtAll.messages.filter((m: any) => {
        if (m.role === 'assistant' && m.tool_calls) return false;
        if (m.role === 'tool') return false;
        return true;
      });
    }
    await testVariant('no-tools-at-all', noToolsAtAll);

    // Variant 6: model + last N messages (binary search for bad message)
    const msgs = Array.isArray(originalBody.messages) ? originalBody.messages : [];
    const halfIdx = Math.floor(msgs.length / 2);

    // First half of messages
    const firstHalf: any = {
      model: originalBody.model,
      messages: msgs.slice(0, halfIdx),
      stream: false,
    };
    await testVariant(`first-half-msgs (${msgs.slice(0, halfIdx).length})`, firstHalf);

    // Second half of messages
    const secondHalf: any = {
      model: originalBody.model,
      messages: msgs.slice(halfIdx),
      stream: false,
    };
    await testVariant(`second-half-msgs (${msgs.slice(halfIdx).length})`, secondHalf);

    // Variant 7: Replace all tool message content with short placeholder
    const toolContentScrubbed = { ...originalBody };
    delete toolContentScrubbed.presence_penalty;
    delete toolContentScrubbed.frequency_penalty;
    delete toolContentScrubbed.stop;
    if (Array.isArray(toolContentScrubbed.messages)) {
      toolContentScrubbed.messages = toolContentScrubbed.messages.map((m: any) => {
        if (m.role === 'tool') {
          return { ...m, content: '[tool result placeholder]' };
        }
        if (m.role === 'assistant' && m.tool_calls) {
          return {
            ...m,
            tool_calls: m.tool_calls.map((tc: any) => ({
              ...tc,
              function: { ...tc.function, arguments: '{}' },
            })),
          };
        }
        return m;
      });
    }
    await testVariant('tool-content-scrubbed', toolContentScrubbed);

    // Variant 8: Keep everything but limit each message's content length
    const truncatedContent = { ...originalBody };
    delete truncatedContent.presence_penalty;
    delete truncatedContent.frequency_penalty;
    delete truncatedContent.stop;
    const MAX_CONTENT = 500;
    if (Array.isArray(truncatedContent.messages)) {
      truncatedContent.messages = truncatedContent.messages.map((m: any) => {
        const msg = { ...m };
        if (typeof msg.content === 'string' && msg.content.length > MAX_CONTENT) {
          msg.content = msg.content.substring(0, MAX_CONTENT) + '...[truncated]';
        }
        if (msg.tool_calls) {
          msg.tool_calls = msg.tool_calls.map((tc: any) => ({
            ...tc,
            function: {
              ...tc.function,
              arguments: typeof tc.function?.arguments === 'string' && tc.function.arguments.length > MAX_CONTENT
                ? tc.function.arguments.substring(0, MAX_CONTENT) + '...[truncated]'
                : tc.function?.arguments,
            },
          }));
        }
        return msg;
      });
    }
    await testVariant('truncated-content', truncatedContent);

    // Find which variants succeeded
    const successLabels = results.filter(r => r.statusCode === 200).map(r => r.label);
    const failLabels = results.filter(r => r.statusCode !== 200).map(r => r.label);

    return {
      code: 200,
      msg: 'success',
      data: {
        debugFileSize: rawBody.length,
        debugFileMessages: Array.isArray(originalBody.messages) ? originalBody.messages.length : 0,
        debugFileHasTools: !!originalBody.tools,
        debugFileToolsCount: originalBody.tools?.length || 0,
        debugFileHasPenalties: originalBody.presence_penalty !== undefined || originalBody.frequency_penalty !== undefined,
        successVariants: successLabels,
        failVariants: failLabels,
        results,
      },
    };
  }

  @Post('test-agnes')
  async testAgnes(@Body() body: { providerId?: string; providerName?: string; format: 'openai_chat' | 'openai_responses' }) {
    const providers = store.getProviders();
    let provider = body.providerId 
      ? providers.find(p => p.id === body.providerId)
      : providers.find(p => p.name === body.providerName);

    if (!provider) {
      return { 
        code: 404, 
        msg: 'Provider not found', 
        availableProviders: providers.map(p => ({ id: p.id, name: p.name, type: p.type })) 
      };
    }

    const format = body.format || provider.type || 'openai_chat';
    const baseUrl = provider.baseUrl.replace(/\/+$/, '');
    const decrypted = store.decryptProvider(provider);

    let testBody: any;
    let endpoint: string;
    if (format === 'openai_responses') {
      endpoint = `${baseUrl}/v1/responses`;
      testBody = {
        model: provider.models?.[0] || 'agnes-2.0-flash',
        input: 'Say hello',
        stream: false,
      };
    } else {
      endpoint = `${baseUrl}/v1/chat/completions`;
      testBody = {
        model: provider.models?.[0] || 'agnes-2.0-flash',
        messages: [{ role: 'user', content: 'Say hello' }],
        stream: false,
      };
    }

    console.log(`[testAgnes] Testing ${format} format -> ${endpoint}`);
    console.log(`[testAgnes] Body: ${JSON.stringify(testBody)}`);

    try {
      const result = await curlRequest(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${decrypted.apiKey}`,
        },
        body: JSON.stringify(testBody),
        timeout: 30000,
      });

      console.log(`[testAgnes] Response status: ${result.statusCode}`);
      console.log(`[testAgnes] Response body (first 500): ${result.body.substring(0, 500)}`);

      return {
        code: 200,
        msg: 'success',
        data: {
          format,
          endpoint,
          statusCode: result.statusCode,
          body: result.body.substring(0, 2000),
        },
      };
    } catch (err: any) {
      console.error(`[testAgnes] Error: ${err.message}`);
      return { code: 500, msg: err.message };
    }
  }

  // Gateway Proxy: intercepts requests, resolves routes, converts protocols, and forwards.

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

    // Warn if Agnes is using openai_chat (should use openai_responses)
    if (targetFormat === 'openai_chat' && (provider.name?.toLowerCase().includes('agnes') || model.toLowerCase().includes('agnes'))) {
      console.log(`[Gateway Proxy] ${ts()} ⚠️  WARNING: Agnes provider is using 'openai_chat' format. Switching to 'openai_responses' format is recommended to avoid JSON parsing errors.`);
    }

    // Convert request body based on protocol
    let upstreamBody: any;

    if (targetFormat === 'anthropic') {
      upstreamBody = store.chatToAnthropic(
        originalEndpoint.includes('/responses')
          ? store.responsesToChatCompletions(req.body)
          : req.body,
        model,
      );
    } else if (targetFormat === 'openai_responses') {
      // Responses API passthrough - no conversion needed
      upstreamBody = { ...req.body, model };
      // Still sanitize control characters to prevent Agnes/vLLM parse errors
      upstreamBody = store.sanitizeRequestBody(upstreamBody);
      console.log('[Gateway Proxy] Responses API passthrough (sanitized control chars)');
    } else {
      // openai_chat format
      if (originalEndpoint.includes('/responses')) {
        // Convert Responses API to Chat Completions
        upstreamBody = store.responsesToChatCompletions(req.body);
        console.log('[Gateway Proxy] Converted Responses -> Chat Completions');
        // Log message structure for debugging tool_calls ordering
        console.log('[Gateway Proxy] Messages structure:', upstreamBody.messages?.map((m: any) => {
          if (m.role === 'assistant' && m.tool_calls) {
            return { role: m.role, tool_call_ids: m.tool_calls.map((tc: any) => tc.id) };
          }
          if (m.role === 'tool') {
            return { role: m.role, tool_call_id: m.tool_call_id };
          }
          return { role: m.role, content_length: typeof m.content === 'string' ? m.content.length : 'array' };
        }));
      } else {
        // Already Chat Completions format, just sanitize control chars
        upstreamBody = store.sanitizeRequestBody(req.body);
      }
      upstreamBody.model = model;
    }

    const isStream = upstreamBody.stream === true;
    const responseId = `resp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const bodyJsonStr = JSON.stringify(upstreamBody);

    // JSON round-trip validation: ensure our output is valid JSON
    try {
      const parsed = JSON.parse(bodyJsonStr);
      const reStringified = JSON.stringify(parsed);
      if (reStringified !== bodyJsonStr) {
        console.warn(`[Gateway Proxy] ${ts()} ⚠️ JSON round-trip mismatch! Original: ${bodyJsonStr.length} chars, Re-stringified: ${reStringified.length} chars`);
      }
    } catch (e: any) {
      console.error(`[Gateway Proxy] ${ts()} ❌ CRITICAL: Our output JSON is INVALID: ${e.message}`);
    }

    console.log(`[Gateway Proxy] ${ts()} === REQUEST DEBUG START ===`);
    console.log(`[Gateway Proxy] ${ts()} Target format: ${targetFormat}`);
    console.log(`[Gateway Proxy] ${ts()} Upstream URL: ${upstreamUrl}`);
    console.log(`[Gateway Proxy] ${ts()} Body size: ${bodyJsonStr.length} bytes | Stream: ${isStream}`);
    console.log(`[Gateway Proxy] ${ts()} Messages count: ${upstreamBody.messages?.length || 0} | Tools count: ${upstreamBody.tools?.length || 0}`);
    console.log(`[Gateway Proxy] ${ts()} Has presence_penalty: ${upstreamBody.presence_penalty !== undefined} | Has frequency_penalty: ${upstreamBody.frequency_penalty !== undefined}`);

    // DEBUG: Save request body to file for inspection
    const debugBodyPath = path.join(os.tmpdir(), 'anydoor-debug-request.json');
    fs.writeFileSync(debugBodyPath, bodyJsonStr, 'utf-8');
    console.log(`[Gateway Proxy] ${ts()} DEBUG body saved to: ${debugBodyPath}`);
    console.log(`[Gateway Proxy] ${ts()} === REQUEST DEBUG END ===`);

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
        const bodyStr = JSON.stringify(upstreamBody);
        console.log(`[Gateway Proxy] ${ts()} Sending streaming request (${bodyStr.length} chars)`);
        const curlProc = curlStream(upstreamUrl, {}, {
          method: 'POST',
          headers,
          body: bodyStr,
          timeout: 120000,
        });
        console.log(`[Gateway Proxy] ${ts()} curl subprocess started`);

        // Handle SSE streaming
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');

        const needConvert = originalEndpoint.includes('/responses') && targetFormat !== 'openai_responses';

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
            console.log(`[Gateway Proxy] ${ts()} FIRST chunk from upstream (${chunk.length} bytes): ${chunk.toString().substring(0, 200)}`);
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
            let eventType = '';
            for (const line of eventBlock.split('\n')) {
              const trimmed = line.trim();
              if (trimmed.startsWith('data:')) {
                eventData = trimmed.slice(5).trim();
              } else if (trimmed.startsWith('event:')) {
                eventType = trimmed.slice(6).trim();
              }
            }

            if (!eventData) continue;

            // For openai_responses passthrough, forward the raw SSE event block
            // preserving both event: and data: lines
            if (!needConvert) {
              if (eventType) {
                writeSse(`event: ${eventType}\ndata: ${eventData}\n\n`);
                if (eventType === 'response.completed') hasCompleted = true;
              } else {
                // No event: line, forward as data-only SSE
                writeSse(`data: ${eventData}\n\n`);
              }
              continue;
            }

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
              // Don't forward [DONE] to Codex - Responses API expects response.completed event
              continue;
            }

            try {
              const parsed = JSON.parse(eventData);
              const rawFinish = parsed.choices?.[0]?.finish_reason;
              if (rawFinish) {
                console.log(`[Gateway Proxy] ${ts()} RAW finish_reason="${rawFinish}" in chunk (hasCompleted=${hasCompleted})`);
              }
              const rawToolCalls = parsed.choices?.[0]?.delta?.tool_calls;
              if (rawToolCalls) {
                console.log(`[Gateway Proxy] ${ts()} RAW tool_calls in chunk: ${JSON.stringify(rawToolCalls).substring(0, 200)}`);
              }

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
                      console.log(`[Gateway Proxy] ${ts()} SENDING response.completed, output items: ${(event.data as any)?.response?.output?.length}, content len: ${(event.data as any)?.response?.output?.[0]?.content?.[0]?.text?.length || 0}`);
                    }
                    console.log(`[Gateway Proxy] ${ts()} -> event: ${event.eventType}`);
                    writeSse(formatSseEvent(event));
                  }
                }
              } else {
                    // openai_responses passthrough - already handled above in the needConvert=false block
                    // This branch should not be reached, but just in case
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
          if (!hasCompleted) {
            if (!needConvert) {
              // For openai_responses passthrough, send a synthetic response.completed
              console.log(`[Gateway Proxy] ${ts()} SENDING FALLBACK response.completed for openai_responses passthrough`);
              const fallbackCompleted = {
                type: 'response.completed',
                id: responseId,
                object: 'response.completed',
                response: { id: responseId, object: 'response', status: 'completed', output: [] }
              };
              writeSse(`event: response.completed\ndata: ${JSON.stringify(fallbackCompleted)}\n\n`);
            } else {
              const contentStr = typeof (streamState as any).collectedContent === 'string' ? (streamState as any).collectedContent.substring(0, 100) : JSON.stringify((streamState as any).collectedContent)?.substring(0, 100);
              console.log(`[Gateway Proxy] ${ts()} SENDING FALLBACK response.completed, collectedContent: "${contentStr}"`);
              console.log(`[Gateway Proxy] ${ts()} sseBuffer remaining (${sseBuffer.length} bytes): ${sseBuffer.substring(0, 300)}`);
              const syntheticStop = { choices: [{ finish_reason: 'stop', delta: {} }], usage: null };
              const fallbackEvents = processChatChunk(syntheticStop, responseId, model, streamState);
              for (const event of fallbackEvents) {
                console.log(`[Gateway Proxy] ${ts()} FALLBACK event: ${event.eventType}`);
                writeSse(formatSseEvent(event));
              }
            }
          }
          console.log(`[Gateway Proxy] ${ts()} Stream completed`);
          const streamUsage = (streamState as any)?.usage as { inputTokens: number; outputTokens: number } | null | undefined;
          store.addLog({
            direction: 'outbound',
            cliTool,
            provider: provider.name,
            model,
            endpoint: originalEndpoint,
            statusCode: code === 0 ? 200 : 502,
            duration: Date.now() - startTime,
            inputTokens: streamUsage?.inputTokens || undefined,
            outputTokens: streamUsage?.outputTokens || undefined,
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
        const bodyStr = JSON.stringify(upstreamBody);
        const response = await curlRequest(upstreamUrl, {
          method: 'POST',
          headers,
          body: bodyStr,
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
            const respUsage = chatResponse.usage;
            store.addLog({
              direction: 'outbound',
              cliTool,
              provider: provider.name,
              model,
              endpoint: originalEndpoint,
              statusCode: 200,
              duration: Date.now() - startTime,
              inputTokens: respUsage?.prompt_tokens || undefined,
              outputTokens: respUsage?.completion_tokens || undefined,
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
          inputTokens: (() => { try { return JSON.parse(response.body)?.usage?.prompt_tokens; } catch { return undefined; } })(),
          outputTokens: (() => { try { return JSON.parse(response.body)?.usage?.completion_tokens; } catch { return undefined; } })(),
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

      const response = await curlRequest(upstreamUrl, { headers, timeout: 30000 });

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
