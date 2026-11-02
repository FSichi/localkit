// Global app state: settings, hardware, navigation.
import { DEFAULT_OCR_MODEL_ID, findOcrModel } from '../../../shared/ocr-models.ts';
import type { Settings, Theme } from '../../../shared/settings.ts';
import type { ComputeProfile } from '../../../shared/transcription.ts';
import { DEFAULT_MODEL_ID, findModel, MAXIMUM_MODEL_ID } from '../../../shared/whisper-models.ts';
import { invoke } from '../lib/bridge.ts';
import { createStore } from '../lib/create-store.ts';

export type ToolId = 'images' | 'media' | 'pdf' | 'ocr' | 'markdown' | 'transcribe' | 'record' | 'library' | 'passwords' | 'qr';

export type Route = { page: 'home' } | { page: 'settings' } | { page: 'item'; id: string } | { page: ToolId };

interface AppState {
  ready: boolean;
  settings: Settings;
  profile: ComputeProfile;
  /** The GPU can run the Maximum quality. */
  supportsMaximumModel: boolean;
  gpuName: string;
  version: string;
  route: Route;
  /** Goes up when the library changes, so views read it again. */
  libraryRevision: number;
}

export const appStore = createStore<AppState>({
  ready: false,
  settings: {
    theme: 'dark',
    language: 'es',
    modelId: '',
    ocrModelId: DEFAULT_OCR_MODEL_ID,
    audioSource: 'both',
    recordingCapture: 'audio',
    microphoneId: 'default',
    transcribeWhenDone: true,
    recordingsFolder: '',
    outputFolder: '',
    checkForUpdates: true,
    lastSeenVersion: '',
    postponedUpdate: null,
  },
  profile: 'cpu',
  supportsMaximumModel: false,
  gpuName: '',
  version: '',
  route: { page: 'home' },
  libraryRevision: 0,
});

export const navigate = (route: Route) => appStore.set({ route });
export const touchLibrary = () => appStore.set({ libraryRevision: appStore.get().libraryRevision + 1 });

function applyTheme(theme: Theme) {
  const dark = theme === 'system' ? matchMedia('(prefers-color-scheme: dark)').matches : theme === 'dark';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

export async function updateSettings(changes: Partial<Settings>) {
  const settings = await invoke('settings:update', changes);
  appStore.set({ settings });
  if (changes.theme) applyTheme(changes.theme);
}

async function detectHardware() {
  const cpuOnly = { profile: 'cpu' as const, supportsMaximumModel: false, gpuName: '' };
  try {
    const adapter = await navigator.gpu?.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) return cpuOnly;
    return {
      profile: 'gpu' as const,
      supportsMaximumModel: adapter.features.has('shader-f16'),
      gpuName: adapter.info?.description || adapter.info?.vendor || '',
    };
  } catch {
    return cpuOnly;
  }
}

/** The quality to use: the chosen one, or the best the hardware supports. */
export function currentModelId(): string {
  const { settings, supportsMaximumModel } = appStore.get();
  const proposed = settings.modelId || (supportsMaximumModel ? MAXIMUM_MODEL_ID : DEFAULT_MODEL_ID);
  return findModel(proposed).gpuOnly && !supportsMaximumModel ? DEFAULT_MODEL_ID : proposed;
}

export const currentOcrModel = () => findOcrModel(appStore.get().settings.ocrModelId);

export async function bootstrapApp() {
  const [{ settings, version }, hardware] = await Promise.all([invoke('app:bootstrap'), detectHardware()]);
  appStore.set({ settings, version, ...hardware, ready: true });
  applyTheme(settings.theme);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme(appStore.get().settings.theme));
}
