import { AppError } from './errors.ts';

/** Parses "1-3, 5, 8-" into zero-based page indexes. */
export function parsePageRanges(input: string, pageCount: number): number[] {
  const pages: number[] = [];
  for (const part of input.split(/[,;\s]+/).filter(Boolean)) {
    const match = part.match(/^(\d+)?(-)?(\d+)?$/);
    if (!match || (!match[1] && !match[3])) throw new AppError('pageRangeSyntax', part);
    const first = match[1] ? Number(match[1]) : 1;
    const last = match[2] ? (match[3] ? Number(match[3]) : pageCount) : first;
    if (first < 1 || last > pageCount || first > last) throw new AppError('pageRangeBounds', `${part}|${pageCount}`);
    for (let page = first; page <= last; page++) pages.push(page - 1);
  }
  if (!pages.length) throw new AppError('pageRangeEmpty');
  return pages;
}
