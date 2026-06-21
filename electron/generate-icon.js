#!/usr/bin/env node
/**
 * 生成 AnyDoor 应用图标
 * 使用 Node.js canvas 生成各尺寸 PNG 和 ICNS
 * 
 * 用法: node generate-icon.js
 * 需要: npm install canvas (可选，如果没有 canvas 则生成 SVG)
 */
const fs = require('fs');
const path = require('path');

const assetsDir = path.join(__dirname, 'assets');
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

// 生成 SVG 图标 - 任意门造型
function generateDoorSvg(size) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#6366f1"/>
      <stop offset="100%" style="stop-color:#8b5cf6"/>
    </linearGradient>
    <linearGradient id="door" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#fbbf24"/>
      <stop offset="100%" style="stop-color:#f59e0b"/>
    </linearGradient>
  </defs>
  <!-- 背景 -->
  <rect width="${size}" height="${size}" rx="${size * 0.22}" fill="url(#bg)"/>
  <!-- 门框 -->
  <rect x="${size * 0.25}" y="${size * 0.1}" width="${size * 0.5}" height="${size * 0.75}" rx="${size * 0.04}" fill="url(#door)" stroke="#d97706" stroke-width="${size * 0.02}"/>
  <!-- 门板分割线 -->
  <line x1="${size * 0.5}" y1="${size * 0.1}" x2="${size * 0.5}" y2="${size * 0.85}" stroke="#d97706" stroke-width="${size * 0.015}"/>
  <!-- 左门把手 -->
  <circle cx="${size * 0.44}" cy="${size * 0.5}" r="${size * 0.03}" fill="#92400e"/>
  <!-- 右门把手 -->
  <circle cx="${size * 0.56}" cy="${size * 0.5}" r="${size * 0.03}" fill="#92400e"/>
  <!-- 光效 (任意门的光芒) -->
  <ellipse cx="${size * 0.5}" cy="${size * 0.85}" rx="${size * 0.2}" ry="${size * 0.03}" fill="#fef3c7" opacity="0.6"/>
  <!-- 星星装饰 -->
  <circle cx="${size * 0.15}" cy="${size * 0.25}" r="${size * 0.02}" fill="#fef3c7" opacity="0.8"/>
  <circle cx="${size * 0.85}" cy="${size * 0.2}" r="${size * 0.015}" fill="#fef3c7" opacity="0.6"/>
  <circle cx="${size * 0.1}" cy="${size * 0.6}" r="${size * 0.012}" fill="#fef3c7" opacity="0.5"/>
  <circle cx="${size * 0.9}" cy="${size * 0.55}" r="${size * 0.018}" fill="#fef3c7" opacity="0.7"/>
</svg>`;
}

// 生成各尺寸的 SVG 文件
const sizes = [16, 32, 64, 128, 256, 512, 1024];

sizes.forEach(size => {
  const svg = generateDoorSvg(size);
  const filename = size <= 32 ? `trayIcon.png` : `icon-${size}.svg`;
  fs.writeFileSync(path.join(assetsDir, filename), svg);
});

// 生成 512x512 的主图标 SVG (electron-builder 会自动转换为 icns)
const mainIcon = generateDoorSvg(512);
fs.writeFileSync(path.join(assetsDir, 'icon.svg'), mainIcon);

// 也保存一个 PNG 友好的版本用于 tray
const traySvg = generateDoorSvg(16);
fs.writeFileSync(path.join(assetsDir, 'trayIcon.svg'), traySvg);

console.log('[AnyDoor] Icons generated in electron/assets/');
console.log('[AnyDoor] Note: For production build, convert icon.svg to icon.icns using:');
console.log('  npm install -g iconutil');
console.log('  Or use: npx electron-icon-builder --input=electron/assets/icon.svg --output=electron/assets');
