import { useEffect, useState } from 'react';
import { formatBytes } from '../../../../shared/format.ts';
import { t } from '../../../../shared/i18n/index.ts';
import { invoke } from '../../lib/bridge.ts';
import { Dialog } from '../../ui/Dialog.tsx';
import type { BatchFile } from '../file-batch/batch-store.ts';

export function CompareDialog({ file, onClose }: { file: BatchFile; onClose: () => void }) {
  const [urls, setUrls] = useState<{ before: string; after: string } | null>(null);
  const [split, setSplit] = useState(50);

  useEffect(() => {
    Promise.all([invoke('files:previewUrl', file.path), invoke('files:previewUrl', file.result!.output!)]).then(([before, after]) => setUrls({ before, after }));
  }, [file]);

  return (
    <Dialog label={t.images.compare} wide onDismiss={onClose}>
      <h2>{file.name}</h2>
      {urls && (
        <div className="compare">
          <img src={urls.after} alt={t.images.after} />
          <img src={urls.before} alt={t.images.before} style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }} />
          <span className="compare-divider" style={{ left: `${split}%` }} />
          <input className="compare-slider" type="range" min={0} max={100} value={split} aria-label={t.images.compare} onChange={(event) => setSplit(Number(event.target.value))} />
        </div>
      )}
      <div className="compare-legend">
        <span>
          {t.images.before}: {formatBytes(file.result!.bytesBefore)}
        </span>
        <span>
          {t.images.after}: {formatBytes(file.result!.bytesAfter)}
        </span>
      </div>
      <div className="dialog-actions">
        <button className="btn btn-primary" autoFocus onClick={onClose}>
          {t.common.done}
        </button>
      </div>
    </Dialog>
  );
}
