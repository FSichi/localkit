// Number and time formatting shared by the UI and the exports.

const LOCALE = 'es-AR';

export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hours ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${pad(minutes)}:${pad(rest)}`;
}

export function formatSrtClock(seconds: number): string {
  const ms = Math.round(Math.max(0, seconds) * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  const clock = `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor((ms % 3600000) / 60000))}:${pad(Math.floor((ms % 60000) / 1000))}`;
  return `${clock},${String(ms % 1000).padStart(3, '0')}`;
}

export function formatDuration(seconds: number): string {
  if (!isFinite(seconds)) return '…';
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toLocaleString(LOCALE, { maximumFractionDigits: 1 })} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toLocaleString(LOCALE, { maximumFractionDigits: 1 })} MB`;
  return `${Math.max(1, Math.round(bytes / 1e3))} KB`;
}

export const formatNumber = (value: number) => value.toLocaleString(LOCALE);

export function formatLongDate(iso: string): string {
  return new Date(iso).toLocaleString(LOCALE, { dateStyle: 'long', timeStyle: 'short', hour12: false });
}

export function formatMediumDate(iso: string): string {
  return new Date(iso).toLocaleString(LOCALE, { dateStyle: 'medium', timeStyle: 'short', hour12: false });
}

export function formatDayMonth(date: Date): string {
  return date.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' });
}

export function formatDayMonthYear(date: Date): string {
  return date.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit', hour12: false });
}
