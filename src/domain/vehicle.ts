import { Coordinate } from './coordinates';

export type VehicleStatus =
  | 'idle'
  | 'planning'
  | 'moving'
  | 'waiting'
  | 'replanning'
  | 'completed'
  | 'unreachable';

export interface Vehicle {
  id: string;
  position: Coordinate;
  startPosition: Coordinate;
  targetIncidentId: string | null;
  status: VehicleStatus;
  plannedPath: Coordinate[];
  traversedPath: Coordinate[];
  pathIndex: number;
  accumulatedMoveCost: number;
  totalWaitingTicks: number;
  consecutiveWaitingTicks: number;
  completedTasks: number;
  replanCount: number;
}

export function createVehicle(id: string, position: Coordinate): Vehicle {
  return {
    id,
    position: { ...position },
    startPosition: { ...position },
    targetIncidentId: null,
    status: 'idle',
    plannedPath: [],
    traversedPath: [],
    pathIndex: 0,
    accumulatedMoveCost: 0,
    totalWaitingTicks: 0,
    consecutiveWaitingTicks: 0,
    completedTasks: 0,
    replanCount: 0,
  };
}

export function cloneVehicle(v: Vehicle): Vehicle {
  return {
    ...v,
    position: { ...v.position },
    startPosition: { ...v.startPosition },
    plannedPath: [...v.plannedPath],
    traversedPath: [...v.traversedPath],
  };
}
