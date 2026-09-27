import { Cell, createDefaultGrid, cloneGrid } from './terrain';
import { Vehicle, cloneVehicle } from './vehicle';
import { Incident, cloneIncident } from './incident';

export interface SceneSettings {
  simulationSpeed: number;
  showCoordinates: boolean;
  showCostOverlay: boolean;
}

export interface SceneFile {
  schemaVersion: string;
  map: {
    width: number;
    height: number;
    cells: Cell[];
  };
  vehicles: Vehicle[];
  incidents: Incident[];
  randomSeed: number;
  settings: SceneSettings;
}

export const DEFAULT_WIDTH = 24;
export const DEFAULT_HEIGHT = 16;
export const SCHEMA_VERSION = '1.0.0';

export interface SceneState {
  grid: Cell[][];
  vehicles: Vehicle[];
  incidents: Incident[];
  randomSeed: number;
  settings: SceneSettings;
}

export function createDefaultScene(): SceneState {
  const grid = createDefaultGrid(DEFAULT_WIDTH, DEFAULT_HEIGHT);
  // Add some stations
  grid[2][2].terrain = 'station';
  grid[2][21].terrain = 'station';
  grid[13][2].terrain = 'station';
  grid[13][21].terrain = 'station';

  const vehicles: Vehicle[] = [];
  const incidents: Incident[] = [];

  return {
    grid,
    vehicles,
    incidents,
    randomSeed: 42,
    settings: {
      simulationSpeed: 1,
      showCoordinates: true,
      showCostOverlay: true,
    },
  };
}

export function cloneScene(scene: SceneState): SceneState {
  return {
    grid: cloneGrid(scene.grid),
    vehicles: scene.vehicles.map(cloneVehicle),
    incidents: scene.incidents.map(cloneIncident),
    randomSeed: scene.randomSeed,
    settings: { ...scene.settings },
  };
}

export function sceneToFile(scene: SceneState): SceneFile {
  return {
    schemaVersion: SCHEMA_VERSION,
    map: {
      width: scene.grid[0]?.length ?? DEFAULT_WIDTH,
      height: scene.grid.length,
      cells: scene.grid.flat().map(c => ({ ...c })),
    },
    vehicles: scene.vehicles.map(cloneVehicle),
    incidents: scene.incidents.map(cloneIncident),
    randomSeed: scene.randomSeed,
    settings: { ...scene.settings },
  };
}
