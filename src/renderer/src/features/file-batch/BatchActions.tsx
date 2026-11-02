import type { ReactNode } from 'react';
import { formatBytes } from '../../../../shared/format.ts';
import { t } from '../../../../shared/i18n/index.ts';
import type { Batch, BatchFile } from './batch-store.ts';

interface Savings {
  bytes: number;
  percent: number;
}

function computeSavings(files: BatchFile[]): Savings | null {
  const finished = files.filter((file) => file.status === 'done' && file.result?.reducesSize);
  const before = finished.reduce((total, file) => total + file.result!.bytesBefore, 0);
  const after = finished.reduce((total, file) => total + file.result!.bytesAfter, 0);
  return before > after ? { bytes: before - after, percent: Math.round((1 - after / before) * 100) } : null;
}

interface BatchActionsProps {
  batch: Batch;
  label: string;
  disabled?: boolean;
  onRun: () => void;
  /** Replaces the file count while idle. */
  hint?: ReactNode;
}

export function BatchActions({ batch, label, disabled, onRun, hint }: BatchActionsProps) {
  const { files, running } = batch.use();
  if (!files.length) return null;
  const savings = computeSavings(files);
  const doneCount = files.filter((file) => file.status === 'done').length;

  return (
    <div className="action-bar">
      <span className="action-bar-text">
        {running ? (
          t.batch.progress(doneCount, files.length)
        ) : savings ? (
          <>
            {t.batch.saved} <strong>{formatBytes(savings.bytes)}</strong> ({savings.percent} %)
          </>
        ) : (
          (hint ?? t.batch.fileCount(files.length))
        )}
      </span>
      {!running && (
        <button className="btn btn-ghost" onClick={batch.clear}>
          {t.common.clear}
        </button>
      )}
      {running ? (
        <button className="btn" onClick={batch.cancel}>
          {t.common.cancel}
        </button>
      ) : (
        <button className="btn btn-primary" disabled={disabled} onClick={onRun}>
          {label}
        </button>
      )}
    </div>
  );
}
