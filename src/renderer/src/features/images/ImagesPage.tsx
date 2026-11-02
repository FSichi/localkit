import { useState } from 'react';
import { formatBytes } from '../../../../shared/format.ts';
import { t } from '../../../../shared/i18n/index.ts';
import { Page, PageHeader } from '../../ui/layout.tsx';
import type { BatchFile } from '../file-batch/batch-store.ts';
import { BatchTool } from '../file-batch/BatchTool.tsx';
import { CompareDialog } from './CompareDialog.tsx';
import { imageBatch, imageOptions } from './image-store.ts';
import { ImageOptionsPanel } from './ImageOptionsPanel.tsx';
import { useSizeEstimate } from './useSizeEstimate.ts';

export function ImagesPage() {
  const { files } = imageBatch.use();
  const options = imageOptions.use();
  const [comparing, setComparing] = useState<BatchFile | null>(null);
  const sample = files.find((file) => !file.analyzing && !file.unreadable);
  const estimate = useSizeEstimate(sample?.path, options);

  return (
    <Page>
      <PageHeader title={t.images.title} subtitle={t.images.subtitle} />
      <BatchTool
        batch={imageBatch}
        kinds={['image']}
        dropTitle={t.images.dropTitle}
        dropDetail={t.images.dropDetail}
        actionLabel={t.images.run(files.length)}
        actionHint={sample && estimate ? t.images.estimate(sample.name, formatBytes(sample.bytes), formatBytes(estimate)) : undefined}
        onRun={() => imageBatch.run((file) => ({ type: 'image.process', path: file.path, options: imageOptions.get() }))}
        onCompare={setComparing}
      >
        {files.length > 0 && <ImageOptionsPanel />}
      </BatchTool>
      {comparing && <CompareDialog file={comparing} onClose={() => setComparing(null)} />}
    </Page>
  );
}
