/**
 * curl-fetch: Use curl subprocess for HTTP requests to bypass Cloudflare TLS fingerprint blocking.
 *
 * Node.js has a distinctive TLS fingerprint (JA3) that Cloudflare can detect and block.
 * curl's TLS fingerprint matches what browsers use, so it passes Cloudflare's checks.
 */
import { execFile, spawn, ChildProcess } from 'child_process';

export interface CurlResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export interface CurlOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
}

/**
 * Default browser-like headers to make curl requests look like a real browser.
 * These are merged with any custom headers passed by the caller.
 */
const DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/event-stream, */*',
  'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'cross-site',
};

/**
 * Execute a curl request and return the full response.
 * Uses stdin (-d @-) to pass the body to avoid shell argument length limits.
 */
export function curlRequest(url: string, options: CurlOptions = {}): Promise<CurlResponse> {
  const { method = 'GET', headers = {}, body, timeout = 30000 } = options;

  const mergedHeaders = { ...DEFAULT_HEADERS, ...headers };

  const args: string[] = [
    '-i',                 // include response headers
    '-w', '\n__CURL_STATUS__%{http_code}',  // append status code marker
    '--compressed',
    '--connect-timeout', '10',
    '--tcp-nodelay',
    '--max-time', String(Math.floor(timeout / 1000)),
    '-s',
  ];

  if (method !== 'GET') {
    args.push('-X', method);
  }

  for (const [key, value] of Object.entries(mergedHeaders)) {
    args.push('-H', `${key}: ${value}`);
  }

  // Use stdin for body to avoid shell argument length limits
  if (body) {
    args.push('-d', '@-');
  }

  args.push(url);

  return new Promise((resolve, reject) => {
    const proc = execFile('curl', args, { maxBuffer: 10 * 1024 * 1024, timeout }, (error, stdout, stderr) => {
      if (error && !stdout) {
        reject(error);
        return;
      }

      // Extract the status code from the marker at the end
      const statusMatch = stdout.match(/__CURL_STATUS__(\d+)\s*$/);
      const statusCode = statusMatch ? parseInt(statusMatch[1]) : 0;
      const output = statusMatch ? stdout.slice(0, stdout.lastIndexOf('__CURL_STATUS__')) : stdout;

      // Split headers and body (separated by \r\n\r\n)
      let headerSection = '';
      let responseBody = '';

      const headerEndIdx = output.lastIndexOf('\r\n\r\n');
      if (headerEndIdx !== -1) {
        headerSection = output.slice(0, headerEndIdx);
        responseBody = output.slice(headerEndIdx + 4);
      } else {
        responseBody = output;
      }

      // If there were redirects, take only the last response's headers
      const redirectSplit = headerSection.split(/\r\n(?=HTTP\/)/);
      const lastHeaderSection = redirectSplit[redirectSplit.length - 1] || headerSection;

      // Parse headers
      const headerLines = lastHeaderSection.split('\r\n');
      const parsedHeaders: Record<string, string> = {};

      for (const line of headerLines) {
        const colonIdx = line.indexOf(':');
        if (colonIdx > 0) {
          const key = line.slice(0, colonIdx).trim().toLowerCase();
          const value = line.slice(colonIdx + 1).trim();
          parsedHeaders[key] = value;
        }
      }

      resolve({
        statusCode,
        headers: parsedHeaders,
        body: responseBody,
      });
    });

    // Write body to stdin and close it
    if (body) {
      proc.stdin!.write(body);
      proc.stdin!.end();
    }
  });
}

/**
 * Spawn a curl process for streaming (SSE) responses.
 * Uses stdin (-d @-) to pass the body to avoid shell argument length limits.
 * Returns the ChildProcess so the caller can pipe stdout.
 */
export function curlStream(url: string, options: CurlOptions = {}): ChildProcess {
  const { method = 'POST', headers = {}, body, timeout = 120 } = options;

  const mergedHeaders = { ...DEFAULT_HEADERS, ...headers };

  const args: string[] = [
    '-s',                 // silent
    '-N',                 // no buffer (streaming)
    '--no-buffer',        // disable curl's internal buffering
    '--connect-timeout', '10',
    '--max-time', String(timeout),
    '--tcp-nodelay',      // disable Nagle's algorithm for lower latency
  ];

  if (method !== 'GET') {
    args.push('-X', method);
  }

  for (const [key, value] of Object.entries(mergedHeaders)) {
    args.push('-H', `${key}: ${value}`);
  }

  // Use stdin for body to avoid shell argument length limits
  if (body) {
    args.push('-d', '@-');
  }

  args.push(url);

  const proc = spawn('curl', args, {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  // Write body to stdin and close it
  if (body) {
    proc.stdin!.write(body);
    proc.stdin!.end();
  }

  return proc;
}
