import { Coordinate } from './coordinates';

export type IncidentStatus = 'pending' | 'assigned' | 'completed' | 'unreachable';

export interface Incident {
  id: string;
  position: Coordinate;
  status: IncidentStatus;
  assignedVehicleId: string | null;
  createdTick: number;
  completedTick: number | null;
}

export function createIncident(id: string, position: Coordinate, createdTick: number = 0): Incident {
  return {
    id,
    position: { ...position },
    status: 'pending',
    assignedVehicleId: null,
    createdTick,
    completedTick: null,
  };
}

export function cloneIncident(inc: Incident): Incident {
  return {
    ...inc,
    position: { ...inc.position },
  };
}
