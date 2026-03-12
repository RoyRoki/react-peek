import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const src = resolve(root, 'src');
const build = resolve(root, 'build');

const isWatch = process.argv.includes('--watch');

// Ensure build dir exists
mkdirSync(build, { recursive: true });

const sharedOptions = {
  bundle: true,
  outdir: build,
  target: 'chrome120',
  minify: !isWatch,
  sourcemap: isWatch ? 'inline' : false,
  logLevel: 'info',
};

// Content scripts & popup: IIFE (runs in page/document context)
const iifeOptions = {
  ...sharedOptions,
  format: 'iife',
  entryPoints: [
    { in: resolve(src, 'content/content-isolated.ts'), out: 'content/content-isolated' },
    { in: resolve(src, 'content/content-main.ts'), out: 'content/content-main' },
    { in: resolve(src, 'popup/popup.ts'), out: 'popup/popup' },
  ],
};

// Service worker: ESM (Chrome MV3 service workers must NOT be wrapped in IIFE)
const esmOptions = {
  ...sharedOptions,
  format: 'esm',
  entryPoints: [
    { in: resolve(src, 'background/service-worker.ts'), out: 'background/service-worker' },
  ],
};

// Copy static files
function copyStatic() {
  cpSync(resolve(root, 'manifest.json'), resolve(build, 'manifest.json'));
  cpSync(resolve(src, 'popup/popup.html'), resolve(build, 'popup/popup.html'));

  // Copy icons
  const iconsDir = resolve(root, 'assets');
  const buildIcons = resolve(build, 'icons');
  mkdirSync(buildIcons, { recursive: true });
  if (existsSync(iconsDir)) {
    try { cpSync(iconsDir, buildIcons, { recursive: true }); } catch {}
  }
}

async function main() {
  copyStatic();

  if (isWatch) {
    const [iifeCtx, esmCtx] = await Promise.all([
      esbuild.context(iifeOptions),
      esbuild.context(esmOptions),
    ]);
    await Promise.all([iifeCtx.watch(), esmCtx.watch()]);
    console.log('Watching for changes...');
  } else {
    await Promise.all([esbuild.build(iifeOptions), esbuild.build(esmOptions)]);
    console.log('Build complete!');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
