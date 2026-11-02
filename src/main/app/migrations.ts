// Moves data from older versions to the current layout. Runs before anything reads it.
import { app } from 'electron';
import { dirname, join } from 'node:path';
import { migrateLegacyData } from './legacy-data.ts';

const LEGACY_APP_NAME = 'Transcriptor';

export function runMigrations() {
  // A development build must not take the models away from the app installed on the same PC.
  if (!app.isPackaged) return;
  const dataFolder = app.getPath('userData');
  migrateLegacyData({
    dataFolder,
    legacyFolder: join(dirname(dataFolder), LEGACY_APP_NAME),
    legacyRecordingsFolder: join(app.getPath('documents'), LEGACY_APP_NAME),
  });
}
