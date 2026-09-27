import { Cell, TerrainType, createDefaultGrid } from '../domain/terrain';
import { Vehicle, createVehicle } from '../domain/vehicle';
import { Incident, createIncident } from '../domain/incident';
import { SceneState } from '../domain/scene';
import { PRNG } from '../utils/prng';

export interface ChallengeScenario {
  name: string;
  description: string;
  create: (seed: number) => SceneState;
}

function defaultGrid(): Cell[][] {
  return createDefaultGrid(24, 16);
}

export const challengeScenarios: ChallengeScenario[] = [
  {
    name: 'Weighted Detour',
    description: 'Short path through high-cost cells, longer path has lower total cost.',
    create: (_seed: number) => {
      const grid = defaultGrid();
      // Create a corridor where the shortest path is 3 hazardous cells,
      // but there's a longer route around with road cells that costs less

      // Short path: (5,5) -> (5,6) -> (5,7) -> (5,8) -> (5,9) through hazardous
      // hazardous cells at (5,6), (5,7), (5,8) = cost 18
      grid[6][5].terrain = 'hazardous';
      grid[7][5].terrain = 'hazardous';
      grid[8][5].terrain = 'hazardous';

      // Longer route around: (5,5)->(6,5)->(6,6)->(6,7)->(6,8)->(6,9)->(5,9)
      // = 6 road cells = cost 6

      const vehicle = createVehicle('vehicle-1', { x: 5, y: 5 });
      const incident = createIncident('incident-1', { x: 5, y: 9 });

      return { grid, vehicles: [vehicle], incidents: [incident], randomSeed: _seed,
        settings: { simulationSpeed: 1, showCoordinates: true, showCostOverlay: false } };
    },
  },
  {
    name: 'Assignment Trap',
    description: 'Greedy assignment leads to suboptimal total cost. Global assignment finds better result.',
    create: (_seed: number) => {
      const grid = defaultGrid();
      // Vehicle 1 at (2,2), Vehicle 2 at (18,2)
      // Incident 1 at (10,5), Incident 2 at (10,3)
      // Greedy: V1 -> I2 (closer), V2 -> I1 (closer) -- both cross paths
      // Global: V1 -> I1, V2 -> I2 -- parallel, not crossing, both shorter

      grid[2][2].terrain = 'station';
      grid[13][2].terrain = 'station';

      const v1 = createVehicle('vehicle-1', { x: 4, y: 4 });
      const v2 = createVehicle('vehicle-2', { x: 16, y: 4 });
      const i1 = createIncident('incident-1', { x: 10, y: 10 });
      const i2 = createIncident('incident-2', { x: 10, y: 6 });

      return { grid, vehicles: [v1, v2], incidents: [i1, i2], randomSeed: _seed,
        settings: { simulationSpeed: 1, showCoordinates: true, showCostOverlay: false } };
    },
  },
  {
    name: 'Head-On Corridor',
    description: 'Two vehicles approach from opposite ends of a narrow corridor.',
    create: (_seed: number) => {
      const grid = defaultGrid();
      // Create a 1-tile-wide corridor at y=7, blocked above and below
      for (let x = 3; x <= 19; x++) {
        grid[6][x].terrain = 'blocked';
        grid[8][x].terrain = 'blocked';
      }

      const v1 = createVehicle('vehicle-1', { x: 3, y: 7 });
      const v2 = createVehicle('vehicle-2', { x: 19, y: 7 });
      const i1 = createIncident('incident-1', { x: 19, y: 7 });
      const i2 = createIncident('incident-2', { x: 3, y: 7 });

      return { grid, vehicles: [v1, v2], incidents: [i1, i2], randomSeed: _seed,
        settings: { simulationSpeed: 1, showCoordinates: true, showCostOverlay: false } };
    },
  },
  {
    name: 'Stationary Blocker',
    description: 'A stationary idle vehicle blocks another vehicle\'s planned path.',
    create: (_seed: number) => {
      const grid = defaultGrid();
      const v1 = createVehicle('vehicle-1', { x: 5, y: 5 });
      v1.status = 'idle';
      const v2 = createVehicle('vehicle-2', { x: 5, y: 3 });
      const i1 = createIncident('incident-1', { x: 5, y: 10 });

      return { grid, vehicles: [v1, v2], incidents: [i1], randomSeed: _seed,
        settings: { simulationSpeed: 1, showCoordinates: true, showCostOverlay: false } };
    },
  },
  {
    name: 'Dynamic Block',
    description: 'Add obstacle to vehicle\'s remaining path during simulation.',
    create: (_seed: number) => {
      const grid = defaultGrid();
      const v1 = createVehicle('vehicle-1', { x: 3, y: 3 });
      const v2 = createVehicle('vehicle-2', { x: 20, y: 10 });
      const i1 = createIncident('incident-1', { x: 15, y: 3 });

      return { grid, vehicles: [v1, v2], incidents: [i1], randomSeed: _seed,
        settings: { simulationSpeed: 1, showCoordinates: true, showCostOverlay: false } };
    },
  },
  {
    name: 'Dynamic Cost Improvement',
    description: 'Improve road costs so a cheaper alternative route appears.',
    create: (_seed: number) => {
      const grid = defaultGrid();
      // Block direct path, make vehicle go through congested area
      for (let x = 7; x <= 13; x++) {
        grid[3][x].terrain = 'blocked';
      }
      // Alternative route at y=2 is congested (cost 3)
      for (let x = 4; x <= 16; x++) {
        grid[2][x].terrain = 'congested';
      }

      const v1 = createVehicle('vehicle-1', { x: 5, y: 5 });
      const i1 = createIncident('incident-1', { x: 15, y: 5 });

      return { grid, vehicles: [v1], incidents: [i1], randomSeed: _seed,
        settings: { simulationSpeed: 1, showCoordinates: true, showCostOverlay: false } };
    },
  },
  {
    name: 'Multi-Wave Dispatch',
    description: '3 vehicles handle 5+ incidents in multiple waves.',
    create: (_seed: number) => {
      const grid = defaultGrid();
      const v1 = createVehicle('vehicle-1', { x: 2, y: 2 });
      const v2 = createVehicle('vehicle-2', { x: 12, y: 7 });
      const v3 = createVehicle('vehicle-3', { x: 21, y: 2 });

      const i1 = createIncident('incident-1', { x: 5, y: 5 });
      const i2 = createIncident('incident-2', { x: 10, y: 3 });
      const i3 = createIncident('incident-3', { x: 15, y: 10 });
      const i4 = createIncident('incident-4', { x: 8, y: 12 });
      const i5 = createIncident('incident-5', { x: 20, y: 13 });

      return { grid, vehicles: [v1, v2, v3], incidents: [i1, i2, i3, i4, i5], randomSeed: _seed,
        settings: { simulationSpeed: 1, showCoordinates: true, showCostOverlay: false } };
    },
  },
  {
    name: 'Unreachable Incident',
    description: 'An incident surrounded by obstacles that no vehicle can reach.',
    create: (_seed: number) => {
      const grid = defaultGrid();
      // Surround incident at (10,7) with blocked cells
      grid[6][9].terrain = 'blocked';
      grid[6][10].terrain = 'blocked';
      grid[6][11].terrain = 'blocked';
      grid[7][9].terrain = 'blocked';
      grid[7][11].terrain = 'blocked';
      grid[8][9].terrain = 'blocked';
      grid[8][10].terrain = 'blocked';
      grid[8][11].terrain = 'blocked';

      const v1 = createVehicle('vehicle-1', { x: 2, y: 2 });
      const v2 = createVehicle('vehicle-2', { x: 21, y: 13 });
      i1 = createIncident('incident-1', { x: 5, y: 5 });
      const i2 = createIncident('incident-2', { x: 10, y: 7 }); // unreachable

      return { grid, vehicles: [v1, v2], incidents: [i1, i2], randomSeed: _seed,
        settings: { simulationSpeed: 1, showCoordinates: true, showCostOverlay: false } };
    },
  },
];

