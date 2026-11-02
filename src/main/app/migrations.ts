// Moves data from older versions to the current layout. Idempotent; runs before anything reads it.
// Library and settings files are copied, not moved, so a failed migration can never lose data.
import { app } from 'electron';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { migrateLegacyItem, migrateLegacySettings } from './legacy-schema.ts';

function migrateSettingsFile(dataFolder: string) {
  const legacyPath = join(dataFolder, 'ajustes.json');
  const currentPath = join(dataFolder, 'settings.json');
  if (!existsSync(legacyPath) || existsSync(currentPath)) return;
  writeFileSync(currentPath, JSON.stringify(migrateLegacySettings(JSON.parse(readFileSync(legacyPath, 'utf8'))), null, 2));
}

function migrateLibrary(dataFolder: string) {
  const legacyFolder = join(dataFolder, 'biblioteca');
  if (!existsSync(legacyFolder)) return;
  const currentFolder = join(dataFolder, 'library');
  mkdirSync(currentFolder, { recursive: true });
  for (const file of readdirSync(legacyFolder)) {
    const target = join(currentFolder, file);
    if (!file.endsWith('.json') || existsSync(target)) continue;
    try {
      writeFileSync(target, JSON.stringify(migrateLegacyItem(JSON.parse(readFileSync(join(legacyFolder, file), 'utf8')))));
    } catch (error) {
      console.error('Could not migrate library item', file, error);
    }
  }
}

function migrateModels(dataFolder: string) {
  const legacyFolder = join(dataFolder, 'modelos');
  const currentFolder = join(dataFolder, 'models');
  // Models are large, so they move instead of being copied.
  if (existsSync(legacyFolder) && !existsSync(currentFolder)) renameSync(legacyFolder, currentFolder);
}

export function runMigrations() {
  const dataFolder = app.getPath('userData');
  for (const migrate of [migrateSettingsFile, migrateLibrary, migrateModels]) {
    try {
      migrate(dataFolder);
    } catch (error) {
      console.error('Migration failed', migrate.name, error);
    }
  }
}
