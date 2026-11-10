// Telling voices apart: each segment gets a voice print, and prints that sound alike are one person.
import type { DownloadableModel } from './models.ts';
import type { Segment } from './transcription.ts';

const VOICE_FILES = ['config.json', 'preprocessor_config.json', 'onnx/model.onnx'];

/** WeSpeaker ResNet34, trained on VoxCeleb: turns a piece of speech into 256 numbers. */
export const VOICE_MODEL: DownloadableModel = {
  id: 'onnx-community/wespeaker-voxceleb-resnet34-LM',
  bytes: { gpu: 26.6e6, cpu: 26.6e6 },
  files: { gpu: VOICE_FILES, cpu: VOICE_FILES },
};

/** Turns by the same voice measured 0.83 to 0.92 and different voices up to 0.44. Calls are less clean. */
const SAME_VOICE_SIMILARITY = 0.55;
/** Shorter segments give unreliable prints: they can join a voice but never start one. */
const MIN_RELIABLE_SECONDS = 1;
/** A voice heard for less than this is a misread, so it joins the closest one. */
const MIN_VOICE_SECONDS = 3;
const REFINE_ROUNDS = 5;

export interface VoiceSample {
  /** Null when the segment is too short to measure. */
  print: number[] | null;
  seconds: number;
}

type Vector = number[];

function normalize(vector: Vector): Vector {
  const length = Math.hypot(...vector) || 1;
  return vector.map((value) => value / length);
}

const similarity = (a: Vector, b: Vector) => a.reduce((total, value, index) => total + value * b[index], 0);

function closest(print: Vector, centers: Vector[]): { index: number; similarity: number } {
  let best = { index: -1, similarity: -Infinity };
  centers.forEach((center, index) => {
    const value = similarity(print, center);
    if (value > best.similarity) best = { index, similarity: value };
  });
  return best;
}

/** The average voice of each group, weighted by how long each segment lasts. */
function centersOf(prints: Vector[], weights: number[], groups: number[], count: number): Vector[] {
  const sums = Array.from({ length: count }, () => new Array<number>(prints[0].length).fill(0));
  prints.forEach((print, index) => print.forEach((value, dimension) => (sums[groups[index]][dimension] += value * weights[index])));
  return sums.map(normalize);
}

function mergeSimilar(centers: Vector[]): Vector[] {
  const merged = [...centers];
  for (let changed = true; changed; ) {
    changed = false;
    for (let i = 0; i < merged.length && !changed; i++) {
      for (let j = i + 1; j < merged.length && !changed; j++) {
        if (similarity(merged[i], merged[j]) >= SAME_VOICE_SIMILARITY) {
          merged[i] = normalize(merged[i].map((value, dimension) => value + merged[j][dimension]));
          merged.splice(j, 1);
          changed = true;
        }
      }
    }
  }
  return merged;
}

/**
 * Which voice each sample is, numbered 1, 2, 3… in order of appearance. Undefined for all of them
 * when only one voice is heard, since then there is nothing to tell apart.
 */
export function groupVoices(samples: VoiceSample[]): (number | undefined)[] {
  const prints = samples.map(({ print }) => (print ? normalize(print) : null));
  const reliable = samples.flatMap(({ seconds }, index) => (prints[index] && seconds >= MIN_RELIABLE_SECONDS ? [index] : []));
  if (!reliable.length) return samples.map(() => undefined);
  const reliablePrints = reliable.map((index) => prints[index]!);
  const weights = reliable.map((index) => samples[index].seconds);

  // A first pass opens a voice whenever a segment sounds like none of the previous ones.
  let centers: Vector[] = [];
  let groups = reliablePrints.map((print) => {
    const best = closest(print, centers);
    if (best.similarity >= SAME_VOICE_SIMILARITY) return best.index;
    centers.push(print);
    return centers.length - 1;
  });

  // Then each voice is refined with everything it gathered, and segments move to the closest one.
  for (let round = 0; round < REFINE_ROUNDS; round++) {
    centers = mergeSimilar(centersOf(reliablePrints, weights, groups, centers.length));
    groups = reliablePrints.map((print) => closest(print, centers).index);
  }

  const secondsPerVoice = centers.map((_, voice) => groups.reduce((total, group, index) => total + (group === voice ? weights[index] : 0), 0));
  const kept = centers.filter((_, voice) => secondsPerVoice[voice] >= MIN_VOICE_SECONDS);
  if (kept.length < 2) return samples.map(() => undefined);

  const assigned = prints.map((print) => (print ? closest(print, kept).index : undefined));
  // A segment too short to measure most likely belongs to whoever spoke just before.
  let previous: number | undefined;
  const filled = assigned.map((voice) => (previous = voice ?? previous));
  const firstHeard = filled.find((voice) => voice !== undefined);
  const order: number[] = [];
  return filled.map((voice) => {
    const known = voice ?? firstHeard!;
    if (!order.includes(known)) order.push(known);
    return order.indexOf(known) + 1;
  });
}

export function withVoices(segments: Segment[], prints: (number[] | null)[]): Segment[] {
  const voices = groupVoices(segments.map(({ start, end }, index) => ({ print: prints[index] ?? null, seconds: end - start })));
  return segments.map((segment, index) => (voices[index] ? { ...segment, voice: voices[index] } : segment));
}
