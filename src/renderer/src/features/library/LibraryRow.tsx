import { formatDayMonth, formatDayMonthYear, formatDuration, formatTime } from '../../../../shared/format.ts';
import { t } from '../../../../shared/i18n/index.ts';
import type { LibraryItemSummary } from '../../../../shared/transcription.ts';
import { navigate } from '../../app/app-store.ts';
import { Icon } from '../../ui/Icon.tsx';

function relativeDate(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return t.library.today(formatTime(date));
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return t.library.yesterday(formatTime(date));
  return date.getFullYear() === today.getFullYear() ? formatDayMonth(date) : formatDayMonthYear(date);
}

export function LibraryRow({ item }: { item: LibraryItemSummary }) {
  return (
    <button className="row" onClick={() => navigate({ page: 'item', id: item.id })}>
      <span className="row-icon">
        <Icon name={item.kind === 'recording' ? 'record' : 'text'} />
      </span>
      <span className="row-body">
        <span className="row-title">{item.title}</span>
        {item.snippet && <span className="row-detail">{item.snippet}</span>}
      </span>
      {item.status === 'pending' && <span className="tag tag-warning">{t.library.notTranscribed}</span>}
      <span className="row-meta">{formatDuration(item.duration)}</span>
      <span className="row-meta date">{relativeDate(item.createdAt)}</span>
    </button>
  );
}
