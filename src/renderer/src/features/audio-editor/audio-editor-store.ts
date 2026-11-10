// The open audio and its edits. Nothing touches the file until it is exported or saved as a new recording.
import { cutsAround, normalizeCuts, type TimeRange } from '../../../../shared/audio-edit.ts';
import { fileNameOf } from '../../../../shared/files.ts';
import { t } from '../../../../shared/i18n/index.ts';
import type { EditedAudioFormat } from '../../../../shared/jobs.ts';
import { navigate, touchLibrary } from '../../app/app-store.ts';
import { notify, notifyError, notifySaved } from '../../app/toasts.ts';
import { invoke } from '../../lib/bridge.ts';
import { createStore } from '../../lib/create-store.ts';
import { describeError } from '../../lib/errors.ts';
import { runSingleJob } from '../file-batch/batch-store.ts';
import { audioConvertBatch } from './AudioConvertMode.tsx';

/** Enough detail for a wide window without making long recordings slow to open. */
const WAVEFORM_POINTS = 3000;

export type AudioMode = 'edit' | 'convert';

interface AudioEditorState {
  mode: AudioMode;
  path: string | null;
  /** The library item it came from, to save the result as a new recording. */
  itemId: string | null;
  duration: number;
  waveform: number[];
  cuts: TimeRange[];
  /** Earlier versions of the cuts, for undo. */
  history: TimeRange[][];
  selection: TimeRange | null;
  format: EditedAudioFormat;
  /** Opening, exporting or saving, from 0 to 1. */
  fraction: number | null;
}

const EMPTY: Omit<AudioEditorState, 'format' | 'mode'> = { path: null, itemId: null, duration: 0, waveform: [], cuts: [], history: [], selection: null, fraction: null };

export const audioEditor = createStore<AudioEditorState>({ ...EMPTY, mode: 'edit', format: 'same' });

export const setAudioMode = (mode: AudioMode) => audioEditor.set({ mode });

export function openAudioConversion(paths: string[]) {
  setAudioMode('convert');
  audioConvertBatch.add(paths);
}

export async function openAudioEditor(path: string, itemId: string | null = null) {
  audioEditor.set({ ...EMPTY, mode: 'edit', path, itemId, fraction: 0 });
  try {
    const [info, waveform] = await Promise.all([invoke('files:info', path), invoke('audio:waveform', path, WAVEFORM_POINTS)]);
    audioEditor.set({ duration: info.duration ?? 0, waveform, fraction: null });
  } catch (error) {
    audioEditor.set({ ...EMPTY });
    notifyError(describeError(error));
  }
}

export const closeAudioEditor = () => audioEditor.set({ ...EMPTY });

export const selectRange = (selection: TimeRange | null) => audioEditor.set({ selection });

function applyCuts(cuts: TimeRange[]) {
  const { cuts: previous, history, duration } = audioEditor.get();
  audioEditor.set({ cuts: normalizeCuts(cuts, duration), history: [...history, previous], selection: null });
}

export function removeSelection() {
  const { selection, cuts } = audioEditor.get();
  if (selection) applyCuts([...cuts, selection]);
}

export function keepOnlySelection() {
  const { selection, cuts, duration } = audioEditor.get();
  if (selection) applyCuts([...cuts, ...cutsAround(selection, duration)]);
}

export function restoreCut(index: number) {
  applyCuts(audioEditor.get().cuts.filter((_, position) => position !== index));
}

export function undo() {
  const { history } = audioEditor.get();
  if (history.length) audioEditor.set({ cuts: history.at(-1)!, history: history.slice(0, -1), selection: null });
}

export async function exportEdited() {
  const { path, cuts, format } = audioEditor.get();
  audioEditor.set({ fraction: 0 });
  try {
    const { output } = await runSingleJob({ type: 'audio.edit', path: path!, cuts, format }, (fraction) => audioEditor.set({ fraction }));
    notifySaved(t.audioEditor.exported(fileNameOf(output!)), output!);
  } catch (error) {
    notifyError(describeError(error));
  }
  audioEditor.set({ fraction: null });
}

export async function saveAsNewRecording() {
  const { itemId, cuts } = audioEditor.get();
  audioEditor.set({ fraction: 0 });
  try {
    const item = await invoke('library:createEdited', itemId!, cuts);
    touchLibrary();
    closeAudioEditor();
    navigate({ page: 'item', id: item.id });
    notify(t.audioEditor.savedAsRecording);
  } catch (error) {
    audioEditor.set({ fraction: null });
    notifyError(describeError(error));
  }
}
