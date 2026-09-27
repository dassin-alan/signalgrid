import { Vehicle } from '../domain/vehicle';
import { Incident } from '../domain/incident';
import { Cell } from '../domain/terrain';
import { naturalCompare } from '../domain/coordinates';
import { findWeightedPath } from './astar';

export interface Assignment {
  vehicleId: string;
  incidentId: string;
  pathCost: number;
}

export interface AssignmentResult {
  assignments: Assignment[];
  unassignedVehicles: string[];
  unassignedIncidents: string[];
  unreachableVehicles: string[];
  unreachableIncidents: string[];
}

function buildCostMatrix(
  vehicles: Vehicle[],
  incidents: Incident[],
  grid: Cell[][]
): (number | null)[][] {
  const matrix: (number | null)[][] = [];
  for (const v of vehicles) {
    const row: (number | null)[] = [];
    for (const inc of incidents) {
      const result = findWeightedPath(grid, v.position, inc.position);
      if (result.status === 'success') {
        row.push(result.totalCost);
      } else {
        row.push(null);
      }
    }
    matrix.push(row);
  }
  return matrix;
}

// Hungarian algorithm implementation for assignment problem
// Returns minimum cost assignment
function hungarian(costMatrix: (number | null)[][]): { row: number; col: number; cost: number }[] {
  const n = costMatrix.length;
  const m = costMatrix[0]?.length ?? 0;
  if (n === 0 || m === 0) return [];

  const size = Math.max(n, m);
  // Build square matrix, fill missing with Infinity
  const matrix: number[][] = [];
  for (let i = 0; i < size; i++) {
    const row: number[] = [];
    for (let j = 0; j < size; j++) {
      if (i < n && j < m) {
        row.push(costMatrix[i][j] ?? Infinity);
      } else {
        row.push(Infinity);
      }
    }
    matrix.push(row);
  }

  const u = new Array<number>(size + 1).fill(0);
  const v = new Array<number>(size + 1).fill(0);
  const p = new Array<number>(size + 1).fill(0);
  const way = new Array<number>(size + 1).fill(0);

  for (let i = 1; i <= size; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array<number>(size + 1).fill(Infinity);
    const used = new Array<boolean>(size + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = 0;
      for (let j = 1; j <= size; j++) {
        if (!used[j]) {
          const cur = matrix[i0 - 1][j - 1] - u[i0] - v[j];
          if (cur < minv[j]) {
            minv[j] = cur;
            way[j] = j0;
          }
          if (minv[j] < delta) {
            delta = minv[j];
            j1 = j;
          }
        }
      }
      for (let j = 0; j <= size; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);

    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0 !== 0);
  }

  // Extract assignments
  const result: { row: number; col: number; cost: number }[] = [];
  // p[j] gives the row assigned to column j
  const assignment = new Array<number>(size + 1).fill(0);
  for (let j = 1; j <= size; j++) {
    if (p[j] !== 0) {
      assignment[p[j]] = j;
    }
  }

  for (let i = 1; i <= n; i++) {
    const j = assignment[i];
    if (j > 0 && j <= m) {
      const cost = costMatrix[i - 1][j - 1];
      if (cost !== null && cost !== Infinity) {
        result.push({ row: i - 1, col: j - 1, cost });
      }
    }
  }

  return result;
}

