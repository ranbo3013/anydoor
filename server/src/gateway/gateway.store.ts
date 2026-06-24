import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as os from 'os';
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

// ========== Log Storage Info & Cleanup ==========

export interface LogStorageInfo {
  proxyLogCount: number;
  proxyLogSizeKB: number;
  electronLogSizeKB: number;
  totalSizeKB: number;
}

export function getLogStorageInfo(): LogStorageInfo {
  // Proxy logs (logs.json)
  let proxyLogSizeKB = 0;
  let proxyLogCount = 0;
  try {
    const stats = fs.statSync(LOGS_FILE);
    proxyLogSizeKB = Math.round(stats.size / 1024);
    const logs = readJsonFile<ProxyLog[]>(LOGS_FILE, []);
    proxyLogCount = logs.length;
  } catch {}

  // Electron main process log (anydoor.log)
  let electronLogSizeKB = 0;
  try {
    const electronLogPath = path.join(os.homedir(), '.anydoor', 'logs', 'anydoor.log');
    const stats = fs.statSync(electronLogPath);
    electronLogSizeKB = Math.round(stats.size / 1024);
  } catch {}

  return {
    proxyLogCount,
    proxyLogSizeKB,
    electronLogSizeKB,
    totalSizeKB: proxyLogSizeKB + electronLogSizeKB,
  };
}

export function clearAllLogs(): void {
  // Clear proxy logs
  writeJsonFile(LOGS_FILE, []);

  // Truncate Electron main process log
  try {
    const electronLogPath = path.join(os.homedir(), '.anydoor', 'logs', 'anydoor.log');
    if (fs.existsSync(electronLogPath)) {
      fs.writeFileSync(electronLogPath, '');
    }
  } catch (err) {
    console.log('[Gateway] Failed to clear electron log:', err.message);
  }
}

// ========== Usage Statistics ==========

export interface UsageStatsFilter {
  provider?: string;
  model?: string;
  startDate?: string;
  endDate?: string;
}

export interface UsageStats {
  totalRequests: number;
  successRequests: number;
  failedRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCost: number;
  avgDuration: number;
  byProvider: Record<string, { requests: number; inputTokens: number; outputTokens: number; cost: number }>;
  byModel: Record<string, { requests: number; inputTokens: number; outputTokens: number; cost: number }>;
  dailyUsage: { date: string; requests: number; inputTokens: number; outputTokens: number; cost: number }[];
}

