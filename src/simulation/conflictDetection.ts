import { Vehicle } from '../domain/vehicle';
import { coordKey, coordsEqual } from '../domain/coordinates';

export interface Conflict {
  type: 'vertex' | 'edge_swap' | 'stationary_occupation';
  tick: number;
  vehicleId1: string;
  vehicleId2?: string;
  coord1: { x: number; y: number };
  coord2?: { x: number; y: number };
}

export function detectActualConflicts(
  previousVehicles: Vehicle[],
  nextVehicles: Vehicle[]
): Conflict[] {
  const conflicts: Conflict[] = [];

  // Vertex conflicts: two vehicles in same cell
  const positionMap = new Map<string, Vehicle[]>();
  for (const v of nextVehicles) {
    const key = coordKey(v.position);
    if (!positionMap.has(key)) {
      positionMap.set(key, []);
    }
    positionMap.get(key)!.push(v);
  }

  for (const [, vehicles] of positionMap) {
    if (vehicles.length > 1) {
      for (let i = 1; i < vehicles.length; i++) {
        conflicts.push({
          type: 'vertex',
          tick: 0,
          vehicleId1: vehicles[0].id,
          vehicleId2: vehicles[i].id,
          coord1: vehicles[0].position,
        });
      }
    }
  }

  // Edge swap conflicts
  const prevPositions = new Map<string, Vehicle>();
  for (const v of previousVehicles) {
    prevPositions.set(v.id, v);
  }

  for (const v1 of nextVehicles) {
    for (const v2 of nextVehicles) {
      if (v1.id >= v2.id) continue;
      const p1 = prevPositions.get(v1.id);
      const p2 = prevPositions.get(v2.id);
      if (!p1 || !p2) continue;

      if (
        coordsEqual(p1.position, v2.position) &&
        coordsEqual(p2.position, v1.position)
      ) {
        conflicts.push({
          type: 'edge_swap',
          tick: 0,
          vehicleId1: v1.id,
          vehicleId2: v2.id,
          coord1: v1.position,
          coord2: v2.position,
        });
      }
    }
  }

  return conflicts;
}

export function validateMove(
  vehicleId: string,
  currentPositions: Map<string, { x: number; y: number }>,
  stationaryVehicles: Set<string>,
  proposedPosition: { x: number; y: number }
): { valid: boolean; reason?: string } {
  const key = coordKey(proposedPosition);

  // Check if another moving vehicle is going to this position
  for (const [vid, pos] of currentPositions) {
    if (vid !== vehicleId && coordKey(pos) === key) {
      return { valid: false, reason: `Vertex conflict: ${vid} already moving to (${proposedPosition.x},${proposedPosition.y})` };
    }
  }

  return { valid: true };
}
