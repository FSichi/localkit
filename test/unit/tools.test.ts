import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AppError, decodeIpcError, encodeErrorForIpc } from '../../src/shared/errors.ts';
import { extensionOf, fileKindOf, withoutExtension } from '../../src/shared/files.ts';
import { parsePageRanges } from '../../src/shared/page-ranges.ts';
import { entropyBits, generatePassword, strengthOf, type PasswordOptions } from '../../src/shared/passwords.ts';
import { batchFromList, batchFromRange, buildQrPayload, EMPTY_QR_FIELDS } from '../../src/shared/qr-payloads.ts';

test('classifies files by extension', () => {
  assert.equal(fileKindOf('C:\\fotos\\Foto.HEIC'), 'image');
  assert.equal(fileKindOf('video.mkv'), 'video');
  assert.equal(fileKindOf('audio.opus'), 'audio');
  assert.equal(fileKindOf('doc.pdf'), 'pdf');
  assert.equal(fileKindOf('nota.txt'), 'other');
  assert.equal(extensionOf('a.b.PNG'), 'png');
  assert.equal(withoutExtension('reporte.final.pdf'), 'reporte.final');
});

test('page ranges accept lists, ranges and open ends', () => {
  assert.deepEqual(parsePageRanges('1-3, 5', 10), [0, 1, 2, 4]);
  assert.deepEqual(parsePageRanges('8-', 10), [7, 8, 9]);
  assert.deepEqual(parsePageRanges('-2', 10), [0, 1]);
});

test('page ranges reject bad input with a typed error', () => {
  const codeOf = (input: string) => {
    try {
      parsePageRanges(input, 10);
    } catch (error) {
      return (error as AppError).code;
    }
    return null;
  };
  assert.equal(codeOf('abc'), 'pageRangeSyntax');
  assert.equal(codeOf('5-20'), 'pageRangeBounds');
  assert.equal(codeOf('   '), 'pageRangeEmpty');
});

test('errors survive the trip through IPC, even wrapped by Electron', () => {
  const encoded = encodeErrorForIpc(new AppError('pageRangeBounds', '5-20|10'));
  assert.deepEqual(decodeIpcError(new Error(`Error invoking remote method 'jobs:run': Error: ${encoded}`)), { code: 'pageRangeBounds', detail: '5-20|10' });
  assert.equal(decodeIpcError(new Error('boom')).code, 'unknown');
});

const ALL_SETS: PasswordOptions = { length: 16, lowercase: true, uppercase: true, digits: true, symbols: true, excludeAmbiguous: false };

test('a password has the requested length and one of each selected kind', () => {
  for (let i = 0; i < 200; i++) {
    const password = generatePassword({ ...ALL_SETS, length: 8 });
    assert.equal(password.length, 8);
    assert.match(password, /[a-z]/);
    assert.match(password, /[A-Z]/);
    assert.match(password, /[0-9]/);
    assert.match(password, /[^a-zA-Z0-9]/);
  }
});

test('ambiguous characters can be excluded', () => {
  const password = generatePassword({ ...ALL_SETS, length: 2000, excludeAmbiguous: true });
  assert.doesNotMatch(password, /[Il1O0o|`'"]/);
});

test('no character sets gives an empty password', () => {
  assert.equal(generatePassword({ ...ALL_SETS, lowercase: false, uppercase: false, digits: false, symbols: false }), '');
});

test('entropy grows with length and alphabet', () => {
  assert.ok(entropyBits({ ...ALL_SETS, length: 20 }) > entropyBits(ALL_SETS));
  assert.ok(entropyBits(ALL_SETS) > entropyBits({ ...ALL_SETS, symbols: false }));
  assert.equal(strengthOf(30), 'weak');
  assert.equal(strengthOf(120), 'veryStrong');
});

test('Wi-Fi payload escapes special characters', () => {
  const payload = buildQrPayload('wifi', { ...EMPTY_QR_FIELDS, ssid: 'Mi;Red', password: 'a:b' });
  assert.equal(payload, 'WIFI:T:WPA;S:Mi\\;Red;P:a\\:b;;');
});

test('WhatsApp payload keeps only digits and encodes the message', () => {
  const payload = buildQrPayload('whatsapp', { ...EMPTY_QR_FIELDS, phone: '+54 9 11 1234', message: 'hola che' });
  assert.equal(payload, 'https://wa.me/5491112 34'.replace(' ', '') + '?text=hola%20che');
});

test('contact payload is a vCard', () => {
  const payload = buildQrPayload('contact', { ...EMPTY_QR_FIELDS, name: 'Ana', phone: '123' });
  assert.ok(payload.startsWith('BEGIN:VCARD') && payload.includes('FN:Ana') && payload.includes('TEL:123'));
});

test('empty fields give an empty payload', () => {
  assert.equal(buildQrPayload('wifi', EMPTY_QR_FIELDS), '');
  assert.equal(buildQrPayload('contact', EMPTY_QR_FIELDS), '');
});

test('QR batch from a pasted spreadsheet column', () => {
  const entries = batchFromList('A1\tignored\n\nB/2\n', 'https://x.com/{code}', 'QR_');
  assert.deepEqual(entries, [
    { fileName: 'QR_A1', payload: 'https://x.com/A1' },
    { fileName: 'QR_B-2', payload: 'https://x.com/B/2' },
  ]);
});

test('QR batch from a padded range', () => {
  const entries = batchFromRange(8, 10, 3, 'https://x.com/', '');
  assert.deepEqual(entries.map(({ payload }) => payload), ['https://x.com/008', 'https://x.com/009', 'https://x.com/010']);
});
