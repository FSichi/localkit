import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatBytes, formatClock, formatSrtClock } from '../../src/shared/format.ts';
import { toHtmlDocument, toParagraphs, toPlainText, toSrt, toSubtitleCues } from '../../src/shared/transcript-format.ts';

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

test('a long segment becomes several cues that fit on screen and share its time', () => {
  const words = 'Esta es una frase bastante larga que no entra de ninguna manera en una sola pantalla de subtítulos porque ocupa mucho más de dos líneas de texto.';
  const cues = toSubtitleCues([segment(10, 20, words)]);
  assert.ok(cues.length > 1);
  assert.equal(cues[0].start, 10);
  assert.ok(Math.abs(cues.at(-1)!.end - 20) < 0.01);
  for (const [index, cue] of cues.entries()) {
    if (index) assert.ok(Math.abs(cue.start - cues[index - 1].end) < 0.01, 'cues follow each other');
    assert.ok(cue.text.split('\n').length <= 2);
    assert.ok(cue.text.split('\n').every((line) => line.length <= 42), cue.text);
  }
  assert.equal(cues.map((cue) => cue.text.replace('\n', ' ')).join(' '), words);
});

test('short text stays on one line', () => {
  assert.deepEqual(toSubtitleCues([segment(1, 3, 'Hola, ¿cómo andás?')]), [{ start: 1, end: 3, text: 'Hola, ¿cómo andás?' }]);
});

test('a sentence ending closes the cue early', () => {
  const cues = toSubtitleCues([segment(0, 10, 'Esta primera oración ya tiene el largo suficiente. Y acá empieza otra cosa.')]);
  assert.equal(cues[0].text.replace('\n', ' '), 'Esta primera oración ya tiene el largo suficiente.');
  assert.equal(cues[1].text, 'Y acá empieza otra cosa.');
});

test('a segment without text produces no cues', () => {
  assert.deepEqual(toSubtitleCues([segment(0, 1, '   ')]), []);
});

test('plain text with timestamps and speaker', () => {
  assert.equal(toPlainText([segment(5, 6, 'Hola', 'others')], true), '[00:05] Otros: Hola\n');
});

test('the PDF HTML escapes the content', () => {
  assert.ok(toHtmlDocument('<b>', 's', [segment(0, 1, '<script>')], false).includes('&lt;script&gt;'));
});
