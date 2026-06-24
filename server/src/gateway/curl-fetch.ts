import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/event-stream',
  'Accept-Language': 'en-US,en;q=0.9',
  'Connection': 'keep-alive',
};

/**
 * Execute a non-streaming HTTP request using curl subprocess
 * Uses temp file for large request bodies to avoid stdin pipe issues
 */
export async function curlRequest(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    timeout?: number;
  } = {},
): Promise<{ statusCode: number; headers: Record<string, string>; body: string }> {
  const method = options.method || 'GET';
  const timeout = options.timeout || 30000;

  const args: string[] = [
    '-s',                           // Silent mode
    '-D', '-',                      // Dump headers to stdout
    '-o', '-',                      // Output body to stdout
    '-w', '\n__CURL_STATUS__%{http_code}', // Append status code
    '--compressed',                 // Handle compressed responses
    '--connect-timeout', '10',
    '--max-time', String(Math.ceil(timeout / 1000)),
    '-X', method,
    '--tcp-nodelay',
    '--http2',
    '--keepalive-time', '60',
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

  // Write body to temp file for reliable transmission
  let tmpFile: string | null = null;
  if (options.body) {
    const body = options.body.replace(/^\uFEFF/, '');
    tmpFile = path.join(os.tmpdir(), `anydoor-req-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    fs.writeFileSync(tmpFile, body, 'utf-8');
    args.push('--data-binary', `@${tmpFile}`);
    console.log(`[curlRequest] Body written to temp file: ${tmpFile} (${body.length} chars, ${Buffer.byteLength(body, 'utf-8')} bytes)`);
  }

  args.push(url);

  console.log(`[curlRequest] Spawning curl for: ${url}`);
  console.log(`[curlRequest] Method: ${method} | Body: ${options.body ? `${options.body.length} chars` : 'none'}`);

  return new Promise((resolve, reject) => {
    const proc = spawn('curl', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      // Clean up temp file
      if (tmpFile) {
        try { fs.unlinkSync(tmpFile); } catch (_) {}
      }

      if (stderr.trim()) {
        console.log(`[curlRequest] stderr: ${stderr.trim().substring(0, 200)}`);
      }

      // Parse status code from the __CURL_STATUS__ marker
      const statusMatch = stdout.match(/__CURL_STATUS__(\d+)/);
      const statusCode = statusMatch ? parseInt(statusMatch[1], 10) : 0;
      stdout = stdout.replace(/__CURL_STATUS__\d+\n?$/, '');

      // Split headers and body
      const headerEndIdx = stdout.indexOf('\r\n\r\n');
      let headers: Record<string, string> = {};
      let body = stdout;

      if (headerEndIdx !== -1) {
        const headerSection = stdout.substring(0, headerEndIdx);
        body = stdout.substring(headerEndIdx + 4);

        // Parse headers (may include 100-continue response, so take the last set)
        const headerLines = headerSection.split('\r\n');
        for (const line of headerLines) {
          const colonIdx = line.indexOf(':');
          if (colonIdx !== -1) {
            const key = line.substring(0, colonIdx).trim().toLowerCase();
            const value = line.substring(colonIdx + 1).trim();
            headers[key] = value;
          }
        }
      }

      resolve({ statusCode, headers, body });
    });

    proc.on('error', (err) => {
      if (tmpFile) {
        try { fs.unlinkSync(tmpFile); } catch (_) {}
      }
      reject(err);
    });
  });
}

/**
 * Execute a streaming HTTP request using curl subprocess
 * Uses temp file for large request bodies to avoid stdin pipe issues
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

  // Write body to temp file for reliable transmission
  // This avoids stdin pipe issues with large bodies (400KB+)
  let tmpFile: string | null = null;
  if (options.body) {
    const body = options.body.replace(/^\uFEFF/, '');
    tmpFile = path.join(os.tmpdir(), `anydoor-stream-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    fs.writeFileSync(tmpFile, body, 'utf-8');
    args.push('--data-binary', `@${tmpFile}`);
    console.log(`[curlStream] Body written to temp file: ${tmpFile} (${body.length} chars, ${Buffer.byteLength(body, 'utf-8')} bytes UTF-8)`);

    // Register cleanup on process exit
    const cleanup = () => {
      if (tmpFile) {
        try { fs.unlinkSync(tmpFile); } catch (_) {}
        tmpFile = null;
      }
    };
    process.on('exit', cleanup);
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  }

  args.push(url);

  console.log(`[curlStream] Spawning curl for: ${url}`);
  console.log(`[curlStream] Method: ${method} | Body: ${options.body ? `${options.body.length} chars via temp file` : 'none'}`);

  const proc = spawn('curl', args, { stdio: ['pipe', 'pipe', 'pipe'] });

  proc.stdout.on('data', (data: Buffer) => {
    callbacks.onChunk?.(data.toString());
  });

  proc.stderr.on('data', (data: Buffer) => {
    const msg = data.toString().trim();
    if (msg) callbacks.onError?.(msg);
  });

  proc.on('close', (code) => {
    // Clean up temp file
    if (tmpFile) {
      try { fs.unlinkSync(tmpFile); } catch (_) {}
      tmpFile = null;
    }
    callbacks.onClose?.(code || 0);
  });

  // No need to write to stdin - body is read from temp file
  // This is much more reliable than stdin pipe for large bodies

  return proc;
}

export interface CurlStreamCallbacks {
  onChunk?: (data: string) => void;
  onError?: (error: string) => void;
  onClose?: (code: number) => void;
}
