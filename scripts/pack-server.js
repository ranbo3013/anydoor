/**
 * AnyDoor - 服务器打包脚本
 * 将 server/dist + 生产依赖 打包成扁平结构
 * 解决 pnpm symlink 导致 electron-builder 打包失败的问题
 */
const fs = require('fs');
const path = require('path');

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
  console.error('[AnyDoor] ❌ server/dist not found. Run "pnpm build:server" first.');
  process.exit(1);
}

// 2. 复制 server/dist → server-pack/
fs.cpSync(serverDist, PACK_DIR, { recursive: true });
console.log('[AnyDoor] ✅ Copied server/dist → server-pack/');

// 3. 生成精简的 package.json（只含生产依赖）
const pkgJson = JSON.parse(fs.readFileSync(path.join(SERVER_DIR, 'package.json'), 'utf-8'));
const prodPkg = {
  name: pkgJson.name || 'anydoor-server',
  version: pkgJson.version || '1.0.0',
  private: true,
  dependencies: pkgJson.dependencies || {},
};
fs.writeFileSync(path.join(PACK_DIR, 'package.json'), JSON.stringify(prodPkg, null, 2));
console.log('[AnyDoor] ✅ Created server-pack/package.json');
console.log('[AnyDoor]    Dependencies:', Object.keys(prodPkg.dependencies).join(', '));

// 4. 用 npm install 生成扁平化的 node_modules（解决 pnpm symlink 问题）
const { execSync } = require('child_process');
console.log('[AnyDoor] 📦 Installing production dependencies (flat node_modules)...');
try {
  execSync('npm install --production --no-package-lock', {
    cwd: PACK_DIR,
    stdio: 'inherit',
  });
  console.log('[AnyDoor] ✅ Server pack ready at:', PACK_DIR);

  // 验证关键依赖
  const nmDir = path.join(PACK_DIR, 'node_modules');
  if (fs.existsSync(nmDir)) {
    const deps = fs.readdirSync(nmDir).filter(d => !d.startsWith('.'));
    console.log('[AnyDoor]    Installed', deps.length, 'packages');
  }
} catch (err) {
  console.error('[AnyDoor] ❌ Failed to install server dependencies.');
  console.error('[AnyDoor]    Try running: cd server-pack && npm install --production');
  process.exit(1);
}
