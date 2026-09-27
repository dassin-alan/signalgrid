import { Coordinate, coordKey, getNeighbors } from '../domain/coordinates';
import { Cell, isWalkable, getCost } from '../domain/terrain';

export interface PathResult {
  status: 'success' | 'unreachable';
  path: Coordinate[];
  totalCost: number | null;
  visitedNodes: number;
  computationTimeMs: number;
}

interface AStarNode {
  coord: Coordinate;
  g: number;
  h: number;
  f: number;
  parent: AStarNode | null;
}

const DIRECTION_ORDER: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // up, right, down, left

function heuristic(a: Coordinate, b: Coordinate): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function findWeightedPath(
  grid: Cell[][],
  start: Coordinate,
  goal: Coordinate
): PathResult {
  const t0 = performance.now();

  const height = grid.length;
  const width = grid[0]?.length ?? 0;

  if (start.x < 0 || start.x >= width || start.y < 0 || start.y >= height) {
    return { status: 'unreachable', path: [], totalCost: null, visitedNodes: 0, computationTimeMs: performance.now() - t0 };
  }
  if (goal.x < 0 || goal.x >= width || goal.y < 0 || goal.y >= height) {
    return { status: 'unreachable', path: [], totalCost: null, visitedNodes: 0, computationTimeMs: performance.now() - t0 };
  }

  const startTerrain = grid[start.y][start.x].terrain;
  const goalTerrain = grid[goal.y][goal.x].terrain;
  if (!isWalkable(startTerrain) || !isWalkable(goalTerrain)) {
    return { status: 'unreachable', path: [], totalCost: null, visitedNodes: 0, computationTimeMs: performance.now() - t0 };
  }

  const openSet: AStarNode[] = [];
  const closedMap = new Map<string, AStarNode>();
  const openMap = new Map<string, AStarNode>();

  const startNode: AStarNode = {
    coord: start,
    g: 0,
    h: heuristic(start, goal),
    f: heuristic(start, goal),
    parent: null,
  };

  openSet.push(startNode);
  openMap.set(coordKey(start), startNode);

  let visitedNodes = 0;

  while (openSet.length > 0) {
    // Find node with lowest f, with deterministic tie-breaking
    let bestIdx = 0;
    for (let i = 1; i < openSet.length; i++) {
      const curr = openSet[i];
      const best = openSet[bestIdx];
      if (curr.f < best.f) {
        bestIdx = i;
      } else if (curr.f === best.f) {
        // Tie-break: prefer lower h, then by coordinate (y first, then x)
        if (curr.h < best.h) {
          bestIdx = i;
        } else if (curr.h === best.h) {
          if (curr.coord.y < best.coord.y) {
            bestIdx = i;
          } else if (curr.coord.y === best.coord.y && curr.coord.x < best.coord.x) {
            bestIdx = i;
          }
        }
      }
    }

    const current = openSet[bestIdx];
    openSet.splice(bestIdx, 1);
    openMap.delete(coordKey(current.coord));

    visitedNodes++;

    if (current.coord.x === goal.x && current.coord.y === goal.y) {
      // Reconstruct path
      const path: Coordinate[] = [];
      let node: AStarNode | null = current;
      while (node) {
        path.unshift({ x: node.coord.x, y: node.coord.y });
        node = node.parent;
      }
      const t1 = performance.now();
      return {
        status: 'success',
        path,
        totalCost: current.g,
        visitedNodes,
        computationTimeMs: t1 - t0,
      };
    }

    closedMap.set(coordKey(current.coord), current);

    const neighbors = getNeighbors(current.coord, width, height);

    for (const neighbor of neighbors) {
      const nKey = coordKey(neighbor);

      if (closedMap.has(nKey)) continue;

      const cell = grid[neighbor.y][neighbor.x];
      if (!isWalkable(cell.terrain)) continue;

      const moveCost = getCost(cell.terrain) ?? 1;
      const tentativeG = current.g + moveCost;

      const existing = openMap.get(nKey);
      if (existing && tentativeG >= existing.g) continue;

      const h = heuristic(neighbor, goal);
      const neighborNode: AStarNode = {
        coord: neighbor,
        g: tentativeG,
        h,
        f: tentativeG + h,
        parent: current,
      };

      if (existing) {
        const idx = openSet.indexOf(existing);
        if (idx >= 0) {
          openSet[idx] = neighborNode;
        }
        openMap.set(nKey, neighborNode);
      } else {
        openSet.push(neighborNode);
        openMap.set(nKey, neighborNode);
      }
    }
  }

  const t1 = performance.now();
  return {
    status: 'unreachable',
    path: [],
    totalCost: null,
    visitedNodes,
    computationTimeMs: t1 - t0,
  };
}
