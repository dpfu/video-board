import { openDB, type DBSchema } from 'idb';
import { assetKeys, migrateBoard, type Board, type PersistedBoard } from './model';
import { reconcileSpaces } from './spaces';

interface VideoBoardDB extends DBSchema {
  boards: { key: string; value: PersistedBoard };
  assets: { key: string; value: Blob };
}

// Adapted from Folder Sort's libraryDatabase: an isolated database and atomic writes.
const database = openDB<VideoBoardDB>('video-board', 1, {
  upgrade(db) {
    db.createObjectStore('boards');
    db.createObjectStore('assets');
  },
});

export async function commitTransaction<T>(
  tx: { done: Promise<unknown>; abort: () => void },
  write: () => Promise<T>,
) {
  try {
    const result = await write();
    await tx.done;
    return result;
  } catch (cause) {
    try {
      tx.abort();
    } catch {
      /* May already be aborted. */
    }
    await tx.done.catch(() => {});
    throw cause;
  }
}

export async function loadBoard() {
  const db = await database;
  const saved = await db.get('boards', 'current');
  const board = saved ? reconcileSpaces(migrateBoard(saved)) : undefined;
  const assets = new Map<string, Blob>();
  if (board) {
    const keys = assetKeys(board);
    await Promise.all(
      keys.map(async (key) => {
        const blob = await db.get('assets', key);
        if (!blob)
          throw new Error('A saved media file is missing. Restore a project backup to recover it.');
        assets.set(key, blob);
      }),
    );
  }
  return { board, assets };
}

export async function saveBoard(board: Board) {
  await (await database).put('boards', board, 'current');
}
export async function saveAssets(assets: Map<string, Blob>) {
  const tx = (await database).transaction('assets', 'readwrite');
  await commitTransaction(tx, async () => {
    await Promise.all([...assets].map(([key, blob]) => tx.store.put(blob, key)));
  });
}

// A restored project and all its media become visible together.
export async function replaceBoard(board: Board, assets: Map<string, Blob>) {
  const tx = (await database).transaction(['boards', 'assets'], 'readwrite');
  await commitTransaction(tx, async () => {
    await tx.objectStore('assets').clear();
    await Promise.all([...assets].map(([key, blob]) => tx.objectStore('assets').put(blob, key)));
    await tx.objectStore('boards').put(board, 'current');
  });
}
