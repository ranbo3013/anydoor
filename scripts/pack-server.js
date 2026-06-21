/**
 * AnyDoor - 服务器打包脚本
 * 将 server/dist + server/node_modules 打包成扁平结构
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

// 1. 复制 server/dist → server-pack/main.js (以及其他编译产物)
const serverDist = path.join(SERVER_DIR, 'dist');
if (!fs.existsSync(serverDist)) {
  console.error('[AnyDoor] server/dist not found. Run "pnpm build:server" first.');
  process.exit(1);
}
fs.cpSync(serverDist, PACK_DIR, { recursive: true });
console.log('[AnyDoor] Copied server/dist → server-pack/');

// 2. 复制 server/package.json
const pkgJson = JSON.parse(fs.readFileSync(path.join(SERVER_DIR, 'package.json'), 'utf-8'));
// 只保留生产依赖
const prodPkg = {
  name: pkgJson.name,
  version: pkgJson.version,
  private: true,
  dependencies: pkgJson.dependencies || {},
};
fs.writeFileSync(path.join(PACK_DIR, 'package.json'), JSON.stringify(prodPkg, null, 2));
console.log('[AnyDoor] Created server-pack/package.json (production only)');

// 3. 在 server-pack 中安装扁平化的 node_modules
const { execSync } = require('child_process');
console.log('[AnyDoor] Installing production dependencies (flat node_modules)...');
try {
  execSync('npm install --production --no-package-lock', {
    cwd: PACK_DIR,
    stdio: 'inherit',
  });
  console.log('[AnyDoor] Server pack ready at:', PACK_DIR);
} catch (err) {
  console.error('[AnyDoor] Failed to install server dependencies.');
  process.exit(1);
}
