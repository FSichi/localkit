import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { migrateLegacyData } from '../../src/main/app/legacy-data.ts';

const RECORDINGS = 'C:\\Users\\someone\\Documents\\Transcriptor';

function withFolders(run: (folders: { legacyFolder: string; dataFolder: string; legacyRecordingsFolder: string }) => void) {
  const base = mkdtempSync(join(tmpdir(), 'localkit-migration-'));
  try {
    run({ legacyFolder: join(base, 'Transcriptor'), dataFolder: join(base, 'LocalKit'), legacyRecordingsFolder: RECORDINGS });
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

function write(path: string, content: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf8'));

test('data from 0.2.0 reaches the new folder and the old one stays as a copy', () => {
  withFolders((folders) => {
    const { legacyFolder, dataFolder } = folders;
    write(join(legacyFolder, 'settings.json'), JSON.stringify({ theme: 'light', recordingsFolder: 'D:\\Audio' }));
    write(join(legacyFolder, 'library', 'one.json'), JSON.stringify({ id: 'one', title: 'Reunión' }));
    write(join(legacyFolder, 'models', 'owner', 'whisper', 'config.json'), '{}');

    migrateLegacyData(folders);

    assert.deepEqual(readJson(join(dataFolder, 'settings.json')), { theme: 'light', recordingsFolder: 'D:\\Audio' });
    assert.equal(readJson(join(dataFolder, 'library', 'one.json')).title, 'Reunión');
    assert.ok(existsSync(join(dataFolder, 'models', 'owner', 'whisper', 'config.json')));
    assert.ok(existsSync(join(legacyFolder, 'library', 'one.json')), 'the library stays as a safety copy');
    assert.ok(!existsSync(join(legacyFolder, 'models')), 'models move instead of being duplicated');
  });
});

test('data from 0.1.0 is converted on the way', () => {
  withFolders((folders) => {
    const { legacyFolder, dataFolder } = folders;
    write(join(legacyFolder, 'ajustes.json'), JSON.stringify({ tema: 'claro' }));
    write(join(legacyFolder, 'biblioteca', 'one.json'), JSON.stringify({ id: 'one', titulo: 'Reunión', segmentos: [] }));
    write(join(legacyFolder, 'modelos', 'owner', 'whisper', 'config.json'), '{}');

    migrateLegacyData(folders);

    assert.equal(readJson(join(dataFolder, 'settings.json')).theme, 'light');
    assert.equal(readJson(join(dataFolder, 'library', 'one.json')).title, 'Reunión');
    assert.ok(existsSync(join(dataFolder, 'models', 'owner', 'whisper', 'config.json')));
  });
});

test('recordings that used the old default folder keep being found', () => {
  withFolders((folders) => {
    write(join(folders.legacyFolder, 'settings.json'), JSON.stringify({ theme: 'light' }));
    migrateLegacyData(folders);
    assert.equal(readJson(join(folders.dataFolder, 'settings.json')).recordingsFolder, RECORDINGS);
  });
});

test('a damaged settings file does not hold back the rest', () => {
  withFolders((folders) => {
    write(join(folders.legacyFolder, 'settings.json'), '{ damaged');
    write(join(folders.legacyFolder, 'library', 'one.json'), JSON.stringify({ id: 'one' }));
    migrateLegacyData(folders);
    assert.ok(existsSync(join(folders.dataFolder, 'library', 'one.json')));
    assert.equal(readJson(join(folders.dataFolder, 'settings.json')).recordingsFolder, RECORDINGS);
  });
});

test('a library item deleted afterwards does not come back', () => {
  withFolders((folders) => {
    write(join(folders.legacyFolder, 'library', 'one.json'), JSON.stringify({ id: 'one' }));
    migrateLegacyData(folders);
    rmSync(join(folders.dataFolder, 'library', 'one.json'));
    migrateLegacyData(folders);
    assert.ok(!existsSync(join(folders.dataFolder, 'library', 'one.json')));
  });
});

test('items deleted in 0.2.0 stay deleted even though the 0.1.0 copy remains', () => {
  withFolders((folders) => {
    write(join(folders.legacyFolder, 'library', 'kept.json'), JSON.stringify({ id: 'kept' }));
    write(join(folders.legacyFolder, 'biblioteca', 'deleted.json'), JSON.stringify({ id: 'deleted', segmentos: [] }));
    migrateLegacyData(folders);
    assert.ok(existsSync(join(folders.dataFolder, 'library', 'kept.json')));
    assert.ok(!existsSync(join(folders.dataFolder, 'library', 'deleted.json')));
  });
});

test('what is already in the new folder is never replaced', () => {
  withFolders((folders) => {
    const { legacyFolder, dataFolder } = folders;
    write(join(dataFolder, 'settings.json'), JSON.stringify({ theme: 'dark' }));
    write(join(dataFolder, 'models', 'owner', 'whisper', 'config.json'), 'new');
    write(join(legacyFolder, 'settings.json'), JSON.stringify({ theme: 'light' }));
    write(join(legacyFolder, 'models', 'owner', 'whisper', 'config.json'), 'old');
    write(join(legacyFolder, 'models', 'owner', 'whisper', 'weights.onnx'), 'weights');

    migrateLegacyData(folders);

    assert.equal(readJson(join(dataFolder, 'settings.json')).theme, 'dark');
    assert.equal(readFileSync(join(dataFolder, 'models', 'owner', 'whisper', 'config.json'), 'utf8'), 'new');
    assert.ok(existsSync(join(dataFolder, 'models', 'owner', 'whisper', 'weights.onnx')), 'what was missing still arrives');
  });
});

test('a new install has nothing to migrate', () => {
  withFolders((folders) => {
    migrateLegacyData(folders);
    assert.ok(!existsSync(folders.dataFolder));
  });
});
