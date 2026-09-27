import { describe, it, expect } from 'vitest';
import { findWeightedPath } from '../../src/algorithms/astar';
import { createDefaultGrid, Cell, TerrainType } from '../../src/domain/terrain';
import { Coordinate, areAdjacent } from '../../src/domain/coordinates';

function makeGrid(w: number, h: number): Cell[][] {
  return createDefaultGrid(w, h);
}

describe('A* Pathfinding', () => {
  it('should find the shortest path on a plain map', () => {
    const grid = makeGrid(24, 16);
    const result = findWeightedPath(grid, { x: 0, y: 0 }, { x: 5, y: 5 });
    expect(result.status).toBe('success');
    expect(result.totalCost).toBe(10); // 5 right + 5 down = 10 road cells
    expect(result.path.length).toBe(11); // includes start
    expect(result.visitedNodes).toBeGreaterThan(0);
  });

  it('should prefer longer low-cost path over short high-cost path (weighted detour)', () => {
    const grid = makeGrid(24, 16);
    // Short path through hazardous cells: (5,5)->(5,6)->(5,7)->(5,8)->(5,9)
    // Cost: 1 (start) + 6 + 6 + 6 + 1 (goal) = 20... actually entering costs
    // Hazardous at y=6,7,8 at x=5
    grid[6][5].terrain = 'hazardous';
    grid[7][5].terrain = 'hazardous';
    grid[8][5].terrain = 'hazardous';

    const result = findWeightedPath(grid, { x: 5, y: 5 }, { x: 5, y: 9 });

    expect(result.status).toBe('success');
    // The A* should avoid the hazardous cells and go around
    // Longer route around: (5,5)->(6,5)->(6,6)->(6,7)->(6,8)->(6,9)->(5,9) = 6 road = cost 6
    // Short route: (5,5)->(5,6)[haz=6]->(5,7)[haz=6]->(5,8)[haz=6]->(5,9) = cost 18
    // A* should pick the longer but cheaper route
    expect(result.totalCost!).toBeLessThan(18);
    expect(result.path.some(c => grid[c.y][c.x].terrain === 'hazardous')).toBe(false);
  });

  it('should calculate weighted path cost correctly', () => {
    const grid = makeGrid(24, 16);
    // Make (1,0) congested (cost 3)
    grid[0][1].terrain = 'congested';
    // Path from (0,0) to (2,0): must go through (1,0)
    // Cost: enter (1,0) = 3, enter (2,0) = 1 → total = 4
    // Path length - 1 = 2, but totalCost = 4 because of congested
    const result = findWeightedPath(grid, { x: 0, y: 0 }, { x: 2, y: 0 });
    expect(result.status).toBe('success');
    expect(result.totalCost).toBeGreaterThan(0);
    // Verify cost is computed from terrain, not just step count
    let manualCost = 0;
    for (let i = 1; i < result.path.length; i++) {
      const c = result.path[i];
      const t = grid[c.y][c.x].terrain;
      manualCost += t === 'road' || t === 'station' || t === 'incident' ? 1 :
        t === 'congested' ? 3 : t === 'hazardous' ? 6 : 0;
    }
    expect(result.totalCost).toBe(manualCost);
  });

  it('should not pass through obstacles', () => {
    const grid = makeGrid(24, 16);
    grid[1][1].terrain = 'blocked';
    grid[2][1].terrain = 'blocked';
    grid[1][2].terrain = 'blocked';

    const result = findWeightedPath(grid, { x: 0, y: 0 }, { x: 3, y: 3 });
    expect(result.status).toBe('success');
    for (const c of result.path) {
      expect(grid[c.y][c.x].terrain).not.toBe('blocked');
    }
  });

  it('should return unreachable for blocked target', () => {
    const grid = makeGrid(24, 16);
    // Completely surround the target
    grid[5][4].terrain = 'blocked';
    grid[5][6].terrain = 'blocked';
    grid[4][5].terrain = 'blocked';
    grid[6][5].terrain = 'blocked';
    grid[5][5].terrain = 'blocked'; // target itself is blocked

    const result = findWeightedPath(grid, { x: 0, y: 0 }, { x: 5, y: 5 });
    expect(result.status).toBe('unreachable');
    expect(result.totalCost).toBeNull();
  });

  it('should return unreachable when surrounded by obstacles', () => {
    const grid = makeGrid(24, 16);
    // Surround target
    grid[4][4].terrain = 'blocked';
    grid[4][5].terrain = 'blocked';
    grid[4][6].terrain = 'blocked';
    grid[5][4].terrain = 'blocked';
    grid[5][6].terrain = 'blocked';
    grid[6][4].terrain = 'blocked';
    grid[6][5].terrain = 'blocked';
    grid[6][6].terrain = 'blocked';

    const result = findWeightedPath(grid, { x: 0, y: 0 }, { x: 5, y: 5 });
    expect(result.status).toBe('unreachable');
  });

  it('should be deterministic - same input produces same output', () => {
    const grid = makeGrid(24, 16);
    grid[3][3].terrain = 'congested';
    grid[5][5].terrain = 'hazardous';

    const r1 = findWeightedPath(grid, { x: 0, y: 0 }, { x: 10, y: 10 });
    const r2 = findWeightedPath(grid, { x: 0, y: 0 }, { x: 10, y: 10 });

    expect(r1.status).toBe(r2.status);
    expect(r1.totalCost).toBe(r2.totalCost);
    expect(r1.path).toEqual(r2.path);
    expect(r1.visitedNodes).toBe(r2.visitedNodes);
  });

  it('should have all consecutive coordinates adjacent', () => {
    const grid = makeGrid(24, 16);
    const result = findWeightedPath(grid, { x: 0, y: 0 }, { x: 10, y: 10 });
    expect(result.status).toBe('success');
    for (let i = 1; i < result.path.length; i++) {
      expect(areAdjacent(result.path[i - 1], result.path[i])).toBe(true);
    }
  });

  it('visitedNodes should be from real search', () => {
    const grid = makeGrid(24, 16);
    const result = findWeightedPath(grid, { x: 0, y: 0 }, { x: 23, y: 15 });
    expect(result.status).toBe('success');
    expect(result.visitedNodes).toBeGreaterThan(0);
    expect(result.visitedNodes).toBeLessThanOrEqual(24 * 16); // Can't visit more than total cells
  });

  it('should handle start equals goal', () => {
    const grid = makeGrid(24, 16);
    const result = findWeightedPath(grid, { x: 5, y: 5 }, { x: 5, y: 5 });
    expect(result.status).toBe('success');
    expect(result.totalCost).toBe(0);
    expect(result.path.length).toBe(1);
    expect(result.path[0]).toEqual({ x: 5, y: 5 });
  });

  it('should handle out-of-bounds start', () => {
    const grid = makeGrid(24, 16);
    const result = findWeightedPath(grid, { x: -1, y: 0 }, { x: 5, y: 5 });
    expect(result.status).toBe('unreachable');
  });

  it('should handle out-of-bounds goal', () => {
    const grid = makeGrid(24, 16);
    const result = findWeightedPath(grid, { x: 0, y: 0 }, { x: 99, y: 99 });
    expect(result.status).toBe('unreachable');
  });
});
