/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

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
      const publicDir = new URL('./public/', import.meta.url);
      // 山マスター（public/master/）もプリキャッシュし、一度開けばオフラインで検索できるようにする
      const masterDir = new URL('./master/', publicDir);
      const masterFiles = existsSync(masterDir) ? readdirSync(masterDir).filter((f) => f.endsWith('.json')).map((f) => `master/${f}`) : [];
      const publicFiles = ['manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', ...masterFiles];
      const precache = ['./', ...files.map((f) => `./${f}`), ...publicFiles.map((f) => `./${f}`)];
      // 公開ファイルの中身（manifest.json など固定名のファイル）が変わっても SW が更新されるよう内容もハッシュに含める
      const hash = createHash('sha256').update(precache.join('|'));
      for (const f of publicFiles) hash.update(readFileSync(new URL(f, publicDir)));
      const version = hash.digest('hex').slice(0, 12);
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
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [preact(), serviceWorkerPlugin()],
  build: {
    target: 'es2020',
    sourcemap: false,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
});
