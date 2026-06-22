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

// asar: false 时，app 目录在 Contents/Resources/app/
const appDir = path.join(appPath, 'Contents', 'Resources', 'app');

if (!fs.existsSync(appDir)) {
  console.error('[AnyDoor] ❌ app directory not found:', appDir);
  process.exit(1);
}

console.log('[AnyDoor] 📁 app directory:', appDir);

// 列出 app 目录内容
try {
  const contents = fs.readdirSync(appDir);
  console.log('[AnyDoor] 📋 app contents:', contents.join(', '));
} catch (e) {
  console.error('[AnyDoor] ❌ Failed to read app dir:', e.message);
}

// 检查关键文件（esbuild bundle 方式）
const checks = [
  { name: 'Frontend', path: path.join(appDir, 'dist-desktop', 'index.html') },
  { name: 'Server bundle (server.js)', path: path.join(appDir, 'server-bundle', 'server.js') },
  { name: 'Electron main', path: path.join(appDir, 'electron', 'dist', 'main.js') },
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
  console.log('[AnyDoor] ❌ Some checks failed. The app may crash on launch.');
  console.log('[AnyDoor]    Check if "pnpm build:desktop" completed successfully.');
}
