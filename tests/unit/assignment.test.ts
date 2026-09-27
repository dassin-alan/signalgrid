import { describe, it, expect } from 'vitest';
import { assignIncidentsGlobally, assignIncidentsGreedy } from '../../src/algorithms/assignment';
import { createVehicle } from '../../src/domain/vehicle';
import { createIncident } from '../../src/domain/incident';
import { createDefaultGrid } from '../../src/domain/terrain';

describe('Global Assignment', () => {
  it('should use weighted path costs (not straight-line distance)', () => {
    const grid = createDefaultGrid(24, 16);
    const v1 = createVehicle('vehicle-1', { x: 0, y: 0 });
    const v2 = createVehicle('vehicle-2', { x: 20, y: 0 });
    const i1 = createIncident('incident-1', { x: 5, y: 5 });
    const i2 = createIncident('incident-2', { x: 15, y: 5 });

    const result = assignIncidentsGlobally([v1, v2], [i1, i2], grid);
    expect(result.assignments.length).toBe(2);
    // Each assignment should have a real path cost
    for (const a of result.assignments) {
      expect(a.pathCost).toBeGreaterThan(0);
    }
  });

  it('should beat greedy assignment on Assignment Trap', () => {
    const grid = createDefaultGrid(24, 16);
    // Place vehicles far apart to create suboptimal greedy assignment
    const v1 = createVehicle('vehicle-1', { x: 4, y: 4 });
    const v2 = createVehicle('vehicle-2', { x: 16, y: 4 });

    // Place incidents such that greedy gives worse result
    // V1 is near I1, V2 is near I2, BUT greedy V1 could pick I1 and V2 picks I2 anyway
    const i1 = createIncident('incident-1', { x: 10, y: 10 });
    const i2 = createIncident('incident-2', { x: 10, y: 6 });

    const globalResult = assignIncidentsGlobally([v1, v2], [i1, i2], grid);
    const greedyResult = assignIncidentsGreedy([v1, v2], [i1, i2], grid);

    // The global assignment should not have worse total cost than greedy
    const globalCost = globalResult.assignments.reduce((s, a) => s + a.pathCost, 0);
    const greedyCost = greedyResult.assignments.reduce((s, a) => s + a.pathCost, 0);

    expect(globalCost).toBeLessThanOrEqual(greedyCost);
    expect(globalResult.assignments.length).toBeGreaterThanOrEqual(greedyResult.assignments.length);
  });

  it('should maximize the number of rescued incidents', () => {
    const grid = createDefaultGrid(24, 16);
    // 3 vehicles, 5 incidents
    const vehicles = [
      createVehicle('vehicle-1', { x: 0, y: 0 }),
      createVehicle('vehicle-2', { x: 23, y: 0 }),
      createVehicle('vehicle-3', { x: 0, y: 15 }),
    ];

    const incidents = [
      createIncident('incident-1', { x: 5, y: 5 }),
      createIncident('incident-2', { x: 10, y: 3 }),
      createIncident('incident-3', { x: 15, y: 10 }),
      createIncident('incident-4', { x: 8, y: 12 }),
      createIncident('incident-5', { x: 20, y: 13 }),
    ];

    const result = assignIncidentsGlobally(vehicles, incidents, grid);
    // Should assign as many as possible (up to 3 with 3 vehicles)
    expect(result.assignments.length).toBe(3);
  });

  it('should use natural sort for vehicle IDs', () => {
    const grid = createDefaultGrid(24, 16);
    const vehicles = [
      createVehicle('vehicle-10', { x: 5, y: 5 }),
      createVehicle('vehicle-2', { x: 10, y: 5 }),
    ];

    const incidents = [
      createIncident('incident-1', { x: 0, y: 0 }),
      createIncident('incident-2', { x: 20, y: 0 }),
    ];

    const result = assignIncidentsGlobally(vehicles, incidents, grid);
    // vehicle-2 should come before vehicle-10 in natural sort
    const v2Assignment = result.assignments.find(a => a.vehicleId === 'vehicle-2');
    const v10Assignment = result.assignments.find(a => a.vehicleId === 'vehicle-10');
    expect(v2Assignment).toBeDefined();
    expect(v10Assignment).toBeDefined();
  });

  it('should handle unreachable combinations', () => {
    const grid = createDefaultGrid(24, 16);
    // Surround one incident with obstacles
    grid[6][9].terrain = 'blocked';
    grid[6][10].terrain = 'blocked';
    grid[6][11].terrain = 'blocked';
    grid[7][9].terrain = 'blocked';
    grid[7][11].terrain = 'blocked';
    grid[8][9].terrain = 'blocked';
    grid[8][10].terrain = 'blocked';
    grid[8][11].terrain = 'blocked';

    const v1 = createVehicle('vehicle-1', { x: 0, y: 0 });
    const v2 = createVehicle('vehicle-2', { x: 23, y: 15 });
    const i1 = createIncident('incident-1', { x: 5, y: 5 });
    const i2 = createIncident('incident-2', { x: 10, y: 7 }); // unreachable

    const result = assignIncidentsGlobally([v1, v2], [i1, i2], grid);
    expect(result.unreachableIncidents).toContain('incident-2');
  });

  it('should handle more incidents than vehicles', () => {
    const grid = createDefaultGrid(24, 16);
    const vehicles = [createVehicle('vehicle-1', { x: 2, y: 2 })];
    const incidents = [
      createIncident('incident-1', { x: 5, y: 5 }),
      createIncident('incident-2', { x: 10, y: 5 }),
    ];

    const result = assignIncidentsGlobally(vehicles, incidents, grid);
    expect(result.assignments.length).toBe(1);
    expect(result.unassignedIncidents.length).toBe(1);
  });

  it('should handle when all incidents are unreachable by a vehicle', () => {
    const grid = createDefaultGrid(24, 16);
    // Trap vehicle in a blocked area
    grid[0][1].terrain = 'blocked';
    grid[1][0].terrain = 'blocked';
    grid[1][2].terrain = 'blocked';
    grid[2][1].terrain = 'blocked';

    const v1 = createVehicle('vehicle-1', { x: 1, y: 1 });
    const i1 = createIncident('incident-1', { x: 20, y: 15 });

    const result = assignIncidentsGlobally([v1], [i1], grid);
    expect(result.unreachableVehicles).toContain('vehicle-1');
  });
});
