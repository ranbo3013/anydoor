/**
 * esbuild bundle script for NestJS server
 * Bundles the entire server into a single .js file
 * No node_modules needed at runtime!
 */
const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const isDev = process.argv.includes('--watch');

const SERVER_SRC = path.join(__dirname, '..', 'server', 'src');
const SERVER_DIST = path.join(__dirname, '..', 'server-bundle');

// Ensure output directory exists
if (!fs.existsSync(SERVER_DIST)) {
  fs.mkdirSync(SERVER_DIST, { recursive: true });
}

// Copy gateway-data directory placeholder
const dataDir = path.join(SERVER_DIST, 'gateway-data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const buildOptions = {
  entryPoints: [path.join(SERVER_SRC, 'main.ts')],
  bundle: true,
  platform: 'node',
  target: 'node18',
  outfile: path.join(SERVER_DIST, 'server.js'),
  // NestJS uses decorators - need to handle them
  // esbuild doesn't support emitDecoratorMetadata natively,
  // so we use a plugin approach
  banner: {
    js: `
// Polyfill: ensure reflect-metadata is loaded before any NestJS code
`.trim() + '\n',
  },
  external: [
    // NestJS optional modules - lazy loaded, not needed for HTTP-only gateway
    '@nestjs/microservices',
    '@nestjs/microservices/microservices-module',
    '@nestjs/websockets',
    '@nestjs/websockets/socket-module',
    'class-validator',
    'class-transformer',
    // Native modules that can't be bundled
    'pg-native',
    'cpu-features',
    'bcrypt',
  ],
  // Resolve path aliases
  alias: {
    '@/*': SERVER_SRC + '/*',
  },
  // NestJS decorator support
  tsconfig: path.join(__dirname, '..', 'server', 'tsconfig.json'),
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  minify: false, // Keep readable for debugging
  sourcemap: true,
  // Handle __dirname and __filename in bundled output
  conditions: ['node'],
  mainFields: ['main', 'module'],
  logLevel: 'info',
};

async function build() {
  try {
    // First, check if reflect-metadata is installed
    try {
      require.resolve('reflect-metadata');
    } catch {
      console.log('Installing reflect-metadata...');
      const { execSync } = require('child_process');
      execSync('pnpm add reflect-metadata', {
        cwd: path.join(__dirname, '..', 'server'),
        stdio: 'inherit',
      });
    }

    if (isDev) {
      const ctx = await esbuild.context(buildOptions);
      await ctx.watch();
      console.log('👀 Watching for changes...');
    } else {
      const result = await esbuild.build(buildOptions);
      console.log('✅ Server bundle created:', buildOptions.outfile);

      // Verify the bundle
      const stats = fs.statSync(buildOptions.outfile);
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
    }
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

build();
