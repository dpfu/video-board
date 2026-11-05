import JSZip from 'jszip';
import { assetKeys, migrateBoard, type Board } from './model';
import { validateBoard } from './validation';

export async function backupBoard(board: Board, assets: ReadonlyMap<string, Blob>) {
  const zip = new JSZip();
  zip.file('board.json', JSON.stringify(board, null, 2));
  for (const key of assetKeys(board)) {
    const blob = assets.get(key);
    if (!blob) throw new Error('A media file is missing. The backup has not been created.');
    zip.file(`assets/${key}`, await blob.arrayBuffer());
  }
  return zip.generateAsync({ type: 'blob' });
}

/** Decode and validate everything before the caller can replace the current board. */
export async function restoreArchive(file: Blob) {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(await file.arrayBuffer());
  } catch {
    throw new Error(
      'This file is not a readable Video Board backup. The current board has not been changed.',
    );
  }
  const manifest = zip.file('board.json');
  if (!manifest) throw new Error('No Video Board project was found in this file.');
  let board: unknown;
  try {
    board = JSON.parse(await manifest.async('string'));
  } catch {
    throw new Error(
      'The project backup has an unreadable board manifest. The current board has not been changed.',
    );
  }
  validateBoard(board);
  const migrated = migrateBoard(board);
  const assets = new Map<string, Blob>();
  for (const key of assetKeys(migrated)) {
    const entry = zip.file(`assets/${key}`);
    if (!entry) throw new Error('The project backup is missing a media file.');
    assets.set(key, new Blob([await entry.async('arraybuffer')]));
  }
  return { board: migrated, assets };
}
