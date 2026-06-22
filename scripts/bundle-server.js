/**
 * esbuild bundle script for NestJS server
 * Two-step approach:
 *   1. tsc compiles TS → JS (preserving decorator metadata for NestJS DI)
 *   2. esbuild bundles the JS output into a single file
 *
 * esbuild doesn't support emitDecoratorMetadata, so we must compile
 * with tsc first to generate the __metadata("design:paramtypes", ...) calls
 * that NestJS needs for dependency injection.
 */
const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const SERVER_DIR = path.join(__dirname, '..', 'server');
const SERVER_DIST = path.join(__dirname, '..', 'server-bundle');
const TSC_OUTPUT = path.join(__dirname, '..', 'server', 'dist');

// Ensure output directory exists
if (!fs.existsSync(SERVER_DIST)) {
  fs.mkdirSync(SERVER_DIST, { recursive: true });
}

// Copy gateway-data directory placeholder
const dataDir = path.join(SERVER_DIST, 'gateway-data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

async function build() {
  try {
    // ============================================
    // Step 1: Compile with tsc (preserves decorator metadata)
    // ============================================
    console.log('🔨 Step 1: Compiling TypeScript with tsc...');
    execSync('npx tsc', {
      cwd: SERVER_DIR,
      stdio: 'inherit',
    });

    // Verify tsc output exists
    if (!fs.existsSync(path.join(TSC_OUTPUT, 'main.js'))) {
      throw new Error('tsc compilation failed - main.js not found in server/dist/');
    }
    console.log('✅ tsc compilation done');

    // ============================================
    // Step 2: Bundle with esbuild (from tsc output, not source)
    // ============================================
    console.log('📦 Step 2: Bundling with esbuild...');
    const result = await esbuild.build({
      entryPoints: [path.join(TSC_OUTPUT, 'main.js')],
      bundle: true,
      platform: 'node',
      target: 'node18',
      outfile: path.join(SERVER_DIST, 'server.js'),
      // These NestJS modules are lazy-loaded and optional
      external: [
        '@nestjs/microservices',
        '@nestjs/microservices/microservices-module',
        '@nestjs/websockets',
        '@nestjs/websockets/socket-module',
        'class-validator',
        'class-transformer',
        'pg-native',
        'cpu-features',
        'bcrypt',
      ],
      define: {
        'process.env.NODE_ENV': '"production"',
      },
      minify: false,
      sourcemap: true,
      conditions: ['node'],
      mainFields: ['main', 'module'],
      logLevel: 'info',
    });

    console.log('✅ Server bundle created');

    // Verify the bundle
    const stats = fs.statSync(path.join(SERVER_DIST, 'server.js'));
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
    console.log(`📦 Bundle size: ${sizeMB} MB`);

    // Copy package.json for reference
    const pkg = require('../server/package.json');
    const minimalPkg = {
      name: pkg.name,
      version: pkg.version,
      main: 'server.js',
    };
    fs.writeFileSync(
      path.join(SERVER_DIST, 'package.json'),
      JSON.stringify(minimalPkg, null, 2)
    );
    console.log('✅ Server bundle ready at:', SERVER_DIST);
  } catch (err) {
    console.error('❌ Bundle failed:', err.message);
    process.exit(1);
  }
}

build();
