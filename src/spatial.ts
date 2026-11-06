export type Bounds = { x: number; y: number; width: number; height: number };
export const overlaps = (a: Bounds, b: Bounds, inset = 0) =>
  a.x < b.x + b.width - inset &&
  a.x + a.width > b.x + inset &&
  a.y < b.y + b.height - inset &&
  a.y + a.height > b.y + inset;

/** A conservative broad phase. Very large boxes/queries use bounded fallbacks. */
export class BoxIndex<Box extends Bounds> {
  private cells = new Map<string, number[]>();
  private large: number[] = [];
  constructor(
    private readonly boxes: readonly Box[],
    private readonly cellSize = 512,
  ) {
    boxes.forEach((box, index) => {
      const cells = this.range(box);
      if (!this.enumerable(cells, 64)) {
        this.large.push(index);
        return;
      }
      for (let x = cells.left; x <= cells.right; x++)
        for (let y = cells.top; y <= cells.bottom; y++) {
          const key = `${x},${y}`,
            members = this.cells.get(key);
          if (members) members.push(index);
          else this.cells.set(key, [index]);
        }
    });
  }
  private range(box: Bounds) {
    return {
      left: Math.floor(box.x / this.cellSize),
      top: Math.floor(box.y / this.cellSize),
      right: Math.floor((box.x + box.width) / this.cellSize),
      bottom: Math.floor((box.y + box.height) / this.cellSize),
    };
  }
  private enumerable(cells: ReturnType<BoxIndex<Box>['range']>, limit: number) {
    const width = cells.right - cells.left + 1,
      height = cells.bottom - cells.top + 1;
    return (
      Object.values(cells).every(Number.isSafeInteger) &&
      width > 0 &&
      height > 0 &&
      width * height <= limit
    );
  }
  query(box: Bounds): Box[] {
    const cells = this.range(box);
    if (!this.enumerable(cells, 4096))
      return this.boxes.filter((candidate) => overlaps(candidate, box));
    const found = new Set(this.large);
    for (let x = cells.left; x <= cells.right; x++)
      for (let y = cells.top; y <= cells.bottom; y++)
        for (const index of this.cells.get(`${x},${y}`) || []) found.add(index);
    // Stable board order preserves snap tie-breaking across grid cells.
    return [...found]
      .sort((a, b) => a - b)
      .map((index) => this.boxes[index])
      .filter((candidate) => overlaps(candidate, box));
  }
}
