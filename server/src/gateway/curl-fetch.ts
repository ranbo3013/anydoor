import { spawn, ChildProcess } from 'child_process';

// Browser-like headers to avoid Cloudflare blocking
const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/event-stream',
  'Accept-Language': 'en-US,en;q=0.9',
  'Connection': 'keep-alive',
};

export interface CurlResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export interface CurlStreamCallbacks {
  onChunk?: (rawData: string) => void;
  onClose?: (code: number) => void;
  onError?: (err: string) => void;
}

/**
 * Execute an HTTP request using curl subprocess
 * Supports retry on transient failures
 */
export async function curlRequest(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    timeout?: number;
    maxRetries?: number;
  } = {},
): Promise<CurlResponse> {
  const { maxRetries = 2, timeout = 30 } = options;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await curlRequestOnce(url, options);
      // Retry on 5xx or Cloudflare blocking
      if (result.statusCode >= 500 && attempt < maxRetries) {
        console.log(`[curl-fetch] Attempt ${attempt + 1} failed with ${result.statusCode}, retrying...`);
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); // Exponential backoff
        continue;
      }
      return result;
    } catch (err: any) {
      lastError = err;
      if (attempt < maxRetries) {
        console.log(`[curl-fetch] Attempt ${attempt + 1} error: ${err.message}, retrying...`);
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }

  throw lastError || new Error('Request failed after retries');
}

/**
 * Single curl request attempt (no retry)
 */
async function curlRequestOnce(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    timeout?: number;
  } = {},
): Promise<CurlResponse> {
  return new Promise((resolve, reject) => {
    const method = options.method || 'GET';
    const timeout = options.timeout || 30;

    const args: string[] = [
      '-s',                           // Silent mode
      '-D', '-',                      // Dump headers to stdout
      '-o', '-',                      // Output body to stdout
      '-w', '\n__CURL_STATUS__%{http_code}',  // Append status code
      '--compressed',                 // Handle compressed responses
      '--connect-timeout', '10',
      '--max-time', String(timeout),
      '-X', method,
      '--tcp-nodelay',                // Disable Nagle for faster streaming
      '--http2',                      // Use HTTP/2
      '--keepalive-time', '60',       // Keep connection alive
    ];

    // Add browser headers
    for (const [key, value] of Object.entries(BROWSER_HEADERS)) {
      args.push('-H', `${key}: ${value}`);
    }

    // Add custom headers
    if (options.headers) {
      for (const [key, value] of Object.entries(options.headers)) {
        args.push('-H', `${key}: ${value}`);
      }
    }

    // Body via stdin
    if (options.body) {
      args.push('-d', '@-');
    }

    args.push(url);

    const proc = spawn('curl', args, { stdio: ['pipe', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    if (options.body) {
      proc.stdin.write(options.body);
      proc.stdin.end();
    }

    proc.on('close', (code) => {
      if (code !== 0 && !stdout.includes('__CURL_STATUS__')) {
        reject(new Error(`curl exited with code ${code}: ${stderr}`));
        return;
      }

      // Parse status code from the trailer
      const statusMatch = stdout.match(/__CURL_STATUS__(\d+)/);
      const statusCode = statusMatch ? parseInt(statusMatch[1], 10) : 0;
      stdout = stdout.replace(/__CURL_STATUS__\d+/, '');

      // Parse headers and body (separated by \r\n\r\n)
      const headerEndIndex = stdout.indexOf('\r\n\r\n');
      const headers: Record<string, string> = {};

      if (headerEndIndex !== -1) {
        const headerSection = stdout.substring(0, headerEndIndex);
        const body = stdout.substring(headerEndIndex + 4);

        // Parse headers
        for (const line of headerSection.split('\r\n')) {
          const colonIndex = line.indexOf(':');
          if (colonIndex !== -1) {
            const key = line.substring(0, colonIndex).trim().toLowerCase();
            const value = line.substring(colonIndex + 1).trim();
            headers[key] = value;
          }
        }

        resolve({ statusCode, headers, body });
      } else {
        // No headers found, treat everything as body
        resolve({ statusCode, headers, body: stdout });
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Execute a streaming HTTP request using curl subprocess
 * Supports retry on connection failure
 */
export function curlStream(
  url: string,
  callbacks: CurlStreamCallbacks,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    timeout?: number;
  } = {},
): ChildProcess {
  const method = options.method || 'GET';
  const timeout = options.timeout || 120;

  const args: string[] = [
    '-N',                           // No buffering (stream immediately)
    '--no-buffer',                  // Disable curl output buffering
    '--compressed',                 // Handle compressed responses
    '--connect-timeout', '10',
    '--max-time', String(timeout),
    '-X', method,
    '--tcp-nodelay',                // Disable Nagle for faster streaming
    '--http2',                      // Use HTTP/2 for multiplexing
    '--keepalive-time', '60',       // Keep connection alive for 60s
  ];

  // Add browser headers
  for (const [key, value] of Object.entries(BROWSER_HEADERS)) {
    args.push('-H', `${key}: ${value}`);
  }

  // Add custom headers
  if (options.headers) {
    for (const [key, value] of Object.entries(options.headers)) {
      args.push('-H', `${key}: ${value}`);
    }
  }

  // Body via stdin to avoid shell argument length limits
  // Use --data-binary instead of -d to avoid any data processing (stripping \r\n)
  if (options.body) {
    args.push('--data-binary', '@-');
  }

  args.push(url);

  const proc = spawn('curl', args, { stdio: ['pipe', 'pipe', 'pipe'] });

  proc.stdout.on('data', (data: Buffer) => {
    callbacks.onChunk?.(data.toString());
  });

  proc.stderr.on('data', (data: Buffer) => {
    const msg = data.toString().trim();
    if (msg) callbacks.onError?.(msg);
  });

  proc.on('close', (code) => {
    callbacks.onClose?.(code || 0);
  });

  // Write body via stdin (explicitly use UTF-8 encoding)
  if (options.body) {
    // Remove BOM if present (can cause JSON parsing errors on upstream)
    const body = options.body.replace(/^\uFEFF/, '');
    proc.stdin.write(body, 'utf-8');
    proc.stdin.end();
  }

  return proc;
}
