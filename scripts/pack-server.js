/**
 * AnyDoor - 服务器打包脚本
 * 将 server/dist + 生产依赖 打包成扁平结构
 * 
 * 方案：直接从 pnpm 的 node_modules 用 cp -rL 复制（解析软链接）
 * 避免 npm install 在 pnpm workspace 中失败的问题
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SERVER_DIR = path.join(ROOT, 'server');
const PACK_DIR = path.join(ROOT, 'server-pack');

// 清理旧的打包产物
if (fs.existsSync(PACK_DIR)) {
  fs.rmSync(PACK_DIR, { recursive: true });
}
fs.mkdirSync(PACK_DIR, { recursive: true });

// 1. 检查 server/dist 是否存在
const serverDist = path.join(SERVER_DIR, 'dist');
if (!fs.existsSync(serverDist)) {
  console.error('[AnyDoor] ❌ server/dist not found. Run "cd server && pnpm build" first.');
  process.exit(1);
}

// 2. 复制 server/dist → server-pack/
fs.cpSync(serverDist, PACK_DIR, { recursive: true });
console.log('[AnyDoor] ✅ Copied server/dist → server-pack/');

// 3. 复制 package.json
const pkgJson = JSON.parse(fs.readFileSync(path.join(SERVER_DIR, 'package.json'), 'utf-8'));
const prodPkg = {
  name: pkgJson.name || 'anydoor-server',
  version: pkgJson.version || '1.0.0',
  private: true,
  dependencies: pkgJson.dependencies || {},
};
fs.writeFileSync(path.join(PACK_DIR, 'package.json'), JSON.stringify(prodPkg, null, 2));
console.log('[AnyDoor] ✅ Created server-pack/package.json');

// 4. 复制 node_modules（解析软链接）
const srcNm = path.join(SERVER_DIR, 'node_modules');
const dstNm = path.join(PACK_DIR, 'node_modules');

if (!fs.existsSync(srcNm)) {
  console.error('[AnyDoor] ❌ server/node_modules not found. Run "cd server && pnpm install" first.');
  process.exit(1);
}

console.log('[AnyDoor] 📦 Copying node_modules (resolving symlinks)...');

try {
  // cp -rL 解析软链接后复制，生成扁平的 node_modules
  execSync(`cp -rL "${srcNm}" "${dstNm}"`, { stdio: 'inherit' });
  console.log('[AnyDoor] ✅ Copied node_modules with resolved symlinks');
} catch (err) {
  console.error('[AnyDoor] ⚠️ cp -rL failed, falling back to fs.cpSync...');
  try {
    fs.cpSync(srcNm, dstNm, { recursive: true, verbatimSymlinks: false });
    console.log('[AnyDoor] ✅ Copied node_modules with fs.cpSync');
  } catch (err2) {
    console.error('[AnyDoor] ❌ Failed to copy node_modules:', err2.message);
    process.exit(1);
  }
}

// 5. 验证关键依赖
const criticalDeps = ['@nestjs/core', '@nestjs/platform-express', 'express', 'node-fetch'];
const missingDeps = [];
for (const dep of criticalDeps) {
  if (!fs.existsSync(path.join(dstNm, dep))) {
    missingDeps.push(dep);
  }
}

if (missingDeps.length > 0) {
  console.error('[AnyDoor] ❌ Missing critical dependencies:', missingDeps.join(', '));
  console.error('[AnyDoor]    server/node_modules contents (top-level):');
  try {
    const dirs = fs.readdirSync(srcNm).filter(d => !d.startsWith('.'));
    console.error('[AnyDoor]   ', dirs.join(', '));
  } catch (_) {}
  process.exit(1);
}

const installedDeps = fs.readdirSync(dstNm).filter(d => !d.startsWith('.'));
console.log('[AnyDoor] ✅ Server pack ready at:', PACK_DIR);
console.log('[AnyDoor]    Installed', installedDeps.length, 'top-level packages');
console.log('[AnyDoor]    All critical dependencies verified ✓');
