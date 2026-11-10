import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cutsAround, editedDuration, keptRanges, normalizeCuts, removalFilter, skipRemoved } from '../../src/shared/audio-edit.ts';

test('cuts are ordered, kept inside the audio and joined when they overlap', () => {
  assert.deepEqual(normalizeCuts([{ start: 50, end: 40 }, { start: 5, end: 10 }, { start: 8, end: 12 }, { start: 95, end: 120 }], 100), [
    { start: 5, end: 12 },
    { start: 40, end: 50 },
    { start: 95, end: 100 },
  ]);
});

test('touching cuts become one, and accidental ones disappear', () => {
  assert.deepEqual(normalizeCuts([{ start: 0, end: 5 }, { start: 5, end: 7 }, { start: 30, end: 30.01 }], 60), [{ start: 0, end: 7 }]);
});

test('what is left is everything between the cuts', () => {
  assert.deepEqual(keptRanges([{ start: 10, end: 20 }, { start: 30, end: 40 }], 60), [
    { start: 0, end: 10 },
    { start: 20, end: 30 },
    { start: 40, end: 60 },
  ]);
  assert.deepEqual(keptRanges([], 60), [{ start: 0, end: 60 }]);
  assert.equal(editedDuration([{ start: 10, end: 20 }, { start: 15, end: 25 }], 60), 45);
});

test('keeping only a selection removes what is around it', () => {
  assert.deepEqual(keptRanges(cutsAround({ start: 12, end: 18 }, 60), 60), [{ start: 12, end: 18 }]);
  assert.deepEqual(keptRanges(cutsAround({ start: 0, end: 18 }, 60), 60), [{ start: 0, end: 18 }]);
});

test('playback jumps over removed parts', () => {
  const cuts = [{ start: 10, end: 20 }];
  assert.equal(skipRemoved(12, cuts), 20);
  assert.equal(skipRemoved(10, cuts), 20);
  assert.equal(skipRemoved(20, cuts), null);
  assert.equal(skipRemoved(5, cuts), null);
});

test('the filter drops each removed part', () => {
  assert.equal(removalFilter([{ start: 30, end: 40 }, { start: 1.5, end: 2 }], 60), "aselect='not(between(t,1.500,2.000)+between(t,30.000,40.000))',asetpts=N/SR/TB");
  assert.equal(removalFilter([], 60), 'anull');
});
