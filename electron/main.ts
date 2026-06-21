import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  dialog,
} from 'electron';
import * as path from 'path';
import * as http from 'http';
import * as fs from 'fs';
import * as os from 'os';

// ─── 配置 ───────────────────────────────────────────
const SERVER_PORT = 3000;
const isDev = !app.isPackaged;

// ─── 日志系统 ────────────────────────────────────────
const LOG_DIR = path.join(os.homedir(), '.anydoor', 'logs');
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}
const LOG_FILE = path.join(LOG_DIR, 'anydoor.log');

function log(message: string) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}\n`;
  fs.appendFileSync(LOG_FILE, line);
  console.log(line.trim());
}

function logError(message: string, err?: any) {
  const timestamp = new Date().toISOString();
  const detail = err ? ` | ${err.stack || err.message || err}` : '';
  const line = `[${timestamp}] [ERROR] ${message}${detail}\n`;
  fs.appendFileSync(LOG_FILE, line);
  console.error(line.trim());
}

log('=== AnyDoor Starting ===');
log(`isDev: ${isDev}`);
log(`appPath: ${app.getAppPath()}`);
log(`resourcesPath: ${process.resourcesPath}`);
log(`cwd: ${process.cwd()}`);

// ─── 全局引用 ────────────────────────────────────────
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let serverProcess: ReturnType<typeof import('child_process').fork> | null = null;

// ─── 工具函数 ────────────────────────────────────────
function getServerDir(): string {
  if (isDev) {
    return path.join(__dirname, '..', 'server');
  }
  // 生产模式：从 resources/server 读取
  const resourceDir = path.join(process.resourcesPath, 'server');
  log(`Server dir: ${resourceDir}`);
  return resourceDir;
}

function getFrontendDir(): string {
  if (isDev) {
    return path.join(__dirname, '..', 'dist');
  }
  // 生产模式：从 resources/frontend 读取
  const resourceDir = path.join(process.resourcesPath, 'frontend');
  log(`Frontend dir: ${resourceDir}`);
  return resourceDir;
}

function getTrayIconPath(): string {
  if (isDev) {
    return path.join(__dirname, 'assets', 'trayIcon.png');
  }
  return path.join(process.resourcesPath, 'assets', 'trayIcon.png');
}

function waitUntilServerReady(
  port: number,
  maxRetries = 30,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let retries = 0;
    const check = () => {
      const req = http.get(
        `http://localhost:${port}/api/gateway/status`,
        (res) => {
          if (res.statusCode === 200) {
            log('Server health check passed');
            resolve();
          } else {
            retry();
          }
          res.resume();
        },
      );
      req.on('error', () => retry());
      req.setTimeout(2000, () => {
        req.destroy();
        retry();
      });
    };

    const retry = () => {
      retries++;
      if (retries >= maxRetries) {
        reject(new Error(`Server not ready after ${maxRetries} retries`));
      } else {
        setTimeout(check, 1000);
      }
    };

    check();
  });
}

// ─── 启动后端服务 ───────────────────────────────────
function startServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (isDev) {
      log('Dev mode: assuming server is already running');
      resolve();
      return;
    }

    // 生产模式：用 fork + ELECTRON_RUN_AS_NODE 启动 NestJS 服务
    // 关键：打包后的 App 里没有 node 命令，必须用 Electron 自带的 Node.js 运行时
    const { fork } = require('child_process') as typeof import('child_process');
    const serverDir = getServerDir();
    const serverEntry = path.join(serverDir, 'main.js');

    log(`Server entry: ${serverEntry}`);
    log(`Server dir exists: ${fs.existsSync(serverDir)}`);
    log(`Server entry exists: ${fs.existsSync(serverEntry)}`);

    // 检查 node_modules 是否存在
    const nodeModules = path.join(serverDir, 'node_modules');
    log(`node_modules exists: ${fs.existsSync(nodeModules)}`);

    if (!fs.existsSync(serverEntry)) {
      const msg = `Server entry not found: ${serverEntry}`;
      logError(msg);
      reject(new Error(msg));
      return;
    }

    // 使用 ELECTRON_RUN_AS_NODE=1 让 Electron 以纯 Node.js 模式运行
    // 这样 fork 出的子进程不会启动 Electron 窗口，只运行 NestJS 服务
    const env = {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: 'production',
      PORT: String(SERVER_PORT),
    };

    log(`Forking server with ELECTRON_RUN_AS_NODE=1`);
    log(`process.execPath: ${process.execPath}`);

    serverProcess = fork(serverEntry, [], {
      env,
      cwd: serverDir,
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      // 不继承 Electron 的主进程行为
    });

    serverProcess.stdout?.on('data', (data: Buffer) => {
      log(`[Server stdout] ${data.toString().trim()}`);
    });

    serverProcess.stderr?.on('data', (data: Buffer) => {
      const msg = data.toString().trim();
      // NestJS 启动时有些 warn 是正常的，不全部当错误
      if (msg.includes('Error') || msg.includes('error') || msg.includes('EADDRINUSE')) {
        logError(`[Server stderr] ${msg}`);
      } else {
        log(`[Server stderr] ${msg}`);
      }
    });

    serverProcess.on('error', (err: Error) => {
      logError('Failed to fork server process', err);
      reject(err);
    });

    serverProcess.on('exit', (code: number | null, signal: string | null) => {
      log(`Server process exited: code=${code}, signal=${signal}`);
      serverProcess = null;
    });

    // 等待服务就绪
    waitUntilServerReady(SERVER_PORT)
      .then(resolve)
      .catch(reject);
  });
}