let i1: Incident;

export function createSeededScenario(seed: number, numVehicles: number = 3, numIncidents: number = 5): SceneState {
  const grid = createDefaultGrid(24, 16);
  const prng = new PRNG(seed);

  // Add some random terrain
  const allCoords: { x: number; y: number }[] = [];
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 24; x++) {
      allCoords.push({ x, y });
    }
  }

  const shuffled = prng.shuffle(allCoords);

  // Place some blocked cells (~8%)
  for (let i = 0; i < Math.floor(shuffled.length * 0.08); i++) {
    const { x, y } = shuffled[i];
    grid[y][x].terrain = 'blocked';
  }

  // Place congested (~10%)
  for (let i = Math.floor(shuffled.length * 0.08); i < Math.floor(shuffled.length * 0.18); i++) {
    const { x, y } = shuffled[i];
    if (grid[y][x].terrain === 'road') {
      grid[y][x].terrain = 'congested';
    }
  }

  // Place hazardous (~5%)
  for (let i = Math.floor(shuffled.length * 0.18); i < Math.floor(shuffled.length * 0.23); i++) {
    const { x, y } = shuffled[i];
    if (grid[y][x].terrain === 'road') {
      grid[y][x].terrain = 'hazardous';
    }
  }

  // Place stations
  grid[2][2].terrain = 'station';
  grid[2][21].terrain = 'station';
  grid[13][2].terrain = 'station';
  grid[13][21].terrain = 'station';

  // Get walkable cells
  const walkableCells: { x: number; y: number }[] = [];
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 24; x++) {
      if (grid[y][x].terrain !== 'blocked') {
        walkableCells.push({ x, y });
      }
    }
  }

  const walkableShuffled = prng.shuffle(walkableCells);

  // Place vehicles
  const vehicles: Vehicle[] = [];
  for (let i = 0; i < numVehicles && i < walkableShuffled.length; i++) {
    const pos = walkableShuffled[i];
    const v = createVehicle(`vehicle-${i + 1}`, pos);
    vehicles.push(v);
  }

  // Place incidents
  const incidents: Incident[] = [];
  const usedPositions = new Set(vehicles.map(v => `${v.position.x},${v.position.y}`));

  let incIdx = 0;
  for (let i = numVehicles; i < walkableShuffled.length && incIdx < numIncidents; i++) {
    const pos = walkableShuffled[i];
    const key = `${pos.x},${pos.y}`;
    if (!usedPositions.has(key)) {
      incidents.push(createIncident(`incident-${incIdx + 1}`, pos));
      usedPositions.add(key);
      incIdx++;
    }
  }

  return {
    grid,
    vehicles,
    incidents,
    randomSeed: seed,
    settings: {
      simulationSpeed: 1,
      showCoordinates: true,
      showCostOverlay: true,
    },
  };
}
