export interface Coordinate {
  x: number;
  y: number;
}

export function coordKey(c: Coordinate): string {
  return `${c.x},${c.y}`;
}

export function coordsEqual(a: Coordinate, b: Coordinate): boolean {
  return a.x === b.x && a.y === b.y;
}

export function areAdjacent(a: Coordinate, b: Coordinate): boolean {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return (dx === 1 && dy === 0) || (dx === 0 && dy === 1);
}

export function manhattan(a: Coordinate, b: Coordinate): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function getNeighbors(c: Coordinate, width: number, height: number): Coordinate[] {
  const result: Coordinate[] = [];
  const dirs: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // up, right, down, left
  for (const [dx, dy] of dirs) {
    const nx = c.x + dx;
    const ny = c.y + dy;
    if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
      result.push({ x: nx, y: ny });
    }
  }
  return result;
}

export function naturalCompare(a: string, b: string): number {
  const re = /(\d+)|(\D+)/g;
  const aParts = a.match(re) || [];
  const bParts = b.match(re) || [];
  for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
    const ap = aParts[i] || '';
    const bp = bParts[i] || '';
    const aNum = parseInt(ap, 10);
    const bNum = parseInt(bp, 10);
    if (!isNaN(aNum) && !isNaN(bNum)) {
      if (aNum !== bNum) return aNum - bNum;
    } else {
      if (ap !== bp) return ap < bp ? -1 : 1;
    }
  }
  return 0;
}
