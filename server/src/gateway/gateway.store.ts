import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { Provider, RouteConfig, ProxyLog, GatewayStatus, ApiFormat } from './gateway.types';

// 优先使用 ANYDOOR_DATA_DIR 环境变量（Electron 设置为 ~/.anydoor/data）
// 否则回退到当前工作目录下的 gateway-data
const DATA_DIR = process.env.ANYDOOR_DATA_DIR || path.join(process.cwd(), 'gateway-data');
const PROVIDERS_FILE = path.join(DATA_DIR, 'providers.json');
const ROUTES_FILE = path.join(DATA_DIR, 'routes.json');
const LOGS_FILE = path.join(DATA_DIR, 'logs.json');

// Encryption key for API keys - derived from machine-specific info
// In production, this should come from a secure source (e.g., system keychain)
const ENCRYPTION_KEY = getEncryptionKey();
const ENCRYPTION_PREFIX = 'enc:v1:';

function getEncryptionKey(): string {
  // Use a fixed key for now. In a real desktop app, this should use system keychain.
  // The key is derived from a combination of hostname + username for some machine-specificity
  const hostname = require('os').hostname() || 'anydoor';
  const username = require('os').userInfo().username || 'user';
  const raw = `anydoor-${hostname}-${username}-encryption-key`;
  return crypto.createHash('sha256').update(raw).digest('hex').substring(0, 32);
}

function encryptApiKey(plaintext: string): string {
  if (!plaintext || plaintext.startsWith(ENCRYPTION_PREFIX)) return plaintext;
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${ENCRYPTION_PREFIX}${iv.toString('hex')}:${encrypted}`;
}

function decryptApiKey(encrypted: string): string {
  if (!encrypted || !encrypted.startsWith(ENCRYPTION_PREFIX)) return encrypted;
  try {
    const parts = encrypted.slice(ENCRYPTION_PREFIX.length).split(':');
    if (parts.length !== 2) return encrypted; // Return as-is if format is wrong
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedData = parts[1];
    const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    // If decryption fails, return as-is (might be an old unencrypted key)
    return encrypted;
  }
}

// Decrypt API keys in providers for use
export function decryptProvider(provider: Provider): Provider {
  return {
    ...provider,
    apiKey: decryptApiKey(provider.apiKey),
  };
}

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
  // Return providers with decrypted API keys for internal use
  return readJsonFile<Provider[]>(PROVIDERS_FILE, []).map(decryptProvider);
}

export function getProviderById(id: string): Provider | undefined {
  return getProviders().find(p => p.id === id);
}

export function createProvider(data: Omit<Provider, 'id' | 'createdAt' | 'updatedAt'>): Provider {
  const providers = readJsonFile<Provider[]>(PROVIDERS_FILE, []);
  const provider: Provider = {
    ...data,
    apiKey: encryptApiKey(data.apiKey), // Encrypt before storing
    id: `provider_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  providers.push(provider);
  writeJsonFile(PROVIDERS_FILE, providers);
  return decryptProvider(provider); // Return decrypted
}

export function updateProvider(id: string, data: Partial<Provider>): Provider | null {
  const providers = readJsonFile<Provider[]>(PROVIDERS_FILE, []);
  const index = providers.findIndex(p => p.id === id);
  if (index === -1) return null;
  // Encrypt API key if it's being updated
  const updateData = { ...data, updatedAt: new Date().toISOString() };
  if (updateData.apiKey) {
    updateData.apiKey = encryptApiKey(updateData.apiKey);
  }
  providers[index] = { ...providers[index], ...updateData };
  writeJsonFile(PROVIDERS_FILE, providers);
  return decryptProvider(providers[index]);
}

export function deleteProvider(id: string): boolean {
  const providers = readJsonFile<Provider[]>(PROVIDERS_FILE, []);
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
  // Encrypt all API keys before saving
  const encrypted = providers.map(p => ({
    ...p,
    apiKey: encryptApiKey(p.apiKey),
  }));
  writeJsonFile(PROVIDERS_FILE, encrypted);
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

// ========== Model List Cache ==========

interface CachedModels {
  models: string[];
  timestamp: number;
  providerId: string;
}

const modelCache = new Map<string, CachedModels>();
const MODEL_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function getCachedModels(cacheKey: string): string[] | null {
  const cached = modelCache.get(cacheKey);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > MODEL_CACHE_TTL) {
    modelCache.delete(cacheKey);
    return null;
  }
  return cached.models;
}

export function setCachedModels(cacheKey: string, providerId: string, models: string[]): void {
  modelCache.set(cacheKey, { models, timestamp: Date.now(), providerId });
}

// ========== Provider Health Status ==========

interface ProviderHealth {
  providerId: string;
  healthy: boolean;
  lastChecked: number;
  latency?: number;
  error?: string;
}

const healthCache = new Map<string, ProviderHealth>();
const HEALTH_CHECK_TTL = 60 * 1000; // 1 minute

export function getProviderHealth(providerId: string): ProviderHealth | null {
  return healthCache.get(providerId) || null;
}

export function setProviderHealth(providerId: string, health: Omit<ProviderHealth, 'providerId'>): void {
  healthCache.set(providerId, { ...health, providerId });
}

export function getAllProviderHealth(): ProviderHealth[] {
  return Array.from(healthCache.values());
}

// ========== Gateway Auth Config ==========

const PROXY_TOKEN_KEY = 'anydoor-proxy-token';

function generateProxyToken(): string {
  return crypto.randomBytes(16).toString('hex');
}

