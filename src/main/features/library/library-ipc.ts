import { handle, type AppContext } from '../../app/ipc.ts';
import { mediaUrlFor } from '../../app/protocol.ts';
import { exportAudio, exportTranscript } from './library-export.ts';
import { createItem, deleteItem, getItem, listItems, updateItem } from './library-store.ts';

export function registerLibraryIpc(context: AppContext) {
  handle('library:list', listItems);
  handle('library:get', (id) => {
    const item = getItem(id);
    if (item.audioPath) mediaUrlFor(item.audioPath);
    return item;
  });
  handle('library:create', createItem);
  handle('library:update', updateItem);
  handle('library:delete', deleteItem);
  handle('library:exportTranscript', (id, format, withTimestamps) => exportTranscript(context.window(), id, format, withTimestamps));
  handle('library:exportAudio', (id) => exportAudio(context.window(), id));
}
