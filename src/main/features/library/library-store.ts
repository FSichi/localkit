// Library: each transcription or recording is a JSON file in the app's data folder.
import { app } from 'electron';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { countWords } from '../../../shared/transcript-format.ts';
import type { LibraryItem, LibraryItemSummary } from '../../../shared/transcription.ts';

const SNIPPET_BEFORE = 50;
const SNIPPET_AFTER = 90;

function libraryFolder(): string {
  const path = join(app.getPath('userData'), 'library');
  mkdirSync(path, { recursive: true });
  return path;
}

const itemPath = (id: string) => join(libraryFolder(), `${id.replace(/[^\w-]/g, '')}.json`);

function saveItem(item: LibraryItem) {
  writeFileSync(itemPath(item.id), JSON.stringify(item));
}

export function createItem(data: Omit<LibraryItem, 'id'>): LibraryItem {
  const item: LibraryItem = { id: randomUUID(), ...data };
  saveItem(item);
  return item;
}

export function getItem(id: string): LibraryItem {
  return JSON.parse(readFileSync(itemPath(id), 'utf8'));
}

export function updateItem(id: string, changes: Partial<LibraryItem>): LibraryItem {
  const item = { ...getItem(id), ...changes, id };
  saveItem(item);
  return item;
}

function readAllItems(): LibraryItem[] {
  const items: LibraryItem[] = [];
  for (const file of readdirSync(libraryFolder())) {
    if (!file.endsWith('.json')) continue;
    try {
      items.push(JSON.parse(readFileSync(join(libraryFolder(), file), 'utf8')));
    } catch {
      // A damaged JSON must not hide the rest of the library.
    }
  }
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function snippetFor(item: LibraryItem, query: string): string | undefined {
  const segment = item.segments.find(({ text }) => text.toLowerCase().includes(query));
  if (!segment) return undefined;
  const position = segment.text.toLowerCase().indexOf(query);
  const from = Math.max(0, position - SNIPPET_BEFORE);
  return (from ? '…' : '') + segment.text.slice(from, position + query.length + SNIPPET_AFTER);
}

export function listItems(query = ''): LibraryItemSummary[] {
  const normalized = query.trim().toLowerCase();
  const summaries: LibraryItemSummary[] = [];
  for (const item of readAllItems()) {
    const snippet = normalized ? snippetFor(item, normalized) : undefined;
    if (normalized && !snippet && !item.title.toLowerCase().includes(normalized)) continue;
    const { segments, ...rest } = item;
    summaries.push({ ...rest, wordCount: countWords(segments), snippet });
  }
  return summaries;
}

/** Removes the item. A recording also loses its folder; a user's own file is never touched. */
export function deleteItem(id: string) {
  const item = getItem(id);
  if (item.kind === 'recording' && item.folder) rmSync(item.folder, { recursive: true, force: true });
  rmSync(itemPath(id), { force: true });
}
