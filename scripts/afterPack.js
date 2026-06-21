/**
 * AnyDoor - electron-builder afterPack hook
 * 清理打包产物中可能残留的 pnpm symlink
 */
exports.default = async function afterPack(context) {
  const appDir = context.appOutDir;
  if (!appDir) return;

  const serverNm = require('path').join(appDir, 'Contents', 'Resources', 'server', 'node_modules');
  const fs = require('fs');

  if (!fs.existsSync(serverNm)) return;

  // 检查是否有 broken symlink
  let brokenCount = 0;
  try {
    const entries = fs.readdirSync(serverNm, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isSymbolicLink()) {
        const linkPath = require('path').join(serverNm, entry.name);
        try {
          fs.statSync(linkPath);
        } catch {
          // Broken symlink
          fs.unlinkSync(linkPath);
          brokenCount++;
        }
      }
    }
  } catch {
    // ignore
  }

  if (brokenCount > 0) {
    console.log(`[AnyDoor] Cleaned ${brokenCount} broken symlinks from server/node_modules`);
  }
};
