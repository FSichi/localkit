import { t } from '../../../../shared/i18n/index.ts';
import type { ImageFormat } from '../../../../shared/jobs.ts';
import { Field, Select, Tabs, Toggle } from '../../ui/controls.tsx';
import { OutputFolderPicker } from '../file-batch/OutputFolderPicker.tsx';
import { imageOptions } from './image-store.ts';

const FORMATS: { id: ImageFormat; label: string }[] = [
  { id: 'same', label: t.images.formats.same },
  { id: 'webp', label: 'WebP' },
  { id: 'avif', label: 'AVIF' },
  { id: 'jpeg', label: 'JPG' },
  { id: 'png', label: 'PNG' },
];

const SIDES: { id: number; label: string }[] = [
  { id: 0, label: t.images.originalSize },
  { id: 3840, label: '3840 px' },
  { id: 2560, label: '2560 px' },
  { id: 1920, label: '1920 px' },
  { id: 1280, label: '1280 px' },
  { id: 800, label: '800 px' },
];

export function ImageOptionsPanel() {
  const options = imageOptions.use();
  const supportsLossless = options.format !== 'jpeg';
  const lossless = options.lossless && supportsLossless;

  return (
    <div className="panel">
      <div className="panel-row">
        <Field label={t.images.format}>
          <Tabs options={FORMATS} value={options.format} onChange={(format) => imageOptions.set({ format })} />
        </Field>
        <Field label={t.images.maxSide}>
          <Select value={options.maxSide ?? 0} options={SIDES} onChange={(side) => imageOptions.set({ maxSide: side || null })} />
        </Field>
      </div>
      <div className="panel-row">
        <Field label={t.images.quality(options.quality)} wide>
          <input
            className="range"
            type="range"
            min={30}
            max={100}
            value={options.quality}
            disabled={lossless}
            aria-label={t.images.quality(options.quality)}
            onChange={(event) => imageOptions.set({ quality: Number(event.target.value) })}
          />
        </Field>
        <Toggle label={t.images.lossless} checked={lossless} disabled={!supportsLossless} onChange={(value) => imageOptions.set({ lossless: value })} />
        <Toggle label={t.images.stripMetadata} checked={options.stripMetadata} onChange={(stripMetadata) => imageOptions.set({ stripMetadata })} />
      </div>
      <OutputFolderPicker />
    </div>
  );
}
