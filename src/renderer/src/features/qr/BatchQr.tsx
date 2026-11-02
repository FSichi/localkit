import { useMemo, useState } from 'react';
import { t } from '../../../../shared/i18n/index.ts';
import { batchFromList, batchFromRange, type QrBatchEntry } from '../../../../shared/qr-payloads.ts';
import { notify } from '../../app/toasts.ts';
import { invoke } from '../../lib/bridge.ts';
import { Field, Tabs, TextInput } from '../../ui/controls.tsx';
import { ProgressBar } from '../../ui/ProgressBar.tsx';
import { canvasToPngBytes, drawQr, renderQrSvg, type QrStyle } from './qr-rendering.ts';
import { qrStore } from './qr-store.ts';
import { QrStyleFields } from './QrStyleFields.tsx';

type BatchSource = 'list' | 'range';
type BatchFormat = 'png' | 'svg';

const SOURCES: { id: BatchSource; label: string }[] = [
  { id: 'list', label: t.qr.batch.fromList },
  { id: 'range', label: t.qr.batch.fromRange },
];

const FORMATS: { id: BatchFormat; label: string }[] = [
  { id: 'png', label: 'PNG' },
  { id: 'svg', label: 'SVG' },
];

async function writeEntry(folder: string, entry: QrBatchEntry, format: BatchFormat, style: QrStyle, canvas: HTMLCanvasElement) {
  if (format === 'svg') {
    await invoke('files:writeToFolder', folder, entry.fileName, 'svg', await renderQrSvg(entry.payload, style));
    return;
  }
  await drawQr(canvas, entry.payload, style);
  await invoke('files:writeToFolder', folder, entry.fileName, 'png', await canvasToPngBytes(canvas));
}

export function BatchQr() {
  const { style } = qrStore.use();
  const [source, setSource] = useState<BatchSource>('list');
  const [list, setList] = useState('');
  const [range, setRange] = useState({ first: '1', last: '100', padding: '3' });
  const [template, setTemplate] = useState('https://');
  const [prefix, setPrefix] = useState('QR_');
  const [format, setFormat] = useState<BatchFormat>('png');
  const [fraction, setFraction] = useState<number | null>(null);

  const entries = useMemo(() => {
    if (source === 'list') return batchFromList(list, template, prefix);
    return batchFromRange(Number(range.first) || 0, Number(range.last) || 0, Number(range.padding) || 0, template, prefix);
  }, [source, list, range, template, prefix]);

  const generate = async () => {
    const folder = await invoke('dialog:pickFolder');
    if (!folder) return;
    const canvas = document.createElement('canvas');
    setFraction(0);
    for (const [index, entry] of entries.entries()) {
      await writeEntry(folder, entry, format, style, canvas);
      setFraction((index + 1) / entries.length);
    }
    setFraction(null);
    notify(t.qr.batch.done(entries.length), { action: { label: t.common.open, run: () => invoke('shell:openPath', folder) } });
  };

  return (
    <div className="panel">
      <Tabs options={SOURCES} value={source} onChange={setSource} />
      {source === 'list' ? (
        <Field label={t.qr.batch.codes}>
          <textarea className="input textarea" rows={6} value={list} placeholder={t.qr.batch.codesPlaceholder} onChange={(event) => setList(event.target.value)} />
        </Field>
      ) : (
        <div className="panel-row">
          <Field label={t.qr.batch.first}>
            <TextInput value={range.first} onChange={(first) => setRange({ ...range, first })} />
          </Field>
          <Field label={t.qr.batch.last}>
            <TextInput value={range.last} onChange={(last) => setRange({ ...range, last })} />
          </Field>
          <Field label={t.qr.batch.padding}>
            <TextInput value={range.padding} onChange={(padding) => setRange({ ...range, padding })} />
          </Field>
        </div>
      )}
      <div className="panel-row">
        <Field label={t.qr.batch.template} wide>
          <TextInput value={template} placeholder={t.qr.batch.templatePlaceholder} onChange={setTemplate} />
        </Field>
        <Field label={t.qr.batch.prefix}>
          <TextInput value={prefix} onChange={setPrefix} />
        </Field>
        <Field label={t.qr.batch.format}>
          <Tabs options={FORMATS} value={format} onChange={setFormat} />
        </Field>
      </div>
      <QrStyleFields style={style} onChange={(changes) => qrStore.set({ style: { ...style, ...changes } })} />
      {fraction != null && <ProgressBar fraction={fraction} />}
      <div className="action-bar">
        <span className="action-bar-text">{entries[0] ? t.qr.batch.preview(entries[0].fileName, entries[0].payload) : t.qr.batch.empty}</span>
        <button className="btn btn-primary" disabled={!entries.length || fraction != null} onClick={generate}>
          {t.qr.batch.run(entries.length)}
        </button>
      </div>
    </div>
  );
}
