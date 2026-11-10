// Editing audio by removing parts: what is left, and how FFmpeg is told to keep only that.

export interface TimeRange {
  start: number;
  end: number;
}

/** Shorter cuts are slips of the mouse, not a decision. */
const MIN_CUT_SECONDS = 0.05;

/** Inside the audio, in order, with overlapping or touching cuts joined. */
export function normalizeCuts(cuts: TimeRange[], duration: number): TimeRange[] {
  const clamped = cuts
    .map(({ start, end }) => ({ start: Math.max(0, Math.min(start, end)), end: Math.min(duration, Math.max(start, end)) }))
    .filter(({ start, end }) => end - start >= MIN_CUT_SECONDS)
    .sort((a, b) => a.start - b.start);
  const joined: TimeRange[] = [];
  for (const cut of clamped) {
    const last = joined.at(-1);
    if (last && cut.start <= last.end) last.end = Math.max(last.end, cut.end);
    else joined.push({ ...cut });
  }
  return joined;
}

export function keptRanges(cuts: TimeRange[], duration: number): TimeRange[] {
  const kept: TimeRange[] = [];
  let start = 0;
  for (const cut of normalizeCuts(cuts, duration)) {
    if (cut.start > start) kept.push({ start, end: cut.start });
    start = cut.end;
  }
  if (start < duration) kept.push({ start, end: duration });
  return kept;
}

export const editedDuration = (cuts: TimeRange[], duration: number) => keptRanges(cuts, duration).reduce((total, { start, end }) => total + end - start, 0);

/** Removing everything except the selection. */
export const cutsAround = ({ start, end }: TimeRange, duration: number): TimeRange[] => [
  { start: 0, end: start },
  { start: end, end: duration },
];

/** Where playback continues when it reaches a removed part, or null when it is not in one. */
export function skipRemoved(time: number, cuts: TimeRange[]): number | null {
  return cuts.find(({ start, end }) => time >= start && time < end)?.end ?? null;
}

/** An FFmpeg audio filter that drops the removed parts and closes the gaps. */
export function removalFilter(cuts: TimeRange[], duration: number): string {
  const removed = normalizeCuts(cuts, duration).map(({ start, end }) => `between(t,${start.toFixed(3)},${end.toFixed(3)})`);
  return removed.length ? `aselect='not(${removed.join('+')})',asetpts=N/SR/TB` : 'anull';
}
