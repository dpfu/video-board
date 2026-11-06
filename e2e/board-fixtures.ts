import { sourceQuotationId, type Board } from '../src/model';

/** A collection-only board backed by the video imported by openVideo(). */
export function collectionFixture(board: Board, count = 2): Board {
  if (board.videos.length !== 1) throw new Error('Import the generated test video first.');
  const source = board.videos[0];
  const whole = board.quotations.find((q) => q.id === sourceQuotationId(source.id));
  if (!whole) throw new Error('Import the generated test video first.');
  return {
    ...board,
    videos: [{ ...source, hidden: true, dock: undefined }],
    tracks: [],
    stills: [],
    clips: [],
    panels: [],
    codes: [{ id: 'review', name: 'Review', color: '#b7cde5', definition: '' }],
    quotations: [
      whole,
      ...Array.from({ length: count }, (_, index) => ({
        ...whole,
        id: `excerpt-${index}`,
        kind: 'range' as const,
        title: `Excerpt ${String(index).padStart(3, '0')}`,
        start: 0.25 + (index % 2),
        end: 0.75 + (index % 2),
        parentId: whole.id,
        codeIds: ['review'],
      })),
    ],
    spaces: [
      {
        id: 'review-space',
        kind: 'space',
        name: '',
        memo: '',
        codeId: 'review',
        items: [],
        x: 80,
        y: 50,
        width: 700,
        height: 540,
        z: 10,
      },
    ],
    camera: { x: 0, y: 0, scale: 1 },
  };
}