export function getProxyToken(): string {
  const configFile = path.join(DATA_DIR, 'config.json');
  try {
    if (fs.existsSync(configFile)) {
      const config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
      if (config.proxyToken) return config.proxyToken;
    }
  } catch {}
  // Generate and save a new token
  const token = generateProxyToken();
  saveConfig({ proxyToken: token });
  return token;
}

export function isProxyAuthEnabled(): boolean {
  const configFile = path.join(DATA_DIR, 'config.json');
  try {
    if (fs.existsSync(configFile)) {
      const config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
      return config.authEnabled === true;
    }
  } catch {}
  return false;
}

export function setProxyAuthEnabled(enabled: boolean): void {
  saveConfig({ authEnabled: enabled });
}

export function setProxyToken(token: string): void {
  saveConfig({ proxyToken: token });
}

function saveConfig(partial: Record<string, any>): void {
  const configFile = path.join(DATA_DIR, 'config.json');
  let config: Record<string, any> = {};
  try {
    if (fs.existsSync(configFile)) {
      config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
    }
  } catch {}
  Object.assign(config, partial);
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2), 'utf-8');
}

export function isHealthCheckNeeded(providerId: string): boolean {
  const health = healthCache.get(providerId);
  if (!health) return true;
  return Date.now() - health.lastChecked > HEALTH_CHECK_TTL;
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
        // Map role: 'developer' -> 'system' for compatibility
        let role = item.role;
        if (role === 'developer') role = 'system';

        // Convert content: always produce a plain string or a valid array of objects
        let content: any;
        if (Array.isArray(item.content)) {
          // Check if all items are input_text - if so, concatenate into single string
          const allText = item.content.every((c: any) => c.type === 'input_text');
          if (allText) {
            content = item.content.map((c: any) => c.text).join('\n\n');
          } else {
            // Mixed content: convert to OpenAI chat format
            content = item.content.map((c: any) => {
              if (c.type === 'input_text') return { type: 'text', text: c.text };
              if (c.type === 'input_image') return { type: 'image_url', image_url: { url: c.image_url } };
              return null;
            }).filter(Boolean);
          }
        } else if (typeof item.content === 'string') {
          content = item.content;
        }

        messages.push({ role, content });
      } else if (item.type === 'function_call_output') {
        // Codex sends tool results as function_call_output
        // Convert to Chat Completions tool role message
        messages.push({
          role: 'tool',
          tool_call_id: item.call_id,
          content: typeof item.output === 'string' ? item.output : JSON.stringify(item.output),
        });
      }
    }
  }

  // Check if we need to add assistant messages with tool_calls for previous function calls
  // When Codex sends function_call_output items, there must be corresponding tool_calls in the assistant message
  const toolCallOutputs = (Array.isArray(body.input) ? body.input : []).filter(
    (item: any) => item.type === 'function_call_output'
  );
  if (toolCallOutputs.length > 0) {
    // We need to insert an assistant message with tool_calls before the tool results
    // Find existing function_call items in the input
    const functionCalls = (Array.isArray(body.input) ? body.input : []).filter(
      (item: any) => item.type === 'function_call'
    );

    if (functionCalls.length > 0) {
      // Build the assistant message with tool_calls, placed before the first tool result
      const assistantMsg: any = {
        role: 'assistant',
        content: null,
        tool_calls: functionCalls.map((fc: any) => ({
          id: fc.call_id,
          type: 'function',
          function: {
            name: fc.name,
            arguments: fc.arguments,
          },
        })),
      };

      // Find the position of the first tool result and insert assistant message before it
      const firstToolResultIdx = messages.findIndex((m: any) => m.role === 'tool');
      if (firstToolResultIdx >= 0) {
        messages.splice(firstToolResultIdx, 0, assistantMsg);
      } else {
        messages.push(assistantMsg);
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

  // Anti-repetition defaults: apply if not explicitly set by the caller
  if (result.presence_penalty === undefined) result.presence_penalty = 0.1;
  if (result.frequency_penalty === undefined) result.frequency_penalty = 0.1;

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
    console.log('[Gateway] previous_response_id present but not supported in chat completions format');
  }

  return result;
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
          eventType: 'response.completed',
          data: {
            type: 'response.completed',
            response: {
              id: responseId,
              object: 'response',
              status: 'completed',
              output: [],
            },
          },
        };
      }

      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        return {
          eventType: 'response.output_text.delta',
          data: {
            type: 'response.output_text.delta',
            output_index: 0,
            content_index: 0,
            delta: event.delta.text,
          },
        };
      }

      if (event.type === 'content_block_delta' && event.delta?.type === 'input_json_delta') {
        return {
          eventType: 'response.function_call_arguments.delta',
          data: {
            type: 'response.function_call_arguments.delta',
            output_index: 0,
            delta: event.delta.partial_json || '',
          },
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
  if (providerType === 'anthropic') return 'anthropic';
  return 'openai_chat';
}

/**
 * Build the target URL for the upstream provider
 */
export function buildUpstreamUrl(baseUrl: string, format: ApiFormat, originalEndpoint: string): string {
  const base = baseUrl.replace(/\/+$/, '');

  if (format === 'anthropic') {
    if (base.endsWith('/v1') || base.includes('/v1/')) {
      return `${base}/messages`;
    }
    return `${base}/v1/messages`;
  }

  // OpenAI Chat Completions format
  if (originalEndpoint.includes('/responses') || originalEndpoint.includes('/chat/completions')) {
    if (base.endsWith('/v1') || base.includes('/v1/')) {
      return `${base}/chat/completions`;
    }
    return `${base}/v1/chat/completions`;
  }

  // For other endpoints (like /models), pass through
  return `${base}${originalEndpoint}`;
}
