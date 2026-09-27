import { SimulationState } from './simulationState';
import { Cell, TerrainType, isWalkable } from '../domain/terrain';
import { Vehicle } from '../domain/vehicle';
import { Coordinate, coordsEqual } from '../domain/coordinates';
import { findWeightedPath } from '../algorithms/astar';
import { assignIncidentsGlobally } from '../algorithms/assignment';

export interface MapChange {
  x: number;
  y: number;
  newTerrain: TerrainType;
}

export interface DynamicUpdateResult {
  simulation: SimulationState;
  affectedVehicleIds: string[];
  replannedVehicleIds: string[];
  newlyUnreachableIncidentIds: string[];
  reason: string;
}

export function applyMapChangeToSimulation(
  simulation: SimulationState,
  mapChange: MapChange
): DynamicUpdateResult {
  const { x, y, newTerrain } = mapChange;
  const affectedVehicleIds: string[] = [];
  const replannedVehicleIds: string[] = [];
  const newlyUnreachableIncidentIds: string[] = [];

  // Check if any vehicle or incident is at this position
  const vehicleAtPos = simulation.vehicles.find(v => coordsEqual(v.position, { x, y }));
  const incidentAtPos = simulation.incidents.find(i => coordsEqual(i.position, { x, y }));

  if (newTerrain === 'blocked' && (vehicleAtPos || incidentAtPos)) {
    return {
      simulation,
      affectedVehicleIds: [],
      replannedVehicleIds: [],
      newlyUnreachableIncidentIds: [],
      reason: `Cannot change cell (${x},${y}) to blocked: occupied by ${vehicleAtPos ? 'vehicle ' + vehicleAtPos.id : 'incident ' + incidentAtPos?.id}`,
    };
  }

  // Apply change to grid
  simulation.grid[y][x].terrain = newTerrain;

  const reasonParts: string[] = [`Map changed: (${x},${y}) -> ${newTerrain}`];

  // Find affected vehicles
  for (const v of simulation.vehicles) {
    let affected = false;

    // Current position is at the changed cell
    if (coordsEqual(v.position, { x, y })) {
      affected = true;
      reasonParts.push(`Vehicle ${v.id} is at changed cell.`);
    }

    // Target position is at the changed cell
    if (v.targetIncidentId) {
      const inc = simulation.incidents.find(i => i.id === v.targetIncidentId);
      if (inc && coordsEqual(inc.position, { x, y })) {
        affected = true;
        reasonParts.push(`Vehicle ${v.id} target at changed cell.`);
      }
    }

    // Changed cell is in remaining path
    if (!affected && v.plannedPath.length > v.pathIndex) {
      const remaining = v.plannedPath.slice(v.pathIndex);
      if (remaining.some(c => c.x === x && c.y === y)) {
        affected = true;
        reasonParts.push(`Vehicle ${v.id} remaining path passes through changed cell.`);
      }
    }

    // Cost reduction might offer better alternative
    if (!affected && v.status === 'moving' && v.plannedPath.length > 0) {
      const oldCost = v.plannedPath.length > 0 ? 1 : 0;
      if (newTerrain === 'road' || newTerrain === 'station') {
        // Cost reduction - check if an alternative route through this cell is better
        if (v.targetIncidentId) {
          const inc = simulation.incidents.find(i => i.id === v.targetIncidentId);
          if (inc) {
            const newPath = findWeightedPath(simulation.grid, v.position, inc.position);
            if (newPath.status === 'success') {
              const remainingOldCost = calculatePathCost(simulation.grid, v.plannedPath.slice(v.pathIndex));
              const newPathCost = newPath.totalCost ?? Infinity;
              if (newPathCost < remainingOldCost) {
                affected = true;
                reasonParts.push(`Vehicle ${v.id}: cost reduction creates better alternative route.`);
              }
            }
          }
        }
      }
    }

    if (affected) {
      affectedVehicleIds.push(v.id);
    }
  }

  // Replan affected vehicles
  for (const vId of affectedVehicleIds) {
    const v = simulation.vehicles.find(ve => ve.id === vId);
    if (!v) continue;

    const targetIncident = v.targetIncidentId
      ? simulation.incidents.find(i => i.id === v.targetIncidentId)
      : null;

    if (!targetIncident && v.status !== 'moving' && v.status !== 'waiting' && v.status !== 'replanning') {
      continue;
    }

    if (targetIncident) {
      const pathResult = findWeightedPath(simulation.grid, v.position, targetIncident.position);

      if (pathResult.status === 'success') {
        v.plannedPath = pathResult.path;
        v.pathIndex = 0;
        v.status = 'moving';
        v.consecutiveWaitingTicks = 0;
        replannedVehicleIds.push(v.id);
        v.replanCount++;

        simulation.logs.push({
          id: `log-${simulation.logIdCounter++}`,
          tick: simulation.tick,
          timestamp: new Date().toISOString(),
          type: 'dynamic_replanning',
          severity: 'warning',
          message: `Dynamic replanning: Vehicle ${v.id} replanned due to map change at (${x},${y})`,
          vehicleId: v.id,
        });
      } else {
        // Unreachable
        v.status = 'unreachable';
        targetIncident.status = 'unreachable';
        targetIncident.assignedVehicleId = null;
        v.targetIncidentId = null;
        newlyUnreachableIncidentIds.push(targetIncident.id);

        simulation.logs.push({
          id: `log-${simulation.logIdCounter++}`,
          tick: simulation.tick,
          timestamp: new Date().toISOString(),
          type: 'dynamic_replanning_failed',
          severity: 'error',
          message: `Vehicle ${v.id} cannot reach incident ${targetIncident.id} after map change`,
          vehicleId: v.id,
          incidentId: targetIncident.id,
        });
      }
    }
  }

  // Handle unassigned pending incidents after map change
  const pendingIncidents = simulation.incidents.filter(i => i.status === 'pending');
  const availableVehicles = simulation.vehicles.filter(v => v.status === 'idle' || v.status === 'completed');

  if (pendingIncidents.length > 0 && availableVehicles.length > 0) {
    const assignmentResult = assignIncidentsGlobally(availableVehicles, pendingIncidents, simulation.grid);
    for (const a of assignmentResult.assignments) {
      const v = simulation.vehicles.find(ve => ve.id === a.vehicleId);
      const inc = simulation.incidents.find(i => i.id === a.incidentId);
      if (!v || !inc) continue;

      const pathResult = findWeightedPath(simulation.grid, v.position, inc.position);
      if (pathResult.status === 'success') {
        v.status = 'moving';
        v.targetIncidentId = inc.id;
        v.plannedPath = pathResult.path;
        v.pathIndex = 0;
        v.startPosition = { ...v.position };
        inc.status = 'assigned';
        inc.assignedVehicleId = v.id;

        if (!replannedVehicleIds.includes(v.id)) {
          replannedVehicleIds.push(v.id);
        }
      }
    }

    for (const iid of assignmentResult.unreachableIncidents) {
      const inc = simulation.incidents.find(i => i.id === iid);
      if (inc && inc.status === 'pending') {
        inc.status = 'unreachable';
        newlyUnreachableIncidentIds.push(iid);
      }
    }
  }

  return {
    simulation,
    affectedVehicleIds,
    replannedVehicleIds,
    newlyUnreachableIncidentIds,
    reason: reasonParts.join(' | '),
  };
}

function calculatePathCost(grid: Cell[][], path: Coordinate[]): number {
  let cost = 0;
  for (let i = 1; i < path.length; i++) {
    const cell = grid[path[i].y]?.[path[i].x];
    if (cell) {
      const c = cell.terrain === 'road' || cell.terrain === 'station' || cell.terrain === 'incident' ? 1
        : cell.terrain === 'congested' ? 3
        : cell.terrain === 'hazardous' ? 6
        : 1;
      cost += c;
    }
  }
  return cost;
}
