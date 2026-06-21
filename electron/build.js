/**
 * AnyDoor - Electron 主进程编译脚本
 * 将 electron/main.ts 编译为 electron/dist/main.js
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ELECTRON_DIR = __dirname;
const DIST_DIR = path.join(ELECTRON_DIR, 'dist');

// 清理旧的编译产物
if (fs.existsSync(DIST_DIR)) {
  fs.rmSync(DIST_DIR, { recursive: true });
}
fs.mkdirSync(DIST_DIR, { recursive: true });

// 编译 TypeScript
console.log('[AnyDoor] Compiling Electron main process...');
try {
  execSync(`npx tsc -p "${path.join(ELECTRON_DIR, 'tsconfig.json')}"`, {
    cwd: ROOT,
    stdio: 'inherit',
  });
  console.log('[AnyDoor] Electron main process compiled successfully.');
} catch (err) {
  console.error('[AnyDoor] Failed to compile Electron main process.');
  process.exit(1);
}

// 复制 assets 到 dist
const assetsDir = path.join(ELECTRON_DIR, 'assets');
if (fs.existsSync(assetsDir)) {
  const destAssetsDir = path.join(DIST_DIR, 'assets');
  if (!fs.existsSync(destAssetsDir)) {
    fs.mkdirSync(destAssetsDir, { recursive: true });
  }
  fs.cpSync(assetsDir, destAssetsDir, { recursive: true });
  console.log('[AnyDoor] Assets copied to dist.');
}
