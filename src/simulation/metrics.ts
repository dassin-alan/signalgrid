import { SimulationState } from './simulationState';

export interface SimulationMetrics {
  totalVehicles: number;
  totalIncidents: number;
  assignedIncidents: number;
  completedIncidents: number;
  unreachableIncidents: number;
  plannedCost: number;
  actualMoveCost: number;
  totalWaitingTicks: number;
  replanCount: number;
  totalAStarNodes: number;
  currentTick: number;
  averageResponseTime: number;
  potentialConflicts: number;
  conflictsAvoided: number;
  actualCollisions: number;
}

export function selectSimulationMetrics(sim: SimulationState): SimulationMetrics {
  const totalVehicles = sim.vehicles.length;
  const totalIncidents = sim.incidents.length;
  const assignedIncidents = sim.incidents.filter(i => i.status === 'assigned').length;
  const completedIncidents = sim.incidents.filter(i => i.status === 'completed').length;
  const unreachableIncidents = sim.incidents.filter(i => i.status === 'unreachable').length;

  let plannedCost = 0;
  let actualMoveCost = 0;
  let totalWaitingTicks = 0;
  let replanCount = 0;

  for (const v of sim.vehicles) {
    actualMoveCost += v.accumulatedMoveCost;
    totalWaitingTicks += v.totalWaitingTicks;
    replanCount += v.replanCount;
  }

  // Calculate average response time (completedTick - createdTick)
  let totalResponseTime = 0;
  let completedCount = 0;
  for (const inc of sim.incidents) {
    if (inc.status === 'completed' && inc.completedTick !== null) {
      totalResponseTime += inc.completedTick - inc.createdTick;
      completedCount++;
    }
  }
  const averageResponseTime = completedCount > 0 ? totalResponseTime / completedCount : 0;

  return {
    totalVehicles,
    totalIncidents,
    assignedIncidents,
    completedIncidents,
    unreachableIncidents,
    plannedCost,
    actualMoveCost,
    totalWaitingTicks,
    replanCount,
    totalAStarNodes: 0,
    currentTick: sim.tick,
    averageResponseTime,
    potentialConflicts: sim.potentialConflicts,
    conflictsAvoided: sim.conflictsAvoided,
    actualCollisions: sim.actualCollisions,
  };
}
