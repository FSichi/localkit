import { test } from 'node:test';
import assert from 'node:assert/strict';
import { speakerLabel, toParagraphs, toPlainText, toSrt } from '../../src/shared/transcript-format.ts';
import { groupVoices, withVoices } from '../../src/shared/voices.ts';

/** A voice print near one of a few base voices, with some noise, as real prints are. */
function printFor(voice: number, seed: number): number[] {
  let state = seed * 7919 + voice * 104729;
  const random = () => ((state = (state * 48271) % 2147483647) / 2147483647) - 0.5;
  return Array.from({ length: 32 }, (_, dimension) => (dimension % 4 === voice ? 1 : 0) + random() * 0.5);
}

const sample = (voice: number, seed: number, seconds = 4) => ({ print: printFor(voice, seed), seconds });

test('turns by the same voices are grouped and numbered in order of appearance', () => {
  const samples = [sample(2, 1), sample(0, 2), sample(2, 3), sample(1, 4), sample(0, 5), sample(1, 6)];
  assert.deepEqual(groupVoices(samples), [1, 2, 1, 3, 2, 3]);
});

test('a single voice gets no labels', () => {
  assert.deepEqual(groupVoices([sample(0, 1), sample(0, 2), sample(0, 3)]), [undefined, undefined, undefined]);
});

test('short segments join a voice without creating one', () => {
  const voices = groupVoices([sample(0, 1), sample(1, 2), { print: printFor(3, 3), seconds: 0.6 }, sample(0, 4), sample(1, 5)]);
  assert.deepEqual([voices[0], voices[1], voices[3], voices[4]], [1, 2, 1, 2]);
  assert.ok(voices[2] === 1 || voices[2] === 2);
});

test('a segment too short to measure takes the voice heard just before', () => {
  const samples = [sample(0, 1), sample(1, 2), { print: null, seconds: 0.3 }, sample(0, 3), sample(1, 4)];
  assert.deepEqual(groupVoices(samples), [1, 2, 2, 1, 2]);
});

test('a voice heard only for an instant is not counted as a person', () => {
  const samples = [sample(0, 1), sample(1, 2, 1.5), sample(0, 3), sample(0, 4)];
  assert.deepEqual(groupVoices(samples), [undefined, undefined, undefined, undefined]);
});

test('without anything reliable, nothing is labeled', () => {
  assert.deepEqual(groupVoices([{ print: null, seconds: 5 }]), [undefined]);
  assert.deepEqual(groupVoices([]), []);
});

const segment = (start: number, text: string, voice?: number) => ({ start, end: start + 2, text, ...(voice ? { voice } : {}) });

test('segments only get a voice when there is more than one', () => {
  const segments = [0, 5, 10].map((start, index) => ({ start, end: start + 4, text: ['Hola', 'Qué tal', 'Bien'][index] }));
  assert.deepEqual(withVoices(segments, [printFor(0, 1), printFor(1, 2), printFor(0, 3)]).map(({ voice }) => voice), [1, 2, 1]);
  assert.deepEqual(withVoices(segments, [printFor(0, 1), printFor(0, 2), printFor(0, 3)]), segments);
});

test('voices are labeled with their name, or a number until they get one', () => {
  assert.equal(speakerLabel({ voice: 2 }), 'Persona 2');
  assert.equal(speakerLabel({ voice: 2 }, { 2: 'Juan' }), 'Juan');
  assert.equal(speakerLabel({ voice: 2 }, { 2: '  ' }), 'Persona 2');
  assert.equal(speakerLabel({ speaker: 'me' }, { 1: 'Juan' }), 'Yo');
  assert.equal(speakerLabel({}), undefined);
});

test('a change of voice starts a new paragraph', () => {
  const paragraphs = toParagraphs([segment(0, 'Hola', 1), segment(2.1, 'qué tal', 1), segment(4.2, 'Bien', 2)]);
  assert.deepEqual(paragraphs.map(({ text, voice }) => [text, voice]), [['Hola qué tal', 1], ['Bien', 2]]);
});

test('exports use the names given to each voice', () => {
  const segments = [segment(0, 'Hola', 1), segment(4, 'Bien', 2)];
  assert.equal(toPlainText(segments, false, { 1: 'Ana' }), 'Ana: Hola\n\nPersona 2: Bien\n');
  assert.match(toSrt(segments, { 2: 'Juan' }), /Persona 1: Hola[\s\S]*Juan: Bien/);
});
