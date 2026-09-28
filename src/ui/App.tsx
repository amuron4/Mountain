import { useEffect } from 'preact/hooks';
import { StoreContext, useStore } from '../state/hooks';
import { useRoute, type Route } from '../state/router';
import type { AppStore } from '../state/store';
import { Icon } from './components/Icon';
import { Overlays } from './components/overlay';
import { ComparePage } from './pages/ComparePage';
import { HomePage } from './pages/HomePage';
import { MountainDetailPage } from './pages/MountainDetailPage';
import { MountainFormPage } from './pages/MountainFormPage';
import { MountainListPage } from './pages/MountainListPage';
import { RecordDetailPage } from './pages/RecordDetailPage';
import { RecordFormPage } from './pages/RecordFormPage';
import { RecordListPage } from './pages/RecordListPage';
import { SettingsPage } from './pages/SettingsPage';
import { TagManagerPage } from './pages/TagManagerPage';
import { TodayPage } from './pages/TodayPage';
import { applyTheme, watchSystemTheme } from './theme';

const NAV = [
  { href: '#/', label: 'ホーム', icon: 'home', match: ['home'] },
  { href: '#/mountains', label: '山', icon: 'mountain', match: ['mountains', 'mountain', 'mountainNew', 'mountainEdit', 'compare'] },
  { href: '#/records', label: '記録', icon: 'book', match: ['records', 'record', 'recordNew', 'recordEdit'] },
  { href: '#/today', label: '今日どこ', icon: 'compass', match: ['today'] },
  { href: '#/settings', label: '設定', icon: 'settings', match: ['settings', 'tags'] },
];

function Page({ route }: { route: Route }) {
  switch (route.name) {
    case 'home':
      return <HomePage />;
    case 'mountains':
      return <MountainListPage />;
    case 'mountainNew':
      return <MountainFormPage />;
    case 'mountainEdit':
      return <MountainFormPage id={route.params.id} />;
    case 'mountain':
      return <MountainDetailPage id={route.params.id} />;
    case 'records':
      return <RecordListPage />;
    case 'recordNew':
      return <RecordFormPage mountainId={route.query.get('mountain') ?? undefined} />;
    case 'recordEdit':
      return <RecordFormPage id={route.params.id} />;
    case 'record':
      return <RecordDetailPage id={route.params.id} />;
    case 'compare':
      return <ComparePage />;
    case 'today':
      return <TodayPage initialMoods={route.query.get('moods')?.split(',').filter(Boolean) ?? []} />;
    case 'settings':
      return <SettingsPage />;
    case 'tags':
      return <TagManagerPage />;
    default:
      return (
        <div class="page">
          <div class="empty">
            ページが見つかりません。<a href="#/">ホームへ</a>
          </div>
        </div>
      );
  }
}

function Shell() {
  const store = useStore();
  const route = useRoute();
  const theme = store.state.settings.theme;

  useEffect(() => applyTheme(theme), [theme]);
  useEffect(() => watchSystemTheme(() => store.state.settings.theme), [store]);
  // 画面遷移時は先頭へスクロール
  useEffect(() => window.scrollTo(0, 0), [route.path]);

  return (
    <div class="app">
      <main class="main">{store.ready ? <Page route={route} key={route.path} /> : <div class="loading">読み込み中…</div>}</main>
      <nav class="bottom-nav" aria-label="メインメニュー">
        {NAV.map((n) => (
          <a href={n.href} aria-current={n.match.includes(route.name) ? 'page' : undefined} key={n.href}>
            <span class="nav-icon">
              <Icon name={n.icon} size={22} />
            </span>
            {n.label}
          </a>
        ))}
      </nav>
      <Overlays />
    </div>
  );
}

export function App({ store }: { store: AppStore }) {
  return (
    <StoreContext.Provider value={store}>
      <Shell />
    </StoreContext.Provider>
  );
}
