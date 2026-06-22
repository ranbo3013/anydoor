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
 * Execute a curl request and return the full response.
 * Uses `curl -s -i` to capture both headers and body, then parses them.
 */
export function curlRequest(url: string, options: CurlOptions = {}): Promise<CurlResponse> {
  const { method = 'GET', headers = {}, body, timeout = 30000 } = options;

  const args: string[] = [
    '--compressed',       // auto decompress
    '-s',                 // silent (no progress)
    '-i',                 // include response headers
    '-w', '\n__CURL_STATUS__%{http_code}',  // append status code marker
    '--max-time', String(Math.floor(timeout / 1000)),
  ];

  if (method !== 'GET') {
    args.push('-X', method);
  }

  for (const [key, value] of Object.entries(headers)) {
    args.push('-H', `${key}: ${value}`);
  }

  if (body) {
    args.push('-d', body);
  }

  args.push(url);

  return new Promise((resolve, reject) => {
    execFile('curl', args, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error && !stdout) {
        // curl itself failed (network error, timeout, etc.)
        reject(error);
        return;
      }

      // Extract the status code from the marker at the end
      const statusMatch = stdout.match(/__CURL_STATUS__(\d+)\s*$/);
      const statusCode = statusMatch ? parseInt(statusMatch[1]) : 0;
      const output = statusMatch ? stdout.slice(0, stdout.lastIndexOf('__CURL_STATUS__')) : stdout;

      // Split headers and body (separated by \r\n\r\n)
      const headerEndIdx = output.indexOf('\r\n\r\n');
      let headerSection = '';
      let responseBody = '';

      if (headerEndIdx !== -1) {
        headerSection = output.slice(0, headerEndIdx);
        responseBody = output.slice(headerEndIdx + 4);
      } else {
        responseBody = output;
      }

      // Parse headers (may have multiple responses due to redirects, take the last one)
      const headerLines = headerSection.split('\r\n');
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
  });
}

/**
 * Spawn a curl process for streaming (SSE) responses.
 * Returns the ChildProcess so the caller can pipe stdout.
 */
export function curlStream(url: string, options: CurlOptions = {}): ChildProcess {
  const { method = 'POST', headers = {}, body, timeout = 120 } = options;

  const args: string[] = [
    '--compressed',
    '-s',                 // silent
    '-N',                 // no buffer (streaming)
    '--no-buffer',        // disable curl's internal buffering
    '--max-time', String(timeout),
  ];

  if (method !== 'GET') {
    args.push('-X', method);
  }

  for (const [key, value] of Object.entries(headers)) {
    args.push('-H', `${key}: ${value}`);
  }

  if (body) {
    args.push('-d', body);
  }

  args.push(url);

  const proc = spawn('curl', args, {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  return proc;
}
