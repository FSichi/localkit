// Captures the PC sound and the microphone, and sends the audio to disk every second.
//
// Both sources go into one stereo track: left = microphone, right = system. They share the
// AudioContext clock, so they stay perfectly in sync and, when transcribed separately, the app
// knows who said what. The AudioContext also fills with silence when nothing plays, so the
// recording's timeline always matches real time.
import { t } from '../../../../shared/i18n/index.ts';
import type { AudioSource } from '../../../../shared/transcription.ts';
import { appStore, navigate, touchLibrary } from '../../app/app-store.ts';
import { notify, notifyError } from '../../app/toasts.ts';
import { invoke, send } from '../../lib/bridge.ts';
import { createStore } from '../../lib/create-store.ts';
import { describeError } from '../../lib/errors.ts';
import { enqueueLibraryItem } from '../transcription/transcription-queue.ts';

const HISTORY_SAMPLES = 160;
const METER_INTERVAL_MS = 50;
const CHUNK_INTERVAL_MS = 1000;
const SAMPLE_RATE = 48000;
const BITRATE = 192000;
const ANALYSER_SIZE = 1024;
const METER_GAIN = 3.5;
const MICROPHONE_CHANNEL = 0;
const SYSTEM_CHANNEL = 1;

export interface RecorderState {
  status: 'idle' | 'starting' | 'recording' | 'paused' | 'saving';
  seconds: number;
  source: AudioSource;
}

export const recorderStore = createStore<RecorderState>({ status: 'idle', seconds: 0, source: 'both' });

/** Recent levels per source (0 to 1), to draw the wave without going through React. */
export const levelHistory = { system: new Float32Array(HISTORY_SAMPLES), microphone: new Float32Array(HISTORY_SAMPLES) };

interface Session {
  id: string;
  streams: MediaStream[];
  context: AudioContext;
  mediaRecorder: MediaRecorder;
  pendingWrites: Promise<void>;
  accumulatedSeconds: number;
  resumedAt: number;
  meterTimer: number;
}

let session: Session | null = null;

function captureError(error: unknown, source: 'system' | 'microphone'): Error {
  const name = (error as DOMException)?.name;
  if (name === 'NotAllowedError') return new Error(t.record.errors[source === 'microphone' ? 'microphoneDenied' : 'systemFailed']);
  if (name === 'NotFoundError') return new Error(t.record.errors.microphoneNotFound);
  return error instanceof Error ? error : new Error(t.record.errors.startFailed);
}

async function captureSystemAudio(): Promise<MediaStream> {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
    // Video is only requested because the API demands it.
    stream.getVideoTracks().forEach((track) => track.stop());
    if (!stream.getAudioTracks().length) throw new Error(t.record.errors.systemFailed);
    return new MediaStream(stream.getAudioTracks());
  } catch (error) {
    throw captureError(error, 'system');
  }
}

async function captureMicrophone(microphoneId: string): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: microphoneId && microphoneId !== 'default' ? { exact: microphoneId } : undefined,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
  } catch (error) {
    throw captureError(error, 'microphone');
  }
}

function measureLevel(analyser: AnalyserNode | null, buffer: Float32Array<ArrayBuffer>): number {
  if (!analyser) return 0;
  analyser.getFloatTimeDomainData(buffer);
  let sum = 0;
  for (const sample of buffer) sum += sample * sample;
  return Math.min(1, Math.sqrt(sum / buffer.length) * METER_GAIN);
}

function pushLevel(history: Float32Array, value: number) {
  history.copyWithin(0, 1);
  history[history.length - 1] = value;
}

const elapsedSeconds = ({ accumulatedSeconds, resumedAt }: Session) => accumulatedSeconds + (resumedAt ? (performance.now() - resumedAt) / 1000 : 0);

function connectSource(context: AudioContext, stream: MediaStream | null, merger: ChannelMergerNode, channel: number): AnalyserNode | null {
  if (!stream) return null;
  const source = context.createMediaStreamSource(stream);
  source.connect(merger, 0, channel);
  const analyser = context.createAnalyser();
  analyser.fftSize = ANALYSER_SIZE;
  source.connect(analyser);
  return analyser;
}

function startMeters(current: Session, system: AnalyserNode | null, microphone: AnalyserNode | null) {
  const buffer = new Float32Array(ANALYSER_SIZE);
  current.meterTimer = window.setInterval(() => {
    if (recorderStore.get().status === 'recording') {
      pushLevel(levelHistory.system, measureLevel(system, buffer));
      pushLevel(levelHistory.microphone, measureLevel(microphone, buffer));
    }
    const seconds = Math.floor(elapsedSeconds(current));
    if (seconds !== recorderStore.get().seconds) recorderStore.set({ seconds });
  }, METER_INTERVAL_MS);
}

