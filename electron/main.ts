import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
} from 'electron';
import * as path from 'path';
import * as http from 'http';
import * as fs from 'fs';

// ─── 配置 ───────────────────────────────────────────
const SERVER_PORT = 3000;
const isDev = !app.isPackaged;

// ─── 全局引用 ────────────────────────────────────────
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let serverProcess: ReturnType<typeof import('child_process').spawn> | null =
  null;

// ─── 工具函数 ────────────────────────────────────────
function getServerPath(): string {
  if (isDev) {
    return path.join(__dirname, '..', 'server', 'dist', 'main.js');
  }
  return path.join(process.resourcesPath, 'server', 'main.js');
}

function getFrontendPath(): string {
  if (isDev) {
    return path.join(__dirname, '..', 'dist', 'index.html');
  }
  return path.join(process.resourcesPath, 'frontend', 'index.html');
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
      // 开发模式：假设 server 已经在运行（coze dev）
      console.log('[AnyDoor] Dev mode: assuming server is already running');
      resolve();
      return;
    }

    // 生产模式：启动内置的 NestJS 服务
    const { spawn } = require('child_process') as typeof import('child_process');
    const serverPath = getServerPath();

    console.log('[AnyDoor] Starting server from:', serverPath);

    const env = { ...process.env, NODE_ENV: 'production', PORT: String(SERVER_PORT) };
    serverProcess = spawn('node', [serverPath], {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: false,
    });

    serverProcess.stdout?.on('data', (data: Buffer) => {
      console.log('[Server]', data.toString().trim());
    });

    serverProcess.stderr?.on('data', (data: Buffer) => {
      console.error('[Server]', data.toString().trim());
    });

    serverProcess.on('error', (err: Error) => {
      console.error('[AnyDoor] Failed to start server:', err);
      reject(err);
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
  // 尝试加载文件图标
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
      label: '网关状态',
      enabled: false,
    },
    {
      label: '  ● 运行中',
      type: 'normal',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: '代理地址',
      enabled: false,
    },
    {
      label: '  http://localhost:3000/api/gateway/proxy',
      click: () => {
        require('electron').clipboard.writeText('http://localhost:3000/api/gateway/proxy');
      },
    },
    { type: 'separator' },
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
    const frontendPath = getFrontendPath();
    mainWindow.loadFile(frontendPath);
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
    // 1. 启动后端服务
    await startServer();
    console.log('[AnyDoor] Server is ready');

    // 2. 创建系统托盘
    createTray();

    // 3. 创建主窗口
    createMainWindow();
  } catch (err) {
    console.error('[AnyDoor] Failed to start:', err);
    app.quit();
  }
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
  (app as any).isQuitting = true;  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
});

app.on('window-all-closed', () => {
  // macOS 上有托盘，不做任何操作
  // 只有用户从托盘选择"退出"才真正退出
});
