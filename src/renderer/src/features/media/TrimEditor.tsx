import { useEffect, useRef, useState } from 'react';
import { formatClock } from '../../../../shared/format.ts';
import { t } from '../../../../shared/i18n/index.ts';
import { invoke } from '../../lib/bridge.ts';
import { Toggle } from '../../ui/controls.tsx';
import type { BatchFile } from '../file-batch/batch-store.ts';
import { OutputFolderPicker } from '../file-batch/OutputFolderPicker.tsx';
import { mediaBatch } from './media-store.ts';

const MIN_SELECTION_SECONDS = 0.1;

export function TrimEditor({ file }: { file: BatchFile }) {
  const duration = file.duration ?? 0;
  const player = useRef<HTMLVideoElement>(null);
  const { running } = mediaBatch.use();
  const [url, setUrl] = useState<string | null>(null);
  const [range, setRange] = useState({ start: 0, end: duration });
  const [exact, setExact] = useState(false);

  useEffect(() => {
    invoke('files:mediaUrl', file.path).then(setUrl);
  }, [file.path]);
  useEffect(() => setRange({ start: 0, end: duration }), [duration]);

  const seekTo = (seconds: number) => {
    if (player.current) player.current.currentTime = seconds;
  };
  const setStart = (start: number) => {
    setRange({ ...range, start: Math.min(start, range.end - MIN_SELECTION_SECONDS) });
    seekTo(start);
  };
  const setEnd = (end: number) => {
    setRange({ ...range, end: Math.max(end, range.start + MIN_SELECTION_SECONDS) });
    seekTo(end);
  };
  const currentTime = () => player.current?.currentTime ?? 0;

  return (
    <div className="panel">
      {url && <video ref={player} className={`trim-player ${file.kind === 'audio' ? 'audio-only' : ''}`} src={url} controls />}
      <div className="trim-row">
        <button className="btn btn-small" onClick={() => setStart(currentTime())}>
          {t.media.markStart}
        </button>
        <span className="numeric">{formatClock(range.start)}</span>
        <input className="range" type="range" min={0} max={duration} step={0.1} value={range.start} aria-label={t.media.markStart} onChange={(event) => setStart(Number(event.target.value))} />
      </div>
      <div className="trim-row">
        <button className="btn btn-small" onClick={() => setEnd(currentTime())}>
          {t.media.markEnd}
        </button>
        <span className="numeric">{formatClock(range.end)}</span>
        <input className="range" type="range" min={0} max={duration} step={0.1} value={range.end} aria-label={t.media.markEnd} onChange={(event) => setEnd(Number(event.target.value))} />
      </div>
      <div className="panel-row">
        <Toggle label={t.media.exactTrim} checked={exact} onChange={setExact} />
        <span className="muted small">{t.media.selection(formatClock(range.end - range.start))}</span>
      </div>
      <OutputFolderPicker />
      <div className="action-bar">
        <span className="action-bar-text">{t.media.exactTrimHint}</span>
        <button
          className="btn btn-primary"
          disabled={running}
          onClick={() => mediaBatch.run(({ path }) => ({ type: 'media.trim', path, options: { ...range, exact } }), [file.id])}
        >
          {t.media.runTrim}
        </button>
      </div>
    </div>
  );
}
