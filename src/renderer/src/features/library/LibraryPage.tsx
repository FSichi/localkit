import { useEffect, useState } from 'react';
import { t } from '../../../../shared/i18n/index.ts';
import type { LibraryItemSummary } from '../../../../shared/transcription.ts';
import { appStore, navigate } from '../../app/app-store.ts';
import { invoke } from '../../lib/bridge.ts';
import { Icon } from '../../ui/Icon.tsx';
import { Page, PageHeader } from '../../ui/layout.tsx';
import { LibraryRow } from './LibraryRow.tsx';

const SEARCH_DEBOUNCE_MS = 150;

export function LibraryPage() {
  const { libraryRevision } = appStore.use();
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<LibraryItemSummary[] | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => invoke('library:list', query).then(setItems), query ? SEARCH_DEBOUNCE_MS : 0);
    return () => clearTimeout(timer);
  }, [query, libraryRevision]);

  return (
    <Page>
      <PageHeader title={t.library.title} subtitle={t.library.subtitle} />
      <label className="search">
        <Icon name="search" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.library.searchPlaceholder} />
      </label>

      {items && items.length > 0 && (
        <div className="rows">
          {items.map((item) => (
            <LibraryRow key={item.id} item={item} />
          ))}
        </div>
      )}

      {items && !items.length && (
        <div className="empty">
          {query ? (
            <p>{t.library.noResults(query)}</p>
          ) : (
            <>
              <p>{t.library.empty}</p>
              <div className="empty-actions">
                <button className="btn" onClick={() => navigate({ page: 'transcribe' })}>
                  {t.library.transcribeFile}
                </button>
                <button className="btn" onClick={() => navigate({ page: 'record' })}>
                  {t.record.title}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </Page>
  );
}
