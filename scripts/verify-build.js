/**
 * AnyDoor - 打包后验证脚本
 * 检查 .app 内的文件结构是否正确
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const releaseDir = path.join(ROOT, 'release');

// 查找 .app
let appPath = null;
try {
  const result = execSync(`find "${releaseDir}" -name "AnyDoor.app" -maxdepth 3 2>/dev/null`, { encoding: 'utf-8' });
  appPath = result.trim().split('\n')[0];
} catch (_) {}

if (!appPath || !fs.existsSync(appPath)) {
  console.log('[AnyDoor] ⚠️ No AnyDoor.app found in release/. Skipping verification.');
  process.exit(0);
}

console.log('[AnyDoor] 🔍 Verifying:', appPath);

const resourcesDir = path.join(appPath, 'Contents', 'Resources');

// 检查关键目录
const checks = [
  { name: 'Frontend', path: path.join(resourcesDir, 'frontend', 'index.html') },
  { name: 'Server main.js', path: path.join(resourcesDir, 'server', 'main.js') },
  { name: 'Server node_modules', path: path.join(resourcesDir, 'server', 'node_modules') },
  { name: 'Server @nestjs/core', path: path.join(resourcesDir, 'server', 'node_modules', '@nestjs', 'core') },
  { name: 'Server express', path: path.join(resourcesDir, 'server', 'node_modules', 'express') },
  { name: 'Server node-fetch', path: path.join(resourcesDir, 'server', 'node_modules', 'node-fetch') },
];

let allPassed = true;
for (const check of checks) {
  const exists = fs.existsSync(check.path);
  const icon = exists ? '✅' : '❌';
  console.log(`  ${icon} ${check.name}: ${exists ? 'OK' : 'MISSING'}`);
  if (!exists) allPassed = false;
}

if (allPassed) {
  console.log('[AnyDoor] ✅ All checks passed! The app should work correctly.');
} else {
  console.error('[AnyDoor] ❌ Some checks failed. The app may crash on launch.');
  console.error('[AnyDoor]    Check if "pnpm build:desktop" completed successfully.');
  console.error('[AnyDoor]    In particular, verify that "server-pack/node_modules" exists before building.');
}
