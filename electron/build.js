#!/usr/bin/env node
/**
 * 构建 Electron 主进程
 * 将 electron/main.ts 编译为 electron/dist/main.js
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const rootDir = path.join(__dirname, '..');
const electronDir = __dirname;

console.log('[AnyDoor] Building Electron main process...');

// 使用 tsc 编译
try {
  execSync('npx tsc -p tsconfig.json', {
    cwd: electronDir,
    stdio: 'inherit',
  });
  console.log('[AnyDoor] Electron main process built successfully');
} catch (err) {
  console.error('[AnyDoor] Failed to build Electron main process');
  process.exit(1);
}
