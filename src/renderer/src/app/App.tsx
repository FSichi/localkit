import { useEffect } from 'react';
import { t } from '../../../shared/i18n/index.ts';
import { HomePage } from '../features/home/HomePage.tsx';
import { ItemPage } from '../features/library/ItemPage.tsx';
import { SettingsPage } from '../features/settings/SettingsPage.tsx';
import { startUpdateFlow } from '../features/updates/update-store.ts';
import { UpdateDialogs } from '../features/updates/UpdateDialogs.tsx';
import { invoke } from '../lib/bridge.ts';
import { appStore, navigate, touchLibrary, type Route } from './app-store.ts';
import { Sidebar } from './Sidebar.tsx';
import { notify, toasts } from './toasts.ts';
import { TOOLS } from './tools.ts';

function Toaster() {
  const { items } = toasts.use();
  return (
    <div className="toasts" aria-live="polite">
      {items.map((toast) => (
        <div key={toast.id} className={`toast ${toast.kind === 'error' ? 'error' : ''}`}>
          <span>{toast.text}</span>
          {toast.action && (
            <button className="toast-action" onClick={toast.action.run}>
              {toast.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function CurrentPage({ route }: { route: Route }) {
  if (route.page === 'home') return <HomePage />;
  if (route.page === 'settings') return <SettingsPage />;
  if (route.page === 'item') return <ItemPage key={route.id} id={route.id} />;
  const tool = TOOLS.find(({ id }) => id === route.page)!;
  return <tool.Page />;
}

async function recoverUnfinishedRecordings() {
  const count = await invoke('recording:recover');
  if (!count) return;
  touchLibrary();
  notify(t.record.recovered(count), { action: { label: t.common.view, run: () => navigate({ page: 'library' }) } });
}

export function App() {
  const { route, ready } = appStore.use();

  useEffect(() => {
    if (ready) startUpdateFlow();
  }, [ready]);

  useEffect(() => {
    recoverUnfinishedRecordings();
  }, []);

  if (!ready) return <div className="drag-region" />;

  return (
    <div className="app">
      <div className="drag-region" />
      <Sidebar />
      <main className="view">
        <CurrentPage route={route} />
      </main>
      <UpdateDialogs />
      <Toaster />
    </div>
  );
}