export async function startRecording() {
  if (recorderStore.get().status !== 'idle') return;
  const { audioSource: source, microphoneId } = appStore.get().settings;
  recorderStore.set({ status: 'starting', seconds: 0, source });
  levelHistory.system.fill(0);
  levelHistory.microphone.fill(0);

  const streams: MediaStream[] = [];
  let context: AudioContext | null = null;
  try {
    const system = source !== 'microphone' ? await captureSystemAudio() : null;
    if (system) streams.push(system);
    const microphone = source !== 'system' ? await captureMicrophone(microphoneId) : null;
    if (microphone) streams.push(microphone);

    context = new AudioContext({ sampleRate: SAMPLE_RATE });
    await context.resume();
    const merger = context.createChannelMerger(2);
    const destination = context.createMediaStreamDestination();
    destination.channelCount = 2;
    merger.connect(destination);
    const microphoneMeter = connectSource(context, microphone, merger, MICROPHONE_CHANNEL);
    const systemMeter = connectSource(context, system, merger, SYSTEM_CHANNEL);

    const { id } = await invoke('recording:start', source);
    const mediaRecorder = new MediaRecorder(destination.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: BITRATE });
    const current: Session = { id, streams, context, mediaRecorder, pendingWrites: Promise.resolve(), accumulatedSeconds: 0, resumedAt: performance.now(), meterTimer: 0 };
    // Writes are chained so chunks reach the disk in order.
    mediaRecorder.addEventListener('dataavailable', ({ data }) => {
      if (data.size) current.pendingWrites = current.pendingWrites.then(async () => send('recording:chunk', id, new Uint8Array(await data.arrayBuffer())));
    });
    mediaRecorder.start(CHUNK_INTERVAL_MS);
    session = current;
    startMeters(current, systemMeter, microphoneMeter);

    // If a source disappears (a microphone gets unplugged), what was recorded is saved.
    streams.flatMap((stream) => stream.getAudioTracks()).forEach((track) =>
      track.addEventListener('ended', () => {
        if (session !== current) return;
        notify(t.record.sourceLost);
        stopRecording();
      }),
    );
    recorderStore.set({ status: 'recording' });
  } catch (error) {
    streams.forEach((stream) => stream.getTracks().forEach((track) => track.stop()));
    context?.close();
    recorderStore.set({ status: 'idle' });
    notifyError(describeError(error));
  }
}

export function togglePause() {
  const current = session;
  if (!current) return;
  if (current.mediaRecorder.state === 'recording') {
    current.mediaRecorder.pause();
    current.accumulatedSeconds = elapsedSeconds(current);
    current.resumedAt = 0;
    recorderStore.set({ status: 'paused' });
  } else if (current.mediaRecorder.state === 'paused') {
    current.mediaRecorder.resume();
    current.resumedAt = performance.now();
    recorderStore.set({ status: 'recording' });
  }
}

async function closeSession(current: Session) {
  clearInterval(current.meterTimer);
  await new Promise<void>((resolve) => {
    current.mediaRecorder.addEventListener('stop', () => resolve(), { once: true });
    current.mediaRecorder.stop();
  });
  current.streams.forEach((stream) => stream.getTracks().forEach((track) => track.stop()));
  await current.pendingWrites;
  current.context.close();
}

export async function stopRecording() {
  const current = session;
  if (!current) return;
  session = null;
  const duration = elapsedSeconds(current);
  recorderStore.set({ status: 'saving' });
  await closeSession(current);
  try {
    const item = await invoke('recording:stop', current.id, duration);
    touchLibrary();
    if (appStore.get().settings.transcribeWhenDone) {
      enqueueLibraryItem(item);
      notify(t.record.savedTranscribing);
    } else {
      notify(t.record.saved, { action: { label: t.common.open, run: () => navigate({ page: 'item', id: item.id }) } });
    }
  } catch (error) {
    notifyError(describeError(error));
  }
  recorderStore.set({ status: 'idle', seconds: 0 });
}

export async function discardRecording() {
  const current = session;
  if (!current) return;
  session = null;
  recorderStore.set({ status: 'saving' });
  await closeSession(current);
  await invoke('recording:discard', current.id);
  recorderStore.set({ status: 'idle', seconds: 0 });
  notify(t.record.discarded);
}
