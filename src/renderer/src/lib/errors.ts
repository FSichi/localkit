import { decodeIpcError } from '../../../shared/errors.ts';
import { t } from '../../../shared/i18n/index.ts';

/** User-facing message for any error, using the i18n catalog. */
export function describeError(error: unknown): string {
  const { code, detail } = decodeIpcError(error);
  if (code === 'unknown') return detail || t.errors.unknown;
  const entry: string | ((detail: string) => string) = t.errors[code];
  return typeof entry === 'function' ? entry(detail ?? '') : entry;
}

export const isCancellation = (error: unknown) => decodeIpcError(error).code === 'cancelled';
