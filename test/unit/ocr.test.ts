import { test } from 'node:test';
import assert from 'node:assert/strict';
import { removeStrayCharacters, restoreOpeningExclamations, toPagePlacement } from '../../src/shared/ocr.ts';
import { findDownloadableModel, findOcrModel, OCR_MODELS } from '../../src/shared/ocr-models.ts';

test('a Spanish sentence ending in "!" gets its opening mark back', () => {
  assert.equal(restoreOpeningExclamations('No envió el archivo. Necesitamos revisarlo antes!'), 'No envió el archivo. ¡Necesitamos revisarlo antes!');
  assert.equal(restoreOpeningExclamations('¿Cómo andás? Qué bueno!'), '¿Cómo andás? ¡Qué bueno!');
  assert.equal(restoreOpeningExclamations('Qué bueno! Qué lindo!'), '¡Qué bueno! ¡Qué lindo!');
});

test('a sentence can span several lines', () => {
  assert.equal(restoreOpeningExclamations('Empezó la revisión. Necesitamos\nverlo ya!'), 'Empezó la revisión. ¡Necesitamos\nverlo ya!');
});

test('a title above does not take the opening mark', () => {
  assert.equal(restoreOpeningExclamations('Información\nLlegó el día!'), 'Información\n¡Llegó el día!');
});

test('what already has its mark stays the same, and so does other text', () => {
  assert.equal(restoreOpeningExclamations('¡Qué bueno! Sí.'), '¡Qué bueno! Sí.');
  assert.equal(restoreOpeningExclamations('Hello there! Nice to meet you!'), 'Hello there! Nice to meet you!');
  assert.equal(restoreOpeningExclamations('Terminó... qué pena!'), 'Terminó... ¡qué pena!');
});

test('icons read as Chinese characters are removed from Western text', () => {
  const text = 'Esta es una línea larga de un documento en español con varias palabras comunes.';
  assert.equal(removeStrayCharacters(`中 Lector de archivos
${text}`), `Lector de archivos
${text}`);
  assert.equal(removeStrayCharacters(`器Códigos QR
${text}`), `Códigos QR
${text}`);
});

test('real Chinese text stays', () => {
  assert.equal(removeStrayCharacters('今天的会议改到星期三 Martín'), '今天的会议改到星期三 Martín');
});

const line = { text: 'Hola', x: 100, y: 200, width: 300, height: 40 };
const page = { imageWidth: 1000, imageHeight: 2000, lines: [] };

test('a line lands where it was read on a normal page', () => {
  const placement = toPagePlacement(line, page, { x: 0, y: 0, width: 500, height: 1000, rotation: 0 });
  assert.deepEqual(placement, { x: 50, y: 1000 - (200 + 32) / 2, angle: 0, length: 150 });
});

test('the page origin is taken into account', () => {
  const placement = toPagePlacement(line, page, { x: 10, y: 20, width: 500, height: 1000, rotation: 0 });
  assert.equal(placement.x, 60);
  assert.equal(placement.y, 20 + 884);
});

test('rotated pages keep the position seen on screen', () => {
  // A page stored as 1000 × 500 shown turned, so it looks 500 × 1000.
  const quarter = toPagePlacement(line, page, { x: 0, y: 0, width: 1000, height: 500, rotation: 90 });
  assert.deepEqual(quarter, { x: 1000 - 884, y: 50, angle: 90, length: 150 });
  const half = toPagePlacement(line, page, { x: 0, y: 0, width: 500, height: 1000, rotation: 180 });
  assert.deepEqual(half, { x: 450, y: 116, angle: 180, length: 150 });
  const threeQuarters = toPagePlacement(line, page, { x: 0, y: 0, width: 1000, height: 500, rotation: 270 });
  assert.deepEqual(threeQuarters, { x: 884, y: 450, angle: 270, length: 150 });
});

test('every OCR file has a place to download it from', () => {
  for (const model of OCR_MODELS) {
    assert.equal(findDownloadableModel(model.id), model);
    for (const file of model.files.gpu) assert.match(model.sourceUrl!(file), /^https:\/\/huggingface\.co\/PaddlePaddle\/PP-OCRv6_\w+_(det|rec)_onnx\/resolve\/main\/inference\.(onnx|yml)$/);
  }
});

test('an unknown engine falls back to the balanced one', () => {
  assert.equal(findOcrModel('').tier, 'balanced');
});
