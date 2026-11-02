import { t } from '../../../../shared/i18n/index.ts';
import { Field, Select } from '../../ui/controls.tsx';
import type { QrStyle } from './qr-rendering.ts';

const CORRECTION_LEVELS: { id: QrStyle['correction']; label: string }[] = [
  { id: 'L', label: t.qr.correction.low },
  { id: 'M', label: t.qr.correction.medium },
  { id: 'Q', label: t.qr.correction.high },
  { id: 'H', label: t.qr.correction.maximum },
];

const SIZES: { id: number; label: string }[] = [
  { id: 512, label: '512 px' },
  { id: 1024, label: '1024 px' },
  { id: 2048, label: '2048 px' },
];

export function QrStyleFields({ style, onChange, correctionLocked }: { style: QrStyle; onChange: (changes: Partial<QrStyle>) => void; correctionLocked?: boolean }) {
  return (
    <div className="panel-row">
      <Field label={t.qr.size}>
        <Select value={style.size} options={SIZES} onChange={(size) => onChange({ size })} />
      </Field>
      <Field label={t.qr.correctionLabel}>
        <Select value={correctionLocked ? 'H' : style.correction} options={CORRECTION_LEVELS} onChange={(correction) => onChange({ correction })} />
      </Field>
      <Field label={t.qr.foreground}>
        <input className="color-input" type="color" value={style.foreground} aria-label={t.qr.foreground} onChange={(event) => onChange({ foreground: event.target.value })} />
      </Field>
      <Field label={t.qr.background}>
        <input className="color-input" type="color" value={style.background} aria-label={t.qr.background} onChange={(event) => onChange({ background: event.target.value })} />
      </Field>
    </div>
  );
}
