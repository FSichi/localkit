import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrateLegacyItem, migrateLegacySettings, readRecordingMarker } from '../../src/main/app/legacy-schema.ts';

test('version 0.1.0 settings map to the current schema', () => {
  const settings = migrateLegacySettings({
    tema: 'claro',
    idioma: 'en',
    modelo: 'onnx-community/whisper-base',
    fuente: 'ambos',
    micId: 'abc',
    transcribirAlTerminar: false,
    carpetaGrabaciones: 'C:\\Grabaciones',
    buscarActualizaciones: false,
    versionVista: '0.1.0',
    pospuesta: { version: '0.2.0', hasta: 123 },
  });
  assert.deepEqual(settings, {
    theme: 'light',
    language: 'en',
    modelId: 'onnx-community/whisper-base',
    audioSource: 'both',
    microphoneId: 'abc',
    transcribeWhenDone: false,
    recordingsFolder: 'C:\\Grabaciones',
    checkForUpdates: false,
    lastSeenVersion: '0.1.0',
    postponedUpdate: { version: '0.2.0', until: 123 },
  });
});

test('missing legacy settings stay out, so defaults apply', () => {
  assert.deepEqual(migrateLegacySettings({ idioma: 'es' }), { language: 'es' });
});

test('version 0.1.0 library items map to the current schema', () => {
  const item = migrateLegacyItem({
    id: '1',
    titulo: 'Reunión',
    tipo: 'grabacion',
    creado: '2026-10-30T10:00:00.000Z',
    duracion: 60,
    audio: 'a.mp3',
    pistas: 'p.webm',
    carpeta: 'c',
    fuente: 'sistema',
    idioma: 'es',
    modelo: 'Máxima',
    estado: 'transcripto',
    segmentos: [{ inicio: 1, fin: 2, texto: 'Hola', hablante: 'yo' }, { inicio: 3, fin: 4, texto: 'Che' }],
  });
  assert.equal(item.kind, 'recording');
  assert.equal(item.status, 'transcribed');
  assert.equal(item.source, 'system');
  assert.equal(item.tracksPath, 'p.webm');
  assert.equal(item.quality, 'Máxima');
  assert.deepEqual(item.segments, [{ start: 1, end: 2, text: 'Hola', speaker: 'me' }, { start: 3, end: 4, text: 'Che' }]);
});

test('recording markers are read in both formats', () => {
  assert.deepEqual(readRecordingMarker({ fuente: 'mic', inicio: 'x' }), { source: 'microphone', startedAt: 'x' });
  assert.deepEqual(readRecordingMarker({ source: 'both', startedAt: 'y' }), { source: 'both', startedAt: 'y' });
});
