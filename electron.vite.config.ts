import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Applied to the production build only; the dev server needs inline scripts for HMR.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  // FullCalendar and TipTap inject <style> elements at runtime.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'"
].join('; ')

function cspPlugin(): Plugin {
  return {
    name: 'roundpost-csp',
    apply: 'build',
    transformIndexHtml: (html) =>
      html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`)
  }
}

export default defineConfig({
  main: {
    build: {
      lib: { entry: resolve(__dirname, 'electron/main.ts') },
      // node:sqlite is prefix-only, so older Node builds omit it from builtinModules.
      rolldownOptions: { external: ['node:sqlite'] }
    }
  },
  preload: {
    build: {
      lib: { entry: resolve(__dirname, 'electron/preload.ts') }
    }
  },
  renderer: {
    root: '.',
    plugins: [react(), cspPlugin()],
    build: {
      outDir: 'out/renderer',
      // electron-vite leaves bundles unminified; main and preload stay readable for error logs.
      minify: true,
      // The bundle loads from the local app archive, not over a network.
      chunkSizeWarningLimit: 1200,
      rolldownOptions: {
        input: { index: resolve(__dirname, 'index.html') }
      }
    }
  }
})