export function getUsageStats(filter: UsageStatsFilter = {}): UsageStats {
  const logs = readJsonFile<ProxyLog[]>(LOGS_FILE, []);

  // Filter outbound logs only (actual API calls)
  let filtered = logs.filter(l => l.direction === 'outbound');

  // Apply filters
  if (filter.provider && filter.provider !== 'all') {
    filtered = filtered.filter(l => l.provider === filter.provider);
  }
  if (filter.model && filter.model !== 'all') {
    filtered = filtered.filter(l => l.model === filter.model);
  }
  if (filter.startDate) {
    const start = new Date(filter.startDate).getTime();
    filtered = filtered.filter(l => new Date(l.timestamp).getTime() >= start);
  }
  if (filter.endDate) {
    // Add 1 day to include the end date fully
    const end = new Date(filter.endDate).getTime() + 86400000;
    filtered = filtered.filter(l => new Date(l.timestamp).getTime() < end);
  }

  const stats: UsageStats = {
    totalRequests: filtered.length,
    successRequests: filtered.filter(l => l.statusCode >= 200 && l.statusCode < 300).length,
    failedRequests: filtered.filter(l => l.statusCode < 200 || l.statusCode >= 300).length,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalTokens: 0,
    totalCost: 0,
    avgDuration: 0,
    byProvider: {},
    byModel: {},
    dailyUsage: [],
  };

  let totalDuration = 0;
  const dailyMap: Record<string, { requests: number; inputTokens: number; outputTokens: number; cost: number }> = {};

  for (const log of filtered) {
    const inTok = log.inputTokens || 0;
    const outTok = log.outputTokens || 0;
    const cost = log.cost || 0;

    stats.totalInputTokens += inTok;
    stats.totalOutputTokens += outTok;
    stats.totalCost += cost;
    totalDuration += log.duration;

    // By provider
    if (!stats.byProvider[log.provider]) {
      stats.byProvider[log.provider] = { requests: 0, inputTokens: 0, outputTokens: 0, cost: 0 };
    }
    stats.byProvider[log.provider].requests++;
    stats.byProvider[log.provider].inputTokens += inTok;
    stats.byProvider[log.provider].outputTokens += outTok;
    stats.byProvider[log.provider].cost += cost;

    // By model
    if (!stats.byModel[log.model]) {
      stats.byModel[log.model] = { requests: 0, inputTokens: 0, outputTokens: 0, cost: 0 };
    }
    stats.byModel[log.model].requests++;
    stats.byModel[log.model].inputTokens += inTok;
    stats.byModel[log.model].outputTokens += outTok;
    stats.byModel[log.model].cost += cost;

    // Daily usage
    const date = log.timestamp.substring(0, 10);
    if (!dailyMap[date]) {
      dailyMap[date] = { requests: 0, inputTokens: 0, outputTokens: 0, cost: 0 };
    }
    dailyMap[date].requests++;
    dailyMap[date].inputTokens += inTok;
    dailyMap[date].outputTokens += outTok;
    dailyMap[date].cost += cost;
  }

  stats.totalTokens = stats.totalInputTokens + stats.totalOutputTokens;
  stats.avgDuration = filtered.length > 0 ? Math.round(totalDuration / filtered.length) : 0;

  // Convert daily map to sorted array
  stats.dailyUsage = Object.entries(dailyMap)
    .map(([date, data]) => ({ date, ...data }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return stats;
}

export function getDistinctProviders(): string[] {
  const logs = readJsonFile<ProxyLog[]>(LOGS_FILE, []);
  const providers = new Set(logs.filter(l => l.direction === 'outbound').map(l => l.provider));
  return Array.from(providers).sort();
}

export function getDistinctModels(): string[] {
  const logs = readJsonFile<ProxyLog[]>(LOGS_FILE, []);
  const models = new Set(logs.filter(l => l.direction === 'outbound').map(l => l.model));
  return Array.from(models).sort();
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
    // Process items in order, grouping consecutive function_call items into
    // a single assistant message with tool_calls, followed by tool results.
    // This is critical: each assistant(tool_calls) must be immediately
    // followed by tool(result) messages for EVERY tool_call_id.
    let pendingToolCalls: any[] = [];

    const flushToolCalls = () => {
      if (pendingToolCalls.length > 0) {
        messages.push({
          role: 'assistant',
          content: null,
          tool_calls: pendingToolCalls.map((fc: any) => ({
            id: fc.call_id,
            type: 'function',
            function: {
              name: fc.name,
              arguments: typeof fc.arguments === 'string' ? fc.arguments : JSON.stringify(fc.arguments),
            },
          })),
        });
        pendingToolCalls = [];
      }
    };

    for (const item of body.input) {
      if (typeof item === 'string') {
        flushToolCalls();
        messages.push({ role: 'user', content: item });
      } else if (item.type === 'message') {
        flushToolCalls();
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

        messages.push({ role, content: content ?? '' });
      } else if (item.type === 'function_call') {
        // Accumulate consecutive function_calls into pending array.
        // They'll be flushed into a single assistant(tool_calls) message
        // when we encounter a function_call_output or other item type.
        pendingToolCalls.push(item);
      } else if (item.type === 'function_call_output') {
        // Flush any pending function_calls into an assistant message FIRST,
        // then add the tool result. This ensures proper ordering:
        // assistant(tool_calls) → tool(result) → tool(result) → ...
        flushToolCalls();
        // Check if there's already an assistant message with tool_calls matching this call_id
        const hasMatchingAssistant = messages.some(
          (m: any) => m.role === 'assistant' && m.tool_calls?.some((tc: any) => tc.id === item.call_id)
        );
        if (!hasMatchingAssistant) {
          // Orphan function_call_output: the function_call was in a previous
          // response (previous_response_id). Create a synthetic assistant message
          // so DeepSeek doesn't reject the tool message.
          console.log('[Gateway] WARNING: function_call_output without matching function_call, call_id:', item.call_id);
          messages.push({
            role: 'assistant',
            content: null,
            tool_calls: [{
              id: item.call_id,
              type: 'function',
              function: { name: 'unknown', arguments: '{}' },
            }],
          });
        }
        messages.push({
          role: 'tool',
          tool_call_id: item.call_id,
          content: typeof item.output === 'string' ? item.output : JSON.stringify(item.output),
        });
      }
    }

    // Flush any remaining pending tool_calls (edge case: function_call without output)
    flushToolCalls();
  }

  // Validate: every assistant message with tool_calls must be followed by
  // tool messages for each tool_call_id. Log a warning if broken.
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role === 'assistant' && msg.tool_calls?.length > 0) {
      const expectedIds = new Set(msg.tool_calls.map((tc: any) => tc.id));
      let j = i + 1;
      while (j < messages.length && messages[j].role === 'tool') {
        expectedIds.delete(messages[j].tool_call_id);
        j++;
      }
      if (expectedIds.size > 0) {
        console.log('[Gateway] WARNING: assistant tool_calls missing tool results for ids:', [...expectedIds]);
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