export function assignIncidentsGlobally(
  vehicles: Vehicle[],
  incidents: Incident[],
  grid: Cell[][]
): AssignmentResult {
  // Build cost matrix using A* for all vehicle-incident pairs
  const costMatrix = buildCostMatrix(vehicles, incidents, grid);

  // Identify unreachable vehicles and incidents
  const unreachableVehicles: string[] = [];
  const unreachableIncidents = new Set<number>();

  for (let i = 0; i < vehicles.length; i++) {
    let anyReachable = false;
    for (let j = 0; j < incidents.length; j++) {
      if (costMatrix[i][j] !== null) {
        anyReachable = true;
        break;
      }
    }
    if (!anyReachable) {
      unreachableVehicles.push(vehicles[i].id);
    }
  }

  for (let j = 0; j < incidents.length; j++) {
    let anyReachable = false;
    for (let i = 0; i < vehicles.length; i++) {
      if (costMatrix[i][j] !== null) {
        anyReachable = true;
        break;
      }
    }
    if (!anyReachable) {
      unreachableIncidents.add(j);
    }
  }

  // Run Hungarian algorithm for minimum cost assignment
  const hungarianResult = hungarian(costMatrix);

  // Sort assignments: primary by vehicle natural sort, then by incident natural sort
  hungarianResult.sort((a, b) => {
    const vcmp = naturalCompare(vehicles[a.row].id, vehicles[b.row].id);
    if (vcmp !== 0) return vcmp;
    return naturalCompare(incidents[a.col].id, incidents[b.col].id);
  });

  const assignments: Assignment[] = hungarianResult.map(r => ({
    vehicleId: vehicles[r.row].id,
    incidentId: incidents[r.col].id,
    pathCost: r.cost,
  }));

  const assignedVehicles = new Set(assignments.map(a => a.vehicleId));
  const assignedIncidents = new Set(assignments.map(a => a.incidentId));

  const unassignedVehicles = vehicles
    .filter(v => !assignedVehicles.has(v.id) && !unreachableVehicles.includes(v.id))
    .map(v => v.id);

  const unassignedIncidents = incidents
    .filter((_, idx) => !assignedIncidents.has(incidents[idx].id) && !unreachableIncidents.has(idx))
    .map(inc => inc.id);

  return {
    assignments,
    unassignedVehicles,
    unassignedIncidents,
    unreachableVehicles,
    unreachableIncidents: Array.from(unreachableIncidents).map(idx => incidents[idx].id),
  };
}

// Greedy assignment for comparison/testing
export function assignIncidentsGreedy(
  vehicles: Vehicle[],
  incidents: Incident[],
  grid: Cell[][]
): AssignmentResult {
  const costMatrix = buildCostMatrix(vehicles, incidents, grid);

  const assignedInc = new Set<number>();
  const assignedVeh = new Set<number>();
  const assignments: Assignment[] = [];
  const unreachableVehicles: string[] = [];
  const unreachableIncidents: string[] = [];

  // Sort vehicles by ID (natural sort)
  const vehOrder = vehicles.map((v, i) => ({ v, i })).sort((a, b) => naturalCompare(a.v.id, b.v.id));

  for (const { i } of vehOrder) {
    let bestIncIdx = -1;
    let bestCost = Infinity;

    for (let j = 0; j < incidents.length; j++) {
      if (assignedInc.has(j)) continue;
      const cost = costMatrix[i][j];
      if (cost !== null && cost < bestCost) {
        bestCost = cost;
        bestIncIdx = j;
      }
    }

    if (bestIncIdx >= 0) {
      assignments.push({
        vehicleId: vehicles[i].id,
        incidentId: incidents[bestIncIdx].id,
        pathCost: bestCost,
      });
      assignedInc.add(bestIncIdx);
      assignedVeh.add(i);
    } else {
      unreachableVehicles.push(vehicles[i].id);
    }
  }

  for (let j = 0; j < incidents.length; j++) {
    if (!assignedInc.has(j)) {
      let reachable = false;
      for (let i = 0; i < vehicles.length; i++) {
        if (costMatrix[i][j] !== null) {
          reachable = true;
          break;
        }
      }
      if (!reachable) {
        unreachableIncidents.push(incidents[j].id);
      }
    }
  }

  const unassignedIncidents = incidents
    .filter((_, idx) => !assignedInc.has(idx) && !unreachableIncidents.includes(incidents[idx].id))
    .map(inc => inc.id);

  const unassignedVehicles = vehicles
    .filter((_, idx) => !assignedVeh.has(idx) && !unreachableVehicles.includes(vehicles[idx].id))
    .map(v => v.id);

  return {
    assignments,
    unassignedVehicles,
    unassignedIncidents,
    unreachableVehicles,
    unreachableIncidents,
  };
}