// ─── 创建托盘图标 ───────────────────────────────────
function createTrayIcon(): Electron.NativeImage {
  const iconPath = getTrayIconPath();
  if (fs.existsSync(iconPath)) {
    return nativeImage.createFromPath(iconPath);
  }
  // 回退：创建一个简单的 SVG 图标
  const svg = `<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="1" width="12" height="14" rx="1" fill="none" stroke="#333" stroke-width="1.5"/>
    <line x1="8" y1="8" x2="8" y2="11" stroke="#333" stroke-width="1.5" stroke-linecap="round"/>
    <circle cx="8" cy="7.5" r="0.8" fill="#333"/>
  </svg>`;
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  return nativeImage.createFromDataURL(dataUrl);
}

// ─── 创建系统托盘 ───────────────────────────────────
function createTray() {
  const icon = createTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip('AnyDoor - AI 模型网关');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '打开 AnyDoor',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    { type: 'separator' },
    {
      label: '网关运行中',
      enabled: false,
    },
    {
      label: '代理: localhost:3000',
      click: () => {
        require('electron').clipboard.writeText('http://localhost:3000/api/gateway/proxy');
      },
    },
    { type: 'separator' },
    {
      label: '查看日志',
      click: () => {
        const { shell } = require('electron');
        shell.showItemInFolder(LOG_FILE);
      },
    },
    {
      label: '退出 AnyDoor',
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}

// ─── 创建主窗口 ─────────────────────────────────────
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'AnyDoor - AI 模型网关',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 18 },
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // 加载前端页面
  if (isDev) {
    mainWindow.loadURL('http://localhost:5000');
  } else {
    const frontendDir = getFrontendDir();
    const indexPath = path.join(frontendDir, 'index.html');
    log(`Loading frontend: ${indexPath}`);
    log(`Frontend index exists: ${fs.existsSync(indexPath)}`);

    if (fs.existsSync(indexPath)) {
      mainWindow.loadFile(indexPath);
    } else {
      // 前端文件不存在时显示错误页面
      logError(`Frontend not found at: ${indexPath}`);
      mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
        <html><body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:system-ui;background:#1a1a2e;color:#eee">
          <div style="text-align:center">
            <h1>AnyDoor 启动失败</h1>
            <p>前端文件未找到</p>
            <p style="color:#888;font-size:12px">路径: ${indexPath}</p>
            <p style="color:#888;font-size:12px">日志: ${LOG_FILE}</p>
          </div>
        </body></html>
      `)}`);
    }
  }

  // 开发模式打开 DevTools
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  // 窗口关闭时隐藏到托盘，而非退出
  mainWindow.on('close', (e) => {
    if (tray && !(app as any).isQuitting) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─── 应用生命周期 ───────────────────────────────────
app.whenReady().then(async () => {
  try {
    log('App ready, starting server...');

    // 1. 启动后端服务
    await startServer();
    log('Server is ready');

    // 2. 创建系统托盘
    createTray();
    log('Tray created');

    // 3. 创建主窗口
    createMainWindow();
    log('Window created');
  } catch (err: any) {
    logError('Failed to start', err);

    // 显示错误弹窗
    dialog.showErrorBox(
      'AnyDoor 启动失败',
      `${err.message || err}\n\n日志文件: ${LOG_FILE}`,
    );

    app.quit();
  }
});

// 捕获未处理的异常
process.on('uncaughtException', (err) => {
  logError('Uncaught exception', err);
  dialog.showErrorBox('AnyDoor 异常', `${err.message}\n\n日志: ${LOG_FILE}`);
});

process.on('unhandledRejection', (reason) => {
  logError('Unhandled rejection', reason);
});

// macOS: 点击 dock 图标时重新显示窗口
app.on('activate', () => {
  if (mainWindow === null) {
    createMainWindow();
  } else {
    mainWindow.show();
  }
});

// 退出前清理
app.on('before-quit', () => {
  (app as any).isQuitting = true;
  log('App quitting, cleaning up...');
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
});

app.on('window-all-closed', () => {
  // macOS 上有托盘，不做任何操作
});
