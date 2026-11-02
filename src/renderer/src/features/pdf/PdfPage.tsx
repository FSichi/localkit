import { useState } from 'react';
import { t } from '../../../../shared/i18n/index.ts';
import type { CompressionLevel, JobRequest, PdfPageLayout, PdfSplitMode } from '../../../../shared/jobs.ts';
import { notifySaved, notifyError } from '../../app/toasts.ts';
import { invoke } from '../../lib/bridge.ts';
import { describeError } from '../../lib/errors.ts';
import { Field, Tabs, TextInput } from '../../ui/controls.tsx';
import { Page, PageHeader } from '../../ui/layout.tsx';
import { ProgressBar } from '../../ui/ProgressBar.tsx';
import { runSingleJob, type Batch } from '../file-batch/batch-store.ts';
import { BatchTool } from '../file-batch/BatchTool.tsx';
import { OutputFolderPicker } from '../file-batch/OutputFolderPicker.tsx';
import { OrganizeMode } from './OrganizeMode.tsx';
import { pdfBatch, pdfImagesBatch, pdfOptions, setPdfMode, type PdfMode } from './pdf-store.ts';

const MODE_TABS: { id: PdfMode; label: string }[] = [
  { id: 'merge', label: t.pdf.modes.merge },
  { id: 'split', label: t.pdf.modes.split },
  { id: 'organize', label: t.pdf.modes.organize },
  { id: 'compress', label: t.pdf.modes.compress },
  { id: 'fromImages', label: t.pdf.modes.fromImages },
];

const LEVELS: { id: CompressionLevel; label: string }[] = [
  { id: 'high', label: t.pdf.levels.high },
  { id: 'medium', label: t.pdf.levels.medium },
  { id: 'low', label: t.pdf.levels.low },
];

const SPLIT_MODES: { id: PdfSplitMode; label: string }[] = [
  { id: 'ranges', label: t.pdf.splitModes.ranges },
  { id: 'everyPage', label: t.pdf.splitModes.everyPage },
];

const LAYOUTS: { id: PdfPageLayout; label: string }[] = [
  { id: 'a4', label: t.pdf.layouts.a4 },
  { id: 'imageSize', label: t.pdf.layouts.imageSize },
];

/** Tools that produce one PDF from many files: asks where to save it and tracks a single progress. */
function useCombinedPdf(batch: Batch, defaultName: string, buildRequest: (paths: string[], output: string) => JobRequest) {
  const [fraction, setFraction] = useState<number | null>(null);
  const run = async () => {
    const output = await invoke('dialog:pickSavePath', defaultName, 'pdf');
    if (!output) return;
    setFraction(0);
    try {
      await runSingleJob(buildRequest(batch.get().files.map((file) => file.path), output), setFraction);
      notifySaved(t.pdf.saved, output);
    } catch (error) {
      notifyError(describeError(error));
    }
    setFraction(null);
  };
  return { run, fraction };
}

function MergeMode() {
  const { files } = pdfBatch.use();
  const { run, fraction } = useCombinedPdf(pdfBatch, t.pdf.defaultMergedName, (paths, output) => ({ type: 'pdf.merge', paths, output }));
  return (
    <BatchTool
      batch={pdfBatch}
      kinds={['pdf']}
      dropTitle={t.pdf.dropTitle}
      dropDetail={t.pdf.mergeDetail}
      actionLabel={t.pdf.runMerge(files.length)}
      actionDisabled={files.length < 2 || fraction != null}
      onRun={run}
      sortable
    >
      {fraction != null && <ProgressBar fraction={fraction} />}
    </BatchTool>
  );
}

function SplitMode() {
  const { files } = pdfBatch.use();
  const { splitMode, ranges } = pdfOptions.use();
  return (
    <BatchTool
      batch={pdfBatch}
      kinds={['pdf']}
      dropTitle={t.pdf.dropTitle}
      dropDetail={t.pdf.splitDetail}
      actionLabel={t.pdf.runSplit}
      actionDisabled={splitMode === 'ranges' && !ranges.trim()}
      onRun={() => pdfBatch.run((file) => ({ type: 'pdf.split', path: file.path, mode: splitMode, ranges }))}
    >
      {files.length > 0 && (
        <div className="panel">
          <div className="panel-row">
            <Field label={t.pdf.splitBy}>
              <Tabs options={SPLIT_MODES} value={splitMode} onChange={(value) => pdfOptions.set({ splitMode: value })} />
            </Field>
            {splitMode === 'ranges' && (
              <Field label={t.pdf.pages} wide>
                <TextInput value={ranges} placeholder={t.pdf.pagesPlaceholder} onChange={(value) => pdfOptions.set({ ranges: value })} />
              </Field>
            )}
          </div>
          <OutputFolderPicker />
        </div>
      )}
    </BatchTool>
  );
}

function CompressMode() {
  const { files } = pdfBatch.use();
  const { level } = pdfOptions.use();
  return (
    <BatchTool
      batch={pdfBatch}
      kinds={['pdf']}
      dropTitle={t.pdf.dropTitle}
      dropDetail={t.pdf.compressDetail}
      actionLabel={t.pdf.runCompress(files.length)}
      onRun={() => pdfBatch.run((file) => ({ type: 'pdf.compress', path: file.path, level }))}
    >
      {files.length > 0 && (
        <div className="panel">
          <Field label={t.pdf.quality}>
            <Tabs options={LEVELS} value={level} onChange={(value) => pdfOptions.set({ level: value })} />
          </Field>
          <p className="muted small">{t.pdf.compressNote}</p>
          <OutputFolderPicker />
        </div>
      )}
    </BatchTool>
  );
}

function FromImagesMode() {
  const { files } = pdfImagesBatch.use();
  const { layout } = pdfOptions.use();
  const { run, fraction } = useCombinedPdf(pdfImagesBatch, t.pdf.defaultImagesName, (paths, output) => ({ type: 'pdf.fromImages', paths, output, layout }));
  return (
    <BatchTool
      batch={pdfImagesBatch}
      kinds={['image']}
      dropTitle={t.pdf.dropImagesTitle}
      dropDetail={t.pdf.imagesDetail}
      actionLabel={t.pdf.runFromImages}
      actionDisabled={!files.length || fraction != null}
      onRun={run}
      sortable
    >
      {files.length > 0 && (
        <div className="panel">
          <Field label={t.pdf.pageSize}>
            <Tabs options={LAYOUTS} value={layout} onChange={(value) => pdfOptions.set({ layout: value })} />
          </Field>
        </div>
      )}
      {fraction != null && <ProgressBar fraction={fraction} />}
    </BatchTool>
  );
}

const MODE_VIEWS = { merge: MergeMode, split: SplitMode, organize: OrganizeMode, compress: CompressMode, fromImages: FromImagesMode };

export function PdfPage() {
  const { mode } = pdfOptions.use();
  const ModeView = MODE_VIEWS[mode];
  return (
    <Page>
      <PageHeader title={t.pdf.title} subtitle={t.pdf.subtitle} />
      <Tabs options={MODE_TABS} value={mode} onChange={setPdfMode} />
      <ModeView />
    </Page>
  );
}
