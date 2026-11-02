import { t } from '../../../../shared/i18n/index.ts';
import type { OcrOutputFormat } from '../../../../shared/jobs.ts';
import { findOcrModel, OCR_MODELS } from '../../../../shared/ocr-models.ts';
import { currentOcrModel, updateSettings } from '../../app/app-store.ts';
import { notify } from '../../app/toasts.ts';
import { invoke } from '../../lib/bridge.ts';
import { Field, Select, Tabs } from '../../ui/controls.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { Page, PageHeader, Section } from '../../ui/layout.tsx';
import { BatchTool } from '../file-batch/BatchTool.tsx';
import { OutputFolderPicker } from '../file-batch/OutputFolderPicker.tsx';
import { ocrBatch, ocrOptions, runOcr } from './ocr-store.ts';

const FORMATS: { id: OcrOutputFormat; label: string }[] = [
  { id: 'text', label: t.ocr.formats.text },
  { id: 'searchablePdf', label: t.ocr.formats.searchablePdf },
];

const ENGINES = OCR_MODELS.map(({ id, tier }) => ({ id, label: t.ocr.engines[tier].name }));

function Options() {
  const { format } = ocrOptions.use();
  const engine = currentOcrModel();
  return (
    <div className="panel">
      <div className="panel-row">
        <Field label={t.ocr.format}>
          <Tabs options={FORMATS} value={format} onChange={(value) => ocrOptions.set({ format: value })} />
        </Field>
        <Field label={t.ocr.engine}>
          <Select value={engine.id} options={ENGINES} onChange={(ocrModelId) => updateSettings({ ocrModelId })} />
        </Field>
        <p className="field-note">{t.ocr.engines[findOcrModel(engine.id).tier].description}</p>
      </div>
      <OutputFolderPicker />
    </div>
  );
}

function Results() {
  const { files } = ocrBatch.use();
  const { texts } = ocrOptions.use();
  const read = files.filter((file) => texts[file.id] !== undefined);
  if (!read.length) return null;

  const copy = async (text: string) => {
    await invoke('clipboard:writeText', text);
    notify(t.ocr.copied);
  };

  return (
    <Section title={t.ocr.results}>
      <div className="stack">
        {read.map((file) => (
          <div key={file.id} className="panel">
            <div className="ocr-result-header">
              <strong>{file.name}</strong>
              <button className="btn btn-small" onClick={() => copy(texts[file.id])}>
                <Icon name="copy" size={13} /> {t.common.copy}
              </button>
            </div>
            {texts[file.id] ? <textarea className="ocr-text" readOnly value={texts[file.id]} aria-label={file.name} /> : <p className="muted">{t.ocr.noText}</p>}
          </div>
        ))}
      </div>
    </Section>
  );
}

export function OcrPage() {
  const { files } = ocrBatch.use();
  return (
    <Page>
      <PageHeader title={t.ocr.title} subtitle={t.ocr.subtitle} />
      <BatchTool batch={ocrBatch} kinds={['image', 'pdf']} dropTitle={t.ocr.dropTitle} dropDetail={t.ocr.dropDetail} actionLabel={t.ocr.run(files.length)} onRun={runOcr}>
        {files.length > 0 && <Options />}
      </BatchTool>
      <Results />
      {!files.length && (
        <p className="footnote">
          <Icon name="lock" size={13} /> {t.ocr.privacy}
        </p>
      )}
    </Page>
  );
}
