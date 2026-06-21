export interface Provider {
  id: string;
  name: string;
  type: 'openai_chat' | 'openai_responses' | 'anthropic';
  baseUrl: string;
  apiKey: string;
  models: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RouteConfig {
  id: string;
  cliTool: 'claude-code' | 'codex' | 'cursor' | 'custom';
  providerId: string;
  model: string;
  enabled: boolean;
  createdAt: string;
}

export interface ProxyLog {
  id: string;
  timestamp: string;
  direction: 'inbound' | 'outbound';
  cliTool: string;
  provider: string;
  model: string;
  endpoint: string;
  statusCode: number;
  duration: number;
  error?: string;
}

export interface GatewayStatus {
  running: boolean;
  proxyPort: number;
  activeConnections: number;
  totalRequests: number;
  providers: { id: string; name: string; connected: boolean }[];
}

export type ApiFormat = 'openai_chat' | 'openai_responses' | 'anthropic';
