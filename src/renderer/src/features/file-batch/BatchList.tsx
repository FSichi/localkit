import { formatBytes, formatClock } from '../../../../shared/format.ts';
import { t } from '../../../../shared/i18n/index.ts';
import { invoke } from '../../lib/bridge.ts';
import { Icon, type IconName } from '../../ui/Icon.tsx';
import { ProgressBar } from '../../ui/ProgressBar.tsx';
import type { Batch, BatchFile } from './batch-store.ts';

const KIND_ICONS: Partial<Record<BatchFile['kind'], IconName>> = { video: 'video', audio: 'wave', pdf: 'file', image: 'image' };

function describeFile(file: BatchFile): string {
  if (file.analyzing) return t.batch.analyzing;
  const parts = [formatBytes(file.bytes)];
  if (file.width && file.height) parts.push(`${file.width} × ${file.height}`);
  if (file.duration) parts.push(formatClock(file.duration));
  if (file.pages) parts.push(t.batch.pages(file.pages));
  if (file.isProtected) parts.push(t.batch.protected);
  return parts.join(' · ');
}

function FileResult({ file, onCompare }: { file: BatchFile; onCompare?: (file: BatchFile) => void }) {
  const result = file.result!;
  if (result.noGain) return <span className="tag">{t.batch.alreadyOptimized}</span>;
  const saved = 1 - result.bytesAfter / result.bytesBefore;
  return (
    <>
      <span className="row-meta numeric">{formatBytes(result.bytesAfter)}</span>
      {result.reducesSize && saved > 0.005 && <span className="tag tag-ok">−{Math.round(saved * 100)} %</span>}
      {onCompare && (
        <button className="btn btn-ghost btn-small" onClick={() => onCompare(file)}>
          {t.images.compare}
        </button>
      )}
      <button className="btn btn-ghost btn-small btn-icon" title={t.common.showInFolder} onClick={() => invoke('shell:showItem', result.output!)}>
        <Icon name="folder" size={14} />
      </button>
    </>
  );
}

interface BatchRowProps {
  file: BatchFile;
  batch: Batch;
  sortable?: boolean;
  onCompare?: (file: BatchFile) => void;
}

function BatchRow({ file, batch, sortable, onCompare }: BatchRowProps) {
  const { running } = batch.use();
  return (
    <div className="batch-row">
      {file.thumbnail ? (
        <img className="batch-thumbnail" src={file.thumbnail} alt="" />
      ) : (
        <span className="batch-thumbnail empty">
          <Icon name={KIND_ICONS[file.kind] ?? 'file'} />
        </span>
      )}
      <span className="row-body">
        <span className="row-title" title={file.path}>
          {file.name}
        </span>
        <span className={`row-detail ${file.status === 'failed' ? 'danger' : ''}`}>{file.status === 'failed' ? file.errorMessage : (file.detail ?? describeFile(file))}</span>
        {file.status === 'processing' && <ProgressBar fraction={file.fraction || null} />}
      </span>
      {file.status === 'done' && file.result && <FileResult file={file} onCompare={onCompare} />}
      {sortable && !running && (
        <>
          <button className="btn btn-ghost btn-small btn-icon" title={t.common.moveUp} onClick={() => batch.move(file.id, -1)}>
            <Icon name="up" size={14} />
          </button>
          <button className="btn btn-ghost btn-small btn-icon" title={t.common.moveDown} onClick={() => batch.move(file.id, 1)}>
            <Icon name="down" size={14} />
          </button>
        </>
      )}
      {!running && (
        <button className="btn btn-ghost btn-small btn-icon" title={t.common.remove} onClick={() => batch.remove(file.id)}>
          <Icon name="close" size={14} />
        </button>
      )}
    </div>
  );
}

export function BatchList({ batch, sortable, onCompare }: { batch: Batch; sortable?: boolean; onCompare?: (file: BatchFile) => void }) {
  const { files } = batch.use();
  if (!files.length) return null;
  return (
    <div className="rows batch-list">
      {files.map((file) => (
        <BatchRow key={file.id} file={file} batch={batch} sortable={sortable} onCompare={onCompare} />
      ))}
    </div>
  );
}
