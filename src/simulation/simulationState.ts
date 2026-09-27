import { Cell, cloneGrid } from '../domain/terrain';
import { Vehicle, VehicleStatus, cloneVehicle } from '../domain/vehicle';
import { Incident, IncidentStatus, cloneIncident } from '../domain/incident';
import { Coordinate, coordKey, coordsEqual } from '../domain/coordinates';
import { findWeightedPath } from '../algorithms/astar';
import { assignIncidentsGlobally, Assignment } from '../algorithms/assignment';
import { createReservationTable, addVertexReservation, addEdgeReservation, isVertexReserved, isEdgeReserved } from '../algorithms/reservationTable';
import { naturalCompare } from '../domain/coordinates';

export type SimulationStatus = 'idle' | 'planning' | 'running' | 'paused' | 'finished';

export interface SimulationLog {
  id: string;
  tick: number;
  timestamp: string;
  type: string;
  severity: 'info' | 'warning' | 'error' | 'success';
  message: string;
  vehicleId?: string;
  incidentId?: string;
}

export interface Conflict {
  type: 'vertex' | 'edge_swap' | 'stationary_occupation';
  tick: number;
  vehicleId1: string;
  vehicleId2?: string;
  coord1: Coordinate;
  coord2?: Coordinate;
}

export interface SimulationState {
  grid: Cell[][];
  vehicles: Vehicle[];
  incidents: Incident[];
  tick: number;
  status: SimulationStatus;
  logs: SimulationLog[];
  conflictsAvoided: number;
  potentialConflicts: number;
  actualCollisions: number;
  logIdCounter: number;
}

export function createSimulationState(
  grid: Cell[][],
  vehicles: Vehicle[],
  incidents: Incident[]
): SimulationState {
  return {
    grid: cloneGrid(grid),
    vehicles: vehicles.map(cloneVehicle),
    incidents: incidents.map(cloneIncident),
    tick: 0,
    status: 'idle',
    logs: [],
    conflictsAvoided: 0,
    potentialConflicts: 0,
    actualCollisions: 0,
    logIdCounter: 1,
  };
}

function addLog(sim: SimulationState, type: string, severity: 'info' | 'warning' | 'error' | 'success', message: string, vehicleId?: string, incidentId?: string): void {
  sim.logs.push({
    id: `log-${sim.logIdCounter++}`,
    tick: sim.tick,
    timestamp: new Date().toISOString(),
    type,
    severity,
    message,
    vehicleId,
    incidentId,
  });
}

export function planSimulation(sim: SimulationState): void {
  const pendingIncidents = sim.incidents.filter(i => i.status === 'pending');
  const movableVehicles = sim.vehicles.filter(v => v.status === 'idle' || v.status === 'completed');

  if (pendingIncidents.length === 0) {
    sim.status = 'finished';
    addLog(sim, 'simulation_end', 'info', 'No pending incidents. Simulation finished.');
    return;
  }

  if (movableVehicles.length === 0) {
    // Check if all pending are unreachable
    const allUnreachable = pendingIncidents.every(i => {
      for (const v of sim.vehicles) {
        const r = findWeightedPath(sim.grid, v.position, i.position);
        if (r.status === 'success') return false;
      }
      return true;
    });
    if (allUnreachable) {
      for (const inc of pendingIncidents) {
        inc.status = 'unreachable';
      }
      sim.status = 'finished';
      addLog(sim, 'simulation_end', 'info', 'All remaining incidents unreachable. Simulation finished.');
    }
    return;
  }

  sim.status = 'planning';
  addLog(sim, 'assignment_start', 'info', `Assigning ${pendingIncidents.length} incidents to ${movableVehicles.length} vehicles.`);

  const result = assignIncidentsGlobally(movableVehicles, pendingIncidents, sim.grid);

  for (const a of result.assignments) {
    const vehicle = sim.vehicles.find(v => v.id === a.vehicleId);
    const incident = sim.incidents.find(i => i.id === a.incidentId);
    if (!vehicle || !incident) continue;

    const pathResult = findWeightedPath(sim.grid, vehicle.position, incident.position);
    if (pathResult.status === 'success') {
      vehicle.status = 'moving';
      vehicle.targetIncidentId = incident.id;
      vehicle.plannedPath = pathResult.path;
      vehicle.pathIndex = 0;
      vehicle.startPosition = { ...vehicle.position };

      incident.status = 'assigned';
      incident.assignedVehicleId = vehicle.id;

      addLog(sim, 'assignment', 'success', `Vehicle ${vehicle.id} assigned to incident ${incident.id}, cost: ${a.pathCost}`, vehicle.id, incident.id);
    }
  }

  for (const vid of result.unreachableVehicles) {
    const v = sim.vehicles.find(ve => ve.id === vid);
    if (v) {
      v.status = 'unreachable';
      addLog(sim, 'unreachable_vehicle', 'warning', `Vehicle ${vid} cannot reach any incident.`, vid);
    }
  }

  for (const iid of result.unreachableIncidents) {
    const inc = sim.incidents.find(i => i.id === iid);
    if (inc) {
      inc.status = 'unreachable';
      addLog(sim, 'unreachable_incident', 'warning', `Incident ${iid} is unreachable by all vehicles.`, undefined, iid);
    }
  }

  if (result.assignments.length === 0) {
    sim.status = 'finished';
    addLog(sim, 'simulation_end', 'info', 'No valid assignments possible. Simulation finished.');
  } else {
    sim.status = 'running';
    addLog(sim, 'simulation_start', 'info', `Simulation started with ${result.assignments.length} assignments.`);
  }
}

