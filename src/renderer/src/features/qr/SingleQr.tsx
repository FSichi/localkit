import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { t } from '../../../../shared/i18n/index.ts';
import { buildQrPayload, EMPTY_QR_FIELDS, type QrFields, type QrKind, type WifiSecurity } from '../../../../shared/qr-payloads.ts';
import { notify, notifySaved } from '../../app/toasts.ts';
import { invoke } from '../../lib/bridge.ts';
import { Field, Select, Tabs, TextInput } from '../../ui/controls.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { canvasToPngBytes, drawQr, renderQrSvg, type QrStyle } from './qr-rendering.ts';
import { qrStore } from './qr-store.ts';
import { QrStyleFields } from './QrStyleFields.tsx';

const KINDS: { id: QrKind; label: string }[] = [
  { id: 'text', label: t.qr.kinds.text },
  { id: 'wifi', label: t.qr.kinds.wifi },
  { id: 'contact', label: t.qr.kinds.contact },
  { id: 'whatsapp', label: t.qr.kinds.whatsapp },
  { id: 'email', label: t.qr.kinds.email },
];

const WIFI_SECURITY: { id: WifiSecurity; label: string }[] = [
  { id: 'WPA', label: 'WPA / WPA2' },
  { id: 'WEP', label: 'WEP' },
  { id: 'nopass', label: t.qr.fields.noPassword },
];

type TextField = Exclude<keyof QrFields, 'security'>;

/** The fields each kind asks for. */
const KIND_FIELDS: Record<QrKind, { key: TextField; label: string; type?: string }[]> = {
  text: [{ key: 'text', label: t.qr.fields.text }],
  wifi: [
    { key: 'ssid', label: t.qr.fields.ssid },
    { key: 'password', label: t.qr.fields.password, type: 'password' },
  ],
  contact: [
    { key: 'name', label: t.qr.fields.name },
    { key: 'company', label: t.qr.fields.company },
    { key: 'phone', label: t.qr.fields.phone },
    { key: 'email', label: t.qr.fields.email },
    { key: 'website', label: t.qr.fields.website },
  ],
  whatsapp: [
    { key: 'phone', label: t.qr.fields.whatsappPhone },
    { key: 'message', label: t.qr.fields.message },
  ],
  email: [
    { key: 'email', label: t.qr.fields.email },
    { key: 'subject', label: t.qr.fields.subject },
    { key: 'message', label: t.qr.fields.message },
  ],
};

function useLogoImage() {
  const [logo, setLogo] = useState<HTMLImageElement | null>(null);
  const pickLogo = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const image = new Image();
    image.onload = () => setLogo(image);
    image.src = URL.createObjectURL(file);
  };
  return { logo, pickLogo, clearLogo: () => setLogo(null) };
}

export function SingleQr() {
  const { style } = qrStore.use();
  const [kind, setKind] = useState<QrKind>('text');
  const [fields, setFields] = useState<QrFields>(EMPTY_QR_FIELDS);
  const { logo, pickLogo, clearLogo } = useLogoImage();
  const canvas = useRef<HTMLCanvasElement>(null);
  const payload = buildQrPayload(kind, fields);

  useEffect(() => {
    if (payload && canvas.current) drawQr(canvas.current, payload, style, logo);
  }, [payload, style, logo]);

  const setStyle = (changes: Partial<QrStyle>) => qrStore.set({ style: { ...style, ...changes } });

  const savePng = async () => {
    const path = await invoke('files:saveAs', `${t.qr.defaultFileName}.png`, 'png', await canvasToPngBytes(canvas.current!));
    if (path) notifySaved(t.qr.saved, path);
  };
  const saveSvg = async () => {
    const path = await invoke('files:saveAs', `${t.qr.defaultFileName}.svg`, 'svg', await renderQrSvg(payload, style));
    if (path) notifySaved(t.qr.saved, path);
  };
  const copyImage = async () => {
    await invoke('clipboard:writeImage', canvas.current!.toDataURL('image/png'));
    notify(t.qr.copied);
  };

  return (
    <div className="qr-layout">
      <div className="panel">
        <Tabs options={KINDS} value={kind} onChange={setKind} />
        {KIND_FIELDS[kind].map(({ key, label, type }) => (
          <Field key={key} label={label}>
            <TextInput type={type} value={fields[key]} onChange={(value) => setFields({ ...fields, [key]: value })} />
          </Field>
        ))}
        {kind === 'wifi' && (
          <Field label={t.qr.fields.security}>
            <Select value={fields.security} options={WIFI_SECURITY} onChange={(security) => setFields({ ...fields, security })} />
          </Field>
        )}
        <QrStyleFields style={style} onChange={setStyle} correctionLocked={Boolean(logo)} />
        <div className="logo-row">
          <label className="btn btn-small">
            <Icon name="image" size={14} /> {logo ? t.qr.changeLogo : t.qr.addLogo}
            <input type="file" accept="image/*" hidden onChange={pickLogo} />
          </label>
          {logo && (
            <button className="link-button subtle" onClick={clearLogo}>
              {t.qr.removeLogo}
            </button>
          )}
        </div>
      </div>

      <div className="qr-preview">
        {payload ? <canvas ref={canvas} className="qr-canvas" /> : <div className="qr-empty">{t.qr.empty}</div>}
        <div className="qr-actions">
          <button className="btn btn-primary" disabled={!payload} onClick={savePng}>
            PNG
          </button>
          <button className="btn" disabled={!payload || Boolean(logo)} title={logo ? t.qr.svgNoLogo : undefined} onClick={saveSvg}>
            SVG
          </button>
          <button className="btn btn-icon" disabled={!payload} title={t.common.copy} onClick={copyImage}>
            <Icon name="copy" />
          </button>
        </div>
      </div>
    </div>
  );
}
