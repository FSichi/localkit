// User preferences, in a JSON file inside the app's data folder.
import { app } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Settings } from '../../shared/settings.ts';

const settingsPath = () => join(app.getPath('userData'), 'settings.json');

function defaultSettings(): Settings {
  return {
    theme: 'dark',
    language: 'es',
    modelId: '',
    audioSource: 'both',
    microphoneId: 'default',
    transcribeWhenDone: true,
    recordingsFolder: join(app.getPath('documents'), 'Transcriptor'),
    outputFolder: '',
    checkForUpdates: true,
    lastSeenVersion: '',
    postponedUpdate: null,
  };
}

let cached: Settings | null = null;

export function readSettings(): Settings {
  if (cached) return cached;
  let settings = defaultSettings();
  if (existsSync(settingsPath())) {
    try {
      settings = { ...settings, ...JSON.parse(readFileSync(settingsPath(), 'utf8')) };
    } catch {
      // A damaged file must not stop the app from opening: defaults are used instead.
    }
  }
  cached = settings;
  return settings;
}

export function updateSettings(changes: Partial<Settings>): Settings {
  cached = { ...readSettings(), ...changes };
  writeFileSync(settingsPath(), JSON.stringify(cached, null, 2));
  return cached;
}
