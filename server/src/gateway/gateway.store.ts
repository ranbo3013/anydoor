import * as fs from 'fs';
import * as path from 'path';
import { Provider, RouteConfig, ProxyLog, GatewayStatus, ApiFormat } from './gateway.types';

const DATA_DIR = path.join(process.cwd(), 'gateway-data');
const PROVIDERS_FILE = path.join(DATA_DIR, 'providers.json');
const ROUTES_FILE = path.join(DATA_DIR, 'routes.json');
const LOGS_FILE = path.join(DATA_DIR, 'logs.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readJsonFile<T>(filePath: string, defaultValue: T): T {
  ensureDataDir();
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2), 'utf-8');
    return defaultValue;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return defaultValue;
  }
}

function writeJsonFile<T>(filePath: string, data: T) {
  ensureDataDir();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// ========== Provider CRUD ==========

export function getProviders(): Provider[] {
  return readJsonFile<Provider[]>(PROVIDERS_FILE, []);
}

export function getProviderById(id: string): Provider | undefined {
  return getProviders().find(p => p.id === id);
}

export function createProvider(data: Omit<Provider, 'id' | 'createdAt' | 'updatedAt'>): Provider {
  const providers = getProviders();
  const provider: Provider = {
    ...data,
    id: `provider_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  providers.push(provider);
  writeJsonFile(PROVIDERS_FILE, providers);
  return provider;
}

export function updateProvider(id: string, data: Partial<Provider>): Provider | null {
  const providers = getProviders();
  const index = providers.findIndex(p => p.id === id);
  if (index === -1) return null;
  providers[index] = { ...providers[index], ...data, updatedAt: new Date().toISOString() };
  writeJsonFile(PROVIDERS_FILE, providers);
  return providers[index];
}

export function deleteProvider(id: string): boolean {
  const providers = getProviders();
  const filtered = providers.filter(p => p.id !== id);
  if (filtered.length === providers.length) return false;
  writeJsonFile(PROVIDERS_FILE, filtered);
  // Also delete associated routes
  const routes = getRoutes().filter(r => r.providerId !== id);
  writeJsonFile(ROUTES_FILE, routes);
  return true;
}

// ========== Route CRUD ==========

export function getRoutes(): RouteConfig[] {
  return readJsonFile<RouteConfig[]>(ROUTES_FILE, []);
}

export function getRouteById(id: string): RouteConfig | undefined {
  return getRoutes().find(r => r.id === id);
}

export function createRoute(data: Omit<RouteConfig, 'id' | 'createdAt'>): RouteConfig {
  const routes = getRoutes();
  const route: RouteConfig = {
    ...data,
    id: `route_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
  routes.push(route);
  writeJsonFile(ROUTES_FILE, routes);
  return route;
}

export function updateRoute(id: string, data: Partial<RouteConfig>): RouteConfig | null {
  const routes = getRoutes();
  const index = routes.findIndex(r => r.id === id);
  if (index === -1) return null;
  routes[index] = { ...routes[index], ...data };
  writeJsonFile(ROUTES_FILE, routes);
  return routes[index];
}

export function deleteRoute(id: string): boolean {
  const routes = getRoutes();
  const filtered = routes.filter(r => r.id !== id);
  if (filtered.length === routes.length) return false;
  writeJsonFile(ROUTES_FILE, filtered);
  return true;
}

export function replaceAllProviders(providers: Provider[]): void {
  writeJsonFile(PROVIDERS_FILE, providers);
}

export function replaceAllRoutes(routes: RouteConfig[]): void {
  writeJsonFile(ROUTES_FILE, routes);
}

// ========== Proxy Logs ==========

const MAX_LOGS = 500;

export function getLogs(limit = 100): ProxyLog[] {
  const logs = readJsonFile<ProxyLog[]>(LOGS_FILE, []);
  return logs.slice(-limit);
}

export function addLog(log: Omit<ProxyLog, 'id' | 'timestamp'>): ProxyLog {
  const logs = readJsonFile<ProxyLog[]>(LOGS_FILE, []);
  const entry: ProxyLog = {
    ...log,
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
  };
  logs.push(entry);
  // Keep only last MAX_LOGS
  if (logs.length > MAX_LOGS) {
    logs.splice(0, logs.length - MAX_LOGS);
  }
  writeJsonFile(LOGS_FILE, logs);
  return entry;
}

export function clearLogs(): void {
  writeJsonFile(LOGS_FILE, []);
}

// ========== Gateway Status ==========

let totalRequests = 0;

export function incrementRequests(): number {
  totalRequests++;
  return totalRequests;
}

export function getGatewayStatus(proxyPort: number): GatewayStatus {
  const providers = getProviders();
  return {
    running: true,
    proxyPort,
    activeConnections: 0,
    totalRequests,
    providers: providers.map(p => ({
      id: p.id,
      name: p.name,
      connected: p.enabled,
    })),
  };
}

// ========== Protocol Conversion Helpers ==========

/**
 * Convert OpenAI Responses API format to Chat Completions format
 */
export function responsesToChatCompletions(body: any): any {
  const messages: any[] = [];

  // Convert instructions to system message
  if (body.instructions) {
    messages.push({ role: 'system', content: body.instructions });
  }

  // Convert input (can be string or array)
  if (typeof body.input === 'string') {
    messages.push({ role: 'user', content: body.input });
  } else if (Array.isArray(body.input)) {
    for (const item of body.input) {
      if (typeof item === 'string') {
        messages.push({ role: 'user', content: item });
      } else if (item.type === 'message') {
        messages.push({
          role: item.role,
          content: Array.isArray(item.content)
            ? item.content.map((c: any) => c.type === 'input_text' ? c.text : c.type === 'input_image' ? { type: 'image_url', image_url: { url: c.image_url } } : c).filter(Boolean)
            : item.content,
        });
      }
    }
  }

  const result: any = {
    model: body.model,
    messages,
    stream: body.stream ?? false,
  };

  // Pass through common parameters
  if (body.temperature !== undefined) result.temperature = body.temperature;
  if (body.top_p !== undefined) result.top_p = body.top_p;
  if (body.max_output_tokens !== undefined) result.max_tokens = body.max_output_tokens;
  if (body.presence_penalty !== undefined) result.presence_penalty = body.presence_penalty;
  if (body.frequency_penalty !== undefined) result.frequency_penalty = body.frequency_penalty;
  if (body.stop) result.stop = body.stop;

  // Convert tools
  if (body.tools && body.tools.length > 0) {
    result.tools = body.tools.map((tool: any) => {
      if (tool.type === 'function') {
        return {
          type: 'function',
          function: {
            name: tool.name || tool.function?.name,
            description: tool.description || tool.function?.description,
            parameters: tool.parameters || tool.function?.parameters,
          },
        };
      }
      return tool;
    }).filter((t: any) => t.type === 'function');
  }

  // Convert previous_response_id context (simplified - just carry forward)
  if (body.previous_response_id) {
    // We can't truly map this to chat completions, but we log it
    console.log('[Gateway] previous_response_id present but not supported in chat completions format');
  }

  return result;
}

/**
 * Convert Chat Completions streaming chunk to Responses API streaming event
 */
export function chatChunkToResponsesEvent(chunk: any, responseId: string): any {
  const delta = chunk.choices?.[0]?.delta;
  const finishReason = chunk.choices?.[0]?.finish_reason;

  if (finishReason === 'stop' || finishReason === 'end_turn') {
    return {
      type: 'response.completed',
      response: {
        id: responseId,
        object: 'response',
        status: 'completed',
        output: [],
      },
    };
  }

  if (delta?.content) {
    return {
      type: 'response.output_text.delta',
      output_index: 0,
      content_index: 0,
      delta: delta.content,
    };
  }

  if (delta?.tool_calls) {
    return {
      type: 'response.function_call_arguments.delta',
      output_index: 0,
      call_id: delta.tool_calls[0]?.id,
      delta: delta.tool_calls[0]?.function?.arguments || '',
    };
  }

  // For role or other non-content deltas, just skip
  return null;
}

/**
 * Convert Chat Completions response to Responses API format
 */
export function chatResponseToResponses(response: any): any {
  const choice = response.choices?.[0];
  const output: any[] = [];

  if (choice?.message?.content) {
    output.push({
      type: 'message',
      id: `msg_${Date.now()}`,
      role: 'assistant',
      content: [
        {
          type: 'output_text',
          text: choice.message.content,
        },
      ],
    });
  }

  if (choice?.message?.tool_calls) {
    for (const tc of choice.message.tool_calls) {
      output.push({
        type: 'function_call',
        id: tc.id,
        call_id: tc.id,
        name: tc.function.name,
        arguments: tc.function.arguments,
      });
    }
  }

  return {
    id: `resp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    object: 'response',
    created_at: Math.floor(Date.now() / 1000),
    status: 'completed',
    model: response.model,
    output,
    usage: response.usage
      ? {
          input_tokens: response.usage.prompt_tokens || 0,
          output_tokens: response.usage.completion_tokens || 0,
          total_tokens: response.usage.total_tokens || 0,
        }
      : undefined,
  };
}

/**
 * Convert Anthropic Messages API format to/from internal format
 */
export function chatToAnthropic(body: any, model: string): any {
  const messages = body.messages?.filter((m: any) => m.role !== 'system') || [];
  return {
    model,
    messages,
    system: body.messages?.find((m: any) => m.role === 'system')?.content,
    stream: body.stream ?? false,
    max_tokens: body.max_tokens || 4096,
    temperature: body.temperature,
    top_p: body.top_p,
  };
}

/**
 * Convert Anthropic streaming event to Responses API format
 */
export function anthropicChunkToResponsesEvent(event: any, responseId: string): any {
  if (event.type === 'message_stop') {
    return {
      type: 'response.completed',
      response: {
        id: responseId,
        object: 'response',
        status: 'completed',
        output: [],
      },
    };
  }

  if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
    return {
      type: 'response.output_text.delta',
      output_index: 0,
      content_index: 0,
      delta: event.delta.text,
    };
  }

  if (event.type === 'content_block_delta' && event.delta?.type === 'input_json_delta') {
    return {
      type: 'response.function_call_arguments.delta',
      output_index: 0,
      delta: event.delta.partial_json || '',
    };
  }

  return null;
}

/**
 * Convert Anthropic response to Responses API format
 */
export function anthropicResponseToResponses(response: any): any {
  const output: any[] = [];

  for (const block of response.content || []) {
    if (block.type === 'text') {
      output.push({
        type: 'message',
        id: `msg_${Date.now()}`,
        role: 'assistant',
        content: [{ type: 'output_text', text: block.text }],
      });
    } else if (block.type === 'tool_use') {
      output.push({
        type: 'function_call',
        id: block.id,
        call_id: block.id,
        name: block.name,
        arguments: JSON.stringify(block.input),
      });
    }
  }

  return {
    id: `resp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    object: 'response',
    created_at: Math.floor(Date.now() / 1000),
    status: 'completed',
    model: response.model,
    output,
    usage: response.usage
      ? {
          input_tokens: response.usage.input_tokens || 0,
          output_tokens: response.usage.output_tokens || 0,
          total_tokens: (response.usage.input_tokens || 0) + (response.usage.output_tokens || 0),
        }
      : undefined,
  };
}

/**
 * Determine the target API format based on provider type and original request format
 */
export function getTargetFormat(providerType: ApiFormat, originalEndpoint: string): ApiFormat {
  // If the provider is Anthropic, we need to convert to Anthropic format
  if (providerType === 'anthropic') return 'anthropic';
  // Otherwise use chat completions format (works for openai_chat and as fallback for openai_responses)
  return 'openai_chat';
}

/**
 * Build the target URL for the upstream provider
 */
export function buildUpstreamUrl(baseUrl: string, format: ApiFormat, originalEndpoint: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  if (format === 'anthropic') {
    return `${base}/messages`;
  }
  // Always use chat completions endpoint for openai_chat format
  if (originalEndpoint.includes('/responses') || originalEndpoint.includes('/chat/completions')) {
    return `${base}/chat/completions`;
  }
  // For other endpoints (like /models), pass through
  return `${base}${originalEndpoint}`;
}
