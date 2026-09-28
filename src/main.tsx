import { render } from 'preact';
import { App } from './ui/App';
import { IdbRepository } from './data/idbRepository';
import { MemoryRepository } from './data/memoryRepository';
import type { Repository } from './data/repository';
import { AppStore } from './state/store';
import './styles/app.css';

function createRepository(): Repository {
  try {
    if ('indexedDB' in window && window.indexedDB) return new IdbRepository();
  } catch {
    /* プライベートモード等で IndexedDB が使えない場合 */
  }
  console.warn('IndexedDB が使えないため、メモリ保存で起動します（再読み込みで消えます）');
  return new MemoryRepository();
}

const store = new AppStore(createRepository());
render(<App store={store} />, document.getElementById('app')!);

store.init().catch((e) => {
  console.error(e);
  document.getElementById('app')!.innerHTML =
    '<div class="loading"><p>データの読み込みに失敗しました。ブラウザの設定（ストレージ）を確認してください。</p></div>';
});

// 端末内データが勝手に消されないよう永続ストレージを要求（対応ブラウザのみ）
navigator.storage?.persist?.().catch(() => undefined);

// PWA: 本番ビルドのみ Service Worker を登録
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('SW registration failed', e));
  });
}

// E2E テストやデバッグ用
(window as unknown as { __yamaStore: AppStore }).__yamaStore = store;
