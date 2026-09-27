export type TerrainType = 'road' | 'congested' | 'hazardous' | 'blocked' | 'station' | 'incident';

export interface Cell {
  x: number;
  y: number;
  terrain: TerrainType;
}

export const TERRAIN_COST: Record<TerrainType, number | null> = {
  road: 1,
  congested: 3,
  hazardous: 6,
  blocked: null,
  station: 1,
  incident: 1,
};

export const TERRAIN_LABELS: Record<TerrainType, string> = {
  road: 'Road',
  congested: 'Congested',
  hazardous: 'Hazardous',
  blocked: 'Blocked',
  station: 'Station',
  incident: 'Incident',
};

export function isWalkable(terrain: TerrainType): boolean {
  return terrain !== 'blocked';
}

export function getCost(terrain: TerrainType): number | null {
  return TERRAIN_COST[terrain];
}

export function createDefaultGrid(width: number, height: number): Cell[][] {
  const grid: Cell[][] = [];
  for (let y = 0; y < height; y++) {
    const row: Cell[] = [];
    for (let x = 0; x < width; x++) {
      row.push({ x, y, terrain: 'road' });
    }
    grid.push(row);
  }
  return grid;
}

export function cloneGrid(grid: Cell[][]): Cell[][] {
  return grid.map(row => row.map(cell => ({ ...cell })));
}

export function gridToArray(grid: Cell[][]): Cell[] {
  return grid.flat();
}

export function arrayToGrid(cells: Cell[], width: number, height: number): Cell[][] {
  const grid: Cell[][] = [];
  for (let y = 0; y < height; y++) {
    grid.push(cells.slice(y * width, (y + 1) * width).map(c => ({ ...c })));
  }
  return grid;
}
