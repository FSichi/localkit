// QR contents: each kind is written in the format phones understand.

export type QrKind = 'text' | 'wifi' | 'contact' | 'whatsapp' | 'email';
export type WifiSecurity = 'WPA' | 'WEP' | 'nopass';

export interface QrFields {
  text: string;
  ssid: string;
  password: string;
  security: WifiSecurity;
  name: string;
  company: string;
  phone: string;
  email: string;
  website: string;
  message: string;
  subject: string;
}

export const EMPTY_QR_FIELDS: QrFields = {
  text: '',
  ssid: '',
  password: '',
  security: 'WPA',
  name: '',
  company: '',
  phone: '',
  email: '',
  website: '',
  message: '',
  subject: '',
};

const escapeWifi = (value: string) => value.replace(/([\\;,:"])/g, '\\$1');
const escapeVcard = (value: string) => value.replace(/([\\;,])/g, '\\$1').replace(/\n/g, '\\n');

function wifiPayload(f: QrFields): string {
  if (!f.ssid) return '';
  if (f.security === 'nopass') return `WIFI:T:nopass;S:${escapeWifi(f.ssid)};;`;
  return `WIFI:T:${f.security};S:${escapeWifi(f.ssid)};P:${escapeWifi(f.password)};;`;
}

function contactPayload(f: QrFields): string {
  if (!f.name && !f.phone && !f.email) return '';
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${escapeVcard(f.name)}`];
  if (f.company) lines.push(`ORG:${escapeVcard(f.company)}`);
  if (f.phone) lines.push(`TEL:${escapeVcard(f.phone)}`);
  if (f.email) lines.push(`EMAIL:${escapeVcard(f.email)}`);
  if (f.website) lines.push(`URL:${escapeVcard(f.website)}`);
  lines.push('END:VCARD');
  return lines.join('\n');
}

function whatsappPayload(f: QrFields): string {
  const number = f.phone.replace(/\D/g, '');
  if (!number) return '';
  return `https://wa.me/${number}${f.message ? `?text=${encodeURIComponent(f.message)}` : ''}`;
}

function emailPayload(f: QrFields): string {
  if (!f.email) return '';
  const params = [f.subject && `subject=${encodeURIComponent(f.subject)}`, f.message && `body=${encodeURIComponent(f.message)}`].filter(Boolean);
  return `mailto:${f.email}${params.length ? `?${params.join('&')}` : ''}`;
}

const PAYLOAD_BUILDERS: Record<QrKind, (fields: QrFields) => string> = {
  text: (f) => f.text,
  wifi: wifiPayload,
  contact: contactPayload,
  whatsapp: whatsappPayload,
  email: emailPayload,
};

export const buildQrPayload = (kind: QrKind, fields: QrFields) => PAYLOAD_BUILDERS[kind](fields);

export interface QrBatchEntry {
  fileName: string;
  payload: string;
}

const CODE_PLACEHOLDER = '{code}';

const safeFileName = (value: string) =>
  value.replace(/[<>:"/\\|?*\s]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'qr';

/** One code per line; spreadsheets paste tabs, so only the first column counts. */
export function batchFromList(list: string, template: string, prefix: string): QrBatchEntry[] {
  const codes = list.split(/\r?\n/).map((line) => line.split('\t')[0].trim()).filter(Boolean);
  return codes.map((code) => ({
    fileName: safeFileName(`${prefix}${code}`),
    payload: template.includes(CODE_PLACEHOLDER) ? template.replaceAll(CODE_PLACEHOLDER, code) : `${template}${code}`,
  }));
}

export function batchFromRange(first: number, last: number, padding: number, template: string, prefix: string): QrBatchEntry[] {
  const codes: string[] = [];
  for (let n = first; n <= last; n++) codes.push(String(n).padStart(padding, '0'));
  return batchFromList(codes.join('\n'), template, prefix);
}
