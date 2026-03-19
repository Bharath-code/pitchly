// build.mjs — esbuild bundler for the Chrome Extension
// Run with: node build.mjs [--watch]

import * as esbuild from 'esbuild'
import { copyFileSync, mkdirSync } from 'fs'

const isWatch = process.argv.includes('--watch')

const sharedConfig = {
  bundle: true,
  target: 'chrome112',
  format: 'esm',
  sourcemap: isWatch ? 'inline' : false,
  minify: !isWatch,
  logLevel: 'info',
}

async function build() {
  mkdirSync('dist', { recursive: true })

  // Build all entry points in parallel
  await Promise.all([
    // Background service worker
    esbuild.build({
      ...sharedConfig,
      entryPoints: ['src/background.ts'],
      outfile: 'dist/background.js',
    }),

    // Content script
    esbuild.build({
      ...sharedConfig,
      entryPoints: ['src/content.ts'],
      outfile: 'dist/content.js',
    }),

    // Popup script
    esbuild.build({
      ...sharedConfig,
      entryPoints: ['src/popup.ts'],
      outfile: 'dist/popup.js',
    }),

    // AudioWorklet processor (must be a standalone module — no bundling of imports)
    esbuild.build({
      ...sharedConfig,
      entryPoints: ['src/audio-processor.ts'],
      outfile: 'dist/audio-processor.js',
      // AudioWorklet scripts cannot use ES module imports from a bundler context
      format: 'iife',
      globalName: undefined,
    }),
  ])

  // Copy static assets to dist/
  const staticAssets = [
    { from: 'manifest.json', to: 'dist/manifest.json' },
    { from: 'popup.html', to: 'dist/popup.html' },
    { from: 'popup.css', to: 'dist/popup.css' },
    { from: 'src/hud.css', to: 'dist/hud.css' },
    { from: 'icons/icon16.png', to: 'dist/icons/icon16.png' },
    { from: 'icons/icon48.png', to: 'dist/icons/icon48.png' },
    { from: 'icons/icon128.png', to: 'dist/icons/icon128.png' },
  ]

  mkdirSync('dist/icons', { recursive: true })

  for (const asset of staticAssets) {
    try {
      copyFileSync(asset.from, asset.to)
    } catch (err) {
      console.warn(`⚠️  Failed to copy ${asset.from}: ${err.message}`)
    }
  }

  console.log('✅ Extension build complete → dist/')
}

if (isWatch) {
  // Watch mode — rebuild on changes
  const contexts = await Promise.all([
    esbuild.context({ ...sharedConfig, entryPoints: ['src/background.ts'], outfile: 'dist/background.js' }),
    esbuild.context({ ...sharedConfig, entryPoints: ['src/content.ts'], outfile: 'dist/content.js' }),
    esbuild.context({ ...sharedConfig, entryPoints: ['src/popup.ts'], outfile: 'dist/popup.js' }),
    esbuild.context({ ...sharedConfig, entryPoints: ['src/audio-processor.ts'], outfile: 'dist/audio-processor.js', format: 'iife' }),
  ])
  await Promise.all(contexts.map((ctx) => ctx.watch()))
  console.log('👀 Watching for changes…')
} else {
  build().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
