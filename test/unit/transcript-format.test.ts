import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatBytes, formatClock, formatSrtClock } from '../../src/shared/format.ts';
import { toHtmlDocument, toParagraphs, toPlainText, toSrt } from '../../src/shared/transcript-format.ts';

const segment = (start: number, end: number, text: string, speaker?: 'me' | 'others') => ({ start, end, text, speaker });

test('joins consecutive segments and splits on long pauses', () => {
  const paragraphs = toParagraphs([segment(0, 2, 'Hola'), segment(2, 4, 'che'), segment(8, 9, 'Otra idea')]);
  assert.deepEqual(paragraphs.map(({ text }) => text), ['Hola che', 'Otra idea']);
});

test('starts a new paragraph when the speaker changes', () => {
  const paragraphs = toParagraphs([segment(0, 2, 'Hola', 'me'), segment(2, 3, 'Buenas', 'others')]);
  assert.equal(paragraphs.length, 2);
  assert.equal(paragraphs[1].speaker, 'others');
});

test('clocks', () => {
  assert.equal(formatClock(65), '01:05');
  assert.equal(formatClock(3725), '1:02:05');
  assert.equal(formatSrtClock(61.5), '00:01:01,500');
  assert.equal(formatSrtClock(59.9996), '00:01:00,000');
});

test('byte sizes pick a readable unit', () => {
  assert.equal(formatBytes(640_000), '640 KB');
  assert.equal(formatBytes(1_500_000), '1,5 MB');
  assert.equal(formatBytes(2_000_000_000), '2 GB');
});

test('SRT is numbered, labels the speaker and has a minimum duration', () => {
  assert.equal(toSrt([segment(1, 1, 'Hola', 'me')]), '1\n00:00:01,000 --> 00:00:01,500\nYo: Hola\n');
});

test('plain text with timestamps and speaker', () => {
  assert.equal(toPlainText([segment(5, 6, 'Hola', 'others')], true), '[00:05] Otros: Hola\n');
});

test('the PDF HTML escapes the content', () => {
  assert.ok(toHtmlDocument('<b>', 's', [segment(0, 1, '<script>')], false).includes('&lt;script&gt;'));
});