const MAX_CONSECUTIVE_WAIT_TICKS = 3;

export function advanceSimulationTick(sim: SimulationState): void {
  if (sim.status !== 'running' && sim.status !== 'paused') return;

  const tick = sim.tick + 1;
  sim.tick = tick;

  // Sort vehicles by ID for priority (natural sort)
  const sortedVehicles = [...sim.vehicles].sort((a, b) => naturalCompare(a.id, b.id));

  // Build reservation table
  const reservationTable = createReservationTable();

  // First pass: reserve positions of stationary vehicles
  for (const v of sortedVehicles) {
    if (v.status === 'idle' || v.status === 'waiting' || v.status === 'completed' || v.status === 'unreachable') {
      addVertexReservation(reservationTable, tick, v.position);
    }
  }

  // Determine candidate moves for each vehicle
  interface CandidateMove {
    vehicle: Vehicle;
    newPosition: Coordinate;
    newPathIndex: number;
  }

  const candidateMoves: CandidateMove[] = [];

  for (const v of sortedVehicles) {
    if (v.status === 'moving' || v.status === 'replanning') {
      const nextIdx = v.pathIndex + 1;
      if (nextIdx < v.plannedPath.length) {
        const nextPos = v.plannedPath[nextIdx];

        // Check if at target already
        const targetInc = v.targetIncidentId ? sim.incidents.find(i => i.id === v.targetIncidentId) : null;
        if (targetInc && coordsEqual(v.position, targetInc.position)) {
          // Complete the task
          v.status = 'completed';
          v.completedTasks++;
          targetInc.status = 'completed';
          targetInc.completedTick = tick;
          addLog(sim, 'task_complete', 'success', `Vehicle ${v.id} completed incident ${targetInc.id}`, v.id, targetInc.id);
          addVertexReservation(reservationTable, tick, v.position);
          continue;
        }

        candidateMoves.push({
          vehicle: v,
          newPosition: nextPos,
          newPathIndex: nextIdx,
        });
      } else if (v.plannedPath.length > 0) {
        const lastPos = v.plannedPath[v.plannedPath.length - 1];
        if (coordsEqual(v.position, lastPos)) {
          // Check if incident is at this position
          const targetInc = v.targetIncidentId ? sim.incidents.find(i => i.id === v.targetIncidentId) : null;
          if (targetInc && coordsEqual(v.position, targetInc.position)) {
            v.status = 'completed';
            v.completedTasks++;
            targetInc.status = 'completed';
            targetInc.completedTick = tick;
            addLog(sim, 'task_complete', 'success', `Vehicle ${v.id} completed incident ${targetInc.id}`, v.id, targetInc.id);
          } else {
            // Need replanning
            v.status = 'replanning';
            addLog(sim, 'replanning_needed', 'warning', `Vehicle ${v.id} reached end of path but incident not found.`, v.id);
          }
        }
        addVertexReservation(reservationTable, tick, v.position);
      } else {
        addVertexReservation(reservationTable, tick, v.position);
      }
    } else {
      addVertexReservation(reservationTable, tick, v.position);
    }
  }

  // Resolve conflicts among candidate moves
  const resolvedMoves: Map<string, CandidateMove> = new Map();
  const conflictedVehicles = new Set<string>();

  // Check for vertex conflicts
  const vertexMap = new Map<string, string[]>(); // coordKey -> vehicleIds

  for (const move of candidateMoves) {
    const key = coordKey(move.newPosition);
    if (!vertexMap.has(key)) {
      vertexMap.set(key, []);
    }
    vertexMap.get(key)!.push(move.vehicle.id);
  }

  // Check for edge swaps
  const edgeConflicts = new Set<string>();
  for (let i = 0; i < candidateMoves.length; i++) {
    for (let j = i + 1; j < candidateMoves.length; j++) {
      const a = candidateMoves[i];
      const b = candidateMoves[j];
      if (
        coordsEqual(a.vehicle.position, b.newPosition) &&
        coordsEqual(b.vehicle.position, a.newPosition)
      ) {
        edgeConflicts.add(a.vehicle.id);
        edgeConflicts.add(b.vehicle.id);
        sim.potentialConflicts++;
        addLog(sim, 'edge_swap_avoided', 'warning', `Edge swap avoided: ${a.vehicle.id} and ${b.vehicle.id}`);
      }
    }
  }

  // Resolve conflicts
  for (const move of candidateMoves) {
    const vId = move.vehicle.id;
    const key = coordKey(move.newPosition);

    const competing = vertexMap.get(key) || [];
    const hasVertexConflict = competing.length > 1;

    // Check if stationary vehicle occupies this position
    const isReserved = isVertexReserved(reservationTable, tick, move.newPosition);

    if (hasVertexConflict || isReserved || edgeConflicts.has(vId)) {
      // This vehicle cannot move
      conflictedVehicles.add(vId);
      sim.potentialConflicts++;
      addLog(sim, 'vertex_conflict_avoided', 'warning', `Vehicle ${vId} conflict avoided at (${move.newPosition.x},${move.newPosition.y})`, vId);
    } else {
      resolvedMoves.set(vId, move);
    }
  }

  // Handle conflicted vehicles - let highest priority (lowest ID) go
  for (const [key, vIds] of vertexMap) {
    if (vIds.length > 1) {
      // Sort by natural order - lowest ID gets to move
      const sorted = [...vIds].sort(naturalCompare);
      const winner = sorted[0];
      for (let i = 1; i < sorted.length; i++) {
        conflictedVehicles.add(sorted[i]);
      }
      // Ensure winner is in resolved
      const winnerMove = candidateMoves.find(m => m.vehicle.id === winner);
      if (winnerMove && !conflictedVehicles.has(winner)) {
        resolvedMoves.set(winner, winnerMove);
      }
    }
  }

  // Apply resolved moves
  for (const move of resolvedMoves.values()) {
    const v = move.vehicle;
    const from = v.position;
    v.position = { ...move.newPosition };
    v.pathIndex = move.newPathIndex;
    v.traversedPath.push({ ...move.newPosition });
    v.consecutiveWaitingTicks = 0;
    v.status = 'moving';

    // Accumulate cost
    const cell = sim.grid[v.position.y][v.position.x];
    v.accumulatedMoveCost += cell.terrain === 'blocked' ? 1 : (sim.grid[v.position.y][v.position.x].terrain === 'road' ? 1 :
      sim.grid[v.position.y][v.position.x].terrain === 'congested' ? 3 :
      sim.grid[v.position.y][v.position.x].terrain === 'hazardous' ? 6 : 1);

    addVertexReservation(reservationTable, tick, v.position);
    addEdgeReservation(reservationTable, tick, from, v.position);
    addLog(sim, 'vehicle_move', 'info', `Vehicle ${v.id} moved to (${v.position.x},${v.position.y})`, v.id);
  }

  // Handle conflicted vehicles - they must wait
  for (const vId of conflictedVehicles) {
    const v = sim.vehicles.find(ve => ve.id === vId);
    if (!v || !resolvedMoves.has(vId) && v.status !== 'waiting' && v.status !== 'replanning') continue;

    if (!resolvedMoves.has(vId)) {
      v.status = 'waiting';
      v.totalWaitingTicks++;
      v.consecutiveWaitingTicks++;
      addLog(sim, 'vehicle_waiting', 'warning', `Vehicle ${vId} waiting at (${v.position.x},${v.position.y}), consecutive: ${v.consecutiveWaitingTicks}`, vId);

      if (v.consecutiveWaitingTicks >= MAX_CONSECUTIVE_WAIT_TICKS) {
        v.status = 'replanning';
        v.replanCount++;
        addLog(sim, 'replanning_triggered', 'warning', `Vehicle ${vId} replanning after ${v.consecutiveWaitingTicks} consecutive waits`, vId);

        // Replan route
        if (v.targetIncidentId) {
          const inc = sim.incidents.find(i => i.id === v.targetIncidentId);
          if (inc) {
            const pathResult = findWeightedPath(sim.grid, v.position, inc.position);
            if (pathResult.status === 'success') {
              v.plannedPath = pathResult.path;
              v.pathIndex = 0;
              v.consecutiveWaitingTicks = 0;
              v.status = 'moving';
              addLog(sim, 'replanning_success', 'success', `Vehicle ${vId} replanned successfully.`, vId);
            } else {
              // No alternative path - mark incident unreachable
              inc.status = 'unreachable';
              inc.assignedVehicleId = null;
              v.status = 'unreachable';
              v.targetIncidentId = null;
              addLog(sim, 'replanning_failed', 'error', `Vehicle ${vId} has no alternative path to incident ${inc.id}`, vId, inc.id);
            }
          }
        }
      }
    }
  }

  // Check for incident completion
  for (const v of sim.vehicles) {
    if (v.status === 'moving' && v.targetIncidentId) {
      const inc = sim.incidents.find(i => i.id === v.targetIncidentId);
      if (inc && coordsEqual(v.position, inc.position)) {
        v.status = 'completed';
        v.completedTasks++;
        inc.status = 'completed';
        inc.completedTick = tick;
        addLog(sim, 'task_complete', 'success', `Vehicle ${v.id} completed incident ${inc.id}`, v.id, inc.id);
      }
    }
  }

  // Check for remaining pending incidents and available vehicles
  const pendingIncidents = sim.incidents.filter(i => i.status === 'pending');
  const availableVehicles = sim.vehicles.filter(v => v.status === 'idle' || v.status === 'completed');

  if (pendingIncidents.length > 0 && availableVehicles.length > 0) {
    addLog(sim, 'assignment_wave', 'info', `Wave assignment: ${pendingIncidents.length} incidents, ${availableVehicles.length} vehicles.`);
    const result = assignIncidentsGlobally(availableVehicles, pendingIncidents, sim.grid);

    for (const a of result.assignments) {
      const vehicle = sim.vehicles.find(v => v.id === a.vehicleId);
      const incident = sim.incidents.find(i => i.id === a.incidentId);
      if (!vehicle || !incident) continue;

      const pathResult = findWeightedPath(sim.grid, vehicle.position, incident.position);
      if (pathResult.status === 'success') {
        vehicle.status = 'moving';
        vehicle.targetIncidentId = incident.id;
        vehicle.plannedPath = pathResult.path;
        vehicle.pathIndex = 0;
        vehicle.startPosition = { ...vehicle.position };

        incident.status = 'assigned';
        incident.assignedVehicleId = vehicle.id;

        addLog(sim, 'assignment', 'success', `Wave: Vehicle ${vehicle.id} assigned to incident ${incident.id}`, vehicle.id, incident.id);
      }
    }

    for (const iid of result.unreachableIncidents) {
      const inc = sim.incidents.find(i => i.id === iid);
      if (inc && inc.status === 'pending') {
        inc.status = 'unreachable';
        addLog(sim, 'unreachable_incident', 'warning', `Incident ${iid} is unreachable.`, undefined, iid);
      }
    }
  }

  // Check if simulation is finished
  const allResolved = sim.incidents.every(i => i.status === 'completed' || i.status === 'unreachable');
  if (allResolved) {
    // Also check if no pending/moving vehicles needed
    const noActiveMoves = sim.vehicles.every(v =>
      v.status === 'idle' || v.status === 'completed' || v.status === 'unreachable'
    );
    if (noActiveMoves) {
      sim.status = 'finished';
      addLog(sim, 'simulation_end', 'info', 'All incidents resolved. Simulation finished.');
    }
  }

  // Check for deadlock: no vehicle can reach any pending incident
  const stillPending = sim.incidents.filter(i => i.status === 'pending');
  if (stillPending.length > 0) {
    const allUnreachable = stillPending.every(inc => {
      for (const v of sim.vehicles) {
        if (v.status === 'idle' || v.status === 'completed') {
          const r = findWeightedPath(sim.grid, v.position, inc.position);
          if (r.status === 'success') return false;
        }
      }
      return true;
    });
    if (allUnreachable) {
      for (const inc of stillPending) {
        inc.status = 'unreachable';
      }
      sim.status = 'finished';
      addLog(sim, 'simulation_end', 'info', 'All remaining incidents unreachable. Simulation finished.');
    }
  }
}
