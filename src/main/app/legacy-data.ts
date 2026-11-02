// Brings the data of versions up to 0.2.0, kept in a folder called Transcriptor, into the current
// data folder. That folder stays as a safety copy, except for the models, which are too large to
// keep twice. Free of Electron so it can be tested against real folders.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Settings } from '../../shared/settings.ts';
import { migrateLegacyItem, migrateLegacySettings } from './legacy-schema.ts';

export interface LegacyDataFolders {
  legacyFolder: string;
  dataFolder: string;
  /** Where recordings went by default before the rename. */
  legacyRecordingsFolder: string;
}

const COMPLETED_MARKER = 'migrated-from-transcriptor';

/** A migration interrupted halfway must leave nothing that looks finished. */
function writeAtomically(path: string, content: string) {
  const partial = `${path}.partial`;
  writeFileSync(partial, content);
  renameSync(partial, path);
}

function readLegacySettings(folder: string): Partial<Settings> {
  const currentPath = join(folder, 'settings.json');
  const firstVersionPath = join(folder, 'ajustes.json');
  try {
    if (existsSync(currentPath)) return JSON.parse(readFileSync(currentPath, 'utf8'));
    if (existsSync(firstVersionPath)) return migrateLegacySettings(JSON.parse(readFileSync(firstVersionPath, 'utf8')));
  } catch {
    // A damaged file must not hold back the rest: defaults are used instead, as when the app reads it.
  }
  return {};
}

function migrateSettings({ legacyFolder, dataFolder, legacyRecordingsFolder }: LegacyDataFolders) {
  const target = join(dataFolder, 'settings.json');
  if (existsSync(target)) return;
  // Recordings stay where they are, so the old default has to outlive the change of default.
  writeAtomically(target, JSON.stringify({ recordingsFolder: legacyRecordingsFolder, ...readLegacySettings(legacyFolder) }, null, 2));
}

function migrateLibrary({ legacyFolder, dataFolder }: LegacyDataFolders) {
  // Version 0.2.0 kept the 0.1.0 folder next to the converted one, so only the newest one counts.
  const hasCurrentSchema = existsSync(join(legacyFolder, 'library'));
  const sourceFolder = join(legacyFolder, hasCurrentSchema ? 'library' : 'biblioteca');
  if (!existsSync(sourceFolder)) return;
  const targetFolder = join(dataFolder, 'library');
  mkdirSync(targetFolder, { recursive: true });
  for (const file of readdirSync(sourceFolder)) {
    const target = join(targetFolder, file);
    if (!file.endsWith('.json') || existsSync(target)) continue;
    try {
      const item = JSON.parse(readFileSync(join(sourceFolder, file), 'utf8'));
      writeAtomically(target, JSON.stringify(hasCurrentSchema ? item : migrateLegacyItem(item)));
    } catch (error) {
      console.error('Could not migrate library item', file, error);
    }
  }
}

/** Moves what the target doesn't have yet and never replaces anything, so it can be retried. */
function moveMissing(source: string, target: string) {
  if (!existsSync(source)) return;
  if (!existsSync(target)) {
    mkdirSync(dirname(target), { recursive: true });
    renameSync(source, target);
    return;
  }
  if (!statSync(source).isDirectory() || !statSync(target).isDirectory()) return;
  for (const entry of readdirSync(source)) moveMissing(join(source, entry), join(target, entry));
}

function migrateModels({ legacyFolder, dataFolder }: LegacyDataFolders) {
  moveMissing(join(legacyFolder, 'models'), join(dataFolder, 'models'));
  moveMissing(join(legacyFolder, 'modelos'), join(dataFolder, 'models'));
}

/** Idempotent: a step that fails is retried on the next launch. */
export function migrateLegacyData(folders: LegacyDataFolders) {
  const marker = join(folders.dataFolder, COMPLETED_MARKER);
  if (!existsSync(folders.legacyFolder) || existsSync(marker)) return;
  mkdirSync(folders.dataFolder, { recursive: true });
  let completed = true;
  for (const migrate of [migrateSettings, migrateLibrary, migrateModels]) {
    try {
      migrate(folders);
    } catch (error) {
      completed = false;
      console.error('Migration failed', migrate.name, error);
    }
  }
  // Without the marker, library items deleted later would be copied back on every launch.
  if (completed) writeFileSync(marker, '');
}
