/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

/**
 * ビルド成果物の一覧を埋め込んだ Service Worker (sw.js) を生成する小さなプラグイン。
 * 外部ライブラリ(workbox 等)に頼らず、オフライン用のプリキャッシュを実現する。
 */
function serviceWorkerPlugin(): Plugin {
  return {
    name: 'yama-note-sw',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map'));
      const publicFiles = ['manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
      const precache = ['./', ...files.map((f) => `./${f}`), ...publicFiles.map((f) => `./${f}`)];
      const version = createHash('sha256').update(precache.join('|')).digest('hex').slice(0, 12);
      const template = readFileSync(new URL('./src/sw-template.js', import.meta.url), 'utf8');
      const source = template
        .replace('__SW_VERSION__', version)
        .replace('__PRECACHE_LIST__', JSON.stringify(precache, null, 2));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [preact(), serviceWorkerPlugin()],
  build: {
    target: 'es2020',
    sourcemap: false,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
