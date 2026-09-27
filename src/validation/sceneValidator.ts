import { TerrainType, TERRAIN_COST } from '../domain/terrain';
import { VehicleStatus } from '../domain/vehicle';
import { IncidentStatus } from '../domain/incident';
import { coordKey } from '../domain/coordinates';

export interface ValidationError {
  path: string;
  code: string;
  message: string;
}

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; errors: ValidationError[] };

const VALID_TERRAIN: TerrainType[] = ['road', 'congested', 'hazardous', 'blocked', 'station', 'incident'];
const VALID_VEHICLE_STATUS: VehicleStatus[] = ['idle', 'planning', 'moving', 'waiting', 'replanning', 'completed', 'unreachable'];
const VALID_INCIDENT_STATUS: IncidentStatus[] = ['pending', 'assigned', 'completed', 'unreachable'];

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

export function validateSceneFile(input: unknown): ValidationResult<any> {
  const errors: ValidationError[] = [];

  if (!isObject(input)) {
    errors.push({ path: '$', code: 'type', message: 'Root must be an object.' });
    return { success: false, errors };
  }

  const root = input as Record<string, unknown>;

  // schemaVersion
  if (!('schemaVersion' in root)) {
    errors.push({ path: '$.schemaVersion', code: 'missing', message: 'schemaVersion is required.' });
  } else if (!isString(root.schemaVersion)) {
    errors.push({ path: '$.schemaVersion', code: 'type', message: 'schemaVersion must be a string.' });
  } else if (root.schemaVersion !== '1.0.0') {
    errors.push({ path: '$.schemaVersion', code: 'incompatible', message: 'schemaVersion must be "1.0.0".' });
  }

  // map
  if (!('map' in root)) {
    errors.push({ path: '$.map', code: 'missing', message: 'map is required.' });
    return { success: false, errors };
  }

  if (!isObject(root.map)) {
    errors.push({ path: '$.map', code: 'type', message: 'map must be an object.' });
    return { success: false, errors };
  }

  const map = root.map as Record<string, unknown>;

  // width
  if (!('width' in map)) {
    errors.push({ path: '$.map.width', code: 'missing', message: 'map.width is required.' });
  } else if (!isInteger(map.width) || (map.width as number) <= 0) {
    errors.push({ path: '$.map.width', code: 'type', message: 'map.width must be a positive integer.' });
  }

  // height
  if (!('height' in map)) {
    errors.push({ path: '$.map.height', code: 'missing', message: 'map.height is required.' });
  } else if (!isInteger(map.height) || (map.height as number) <= 0) {
    errors.push({ path: '$.map.height', code: 'type', message: 'map.height must be a positive integer.' });
  }

  // cells
  if (!('cells' in map)) {
    errors.push({ path: '$.map.cells', code: 'missing', message: 'map.cells is required.' });
    return { success: false, errors };
  }

  if (!isArray(map.cells)) {
    errors.push({ path: '$.map.cells', code: 'type', message: 'map.cells must be an array.' });
    return { success: false, errors };
  }

  const width = isInteger(map.width) ? (map.width as number) : 0;
  const height = isInteger(map.height) ? (map.height as number) : 0;
  const cells = map.cells as unknown[];
  const expectedCount = width * height;

  if (cells.length !== expectedCount) {
    errors.push({ path: '$.map.cells', code: 'count', message: `Expected ${expectedCount} cells, got ${cells.length}.` });
  }

  // Validate each cell
  const cellCoords = new Set<string>();

  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    if (!isObject(cell)) {
      errors.push({ path: `$.map.cells[${i}]`, code: 'type', message: 'Cell must be an object.' });
      continue;
    }

    const c = cell as Record<string, unknown>;

    if (!('x' in c) || !isInteger(c.x)) {
      errors.push({ path: `$.map.cells[${i}].x`, code: 'type', message: 'Cell x must be an integer.' });
    }
    if (!('y' in c) || !isInteger(c.y)) {
      errors.push({ path: `$.map.cells[${i}].y`, code: 'type', message: 'Cell y must be an integer.' });
    }

    const cx = isInteger(c.x) ? (c.x as number) : -1;
    const cy = isInteger(c.y) ? (c.y as number) : -1;

    if (cx >= 0 && cy >= 0 && width > 0 && height > 0) {
      if (cx >= width || cy >= height) {
        errors.push({ path: `$.map.cells[${i}]`, code: 'out_of_bounds', message: `Cell (${cx},${cy}) is outside map bounds (${width}x${height}).` });
      }

      const cKey = coordKey({ x: cx, y: cy });
      if (cellCoords.has(cKey)) {
        errors.push({ path: `$.map.cells[${i}]`, code: 'duplicate_coord', message: `Duplicate cell coordinate (${cx},${cy}).` });
      }
      cellCoords.add(cKey);
    }

    if (!('terrain' in c)) {
      errors.push({ path: `$.map.cells[${i}].terrain`, code: 'missing', message: 'terrain is required.' });
    } else if (!isString(c.terrain) || !VALID_TERRAIN.includes(c.terrain as TerrainType)) {
      errors.push({ path: `$.map.cells[${i}].terrain`, code: 'invalid', message: `Invalid terrain: "${c.terrain}".` });
    }
  }

  // Verify full grid coverage
  if (width > 0 && height > 0 && cellCoords.size > 0) {
    const missingCoords: string[] = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!cellCoords.has(coordKey({ x, y }))) {
          missingCoords.push(`(${x},${y})`);
        }
      }
    }
    if (missingCoords.length > 0) {
      errors.push({ path: '$.map.cells', code: 'incomplete', message: `Missing cells: ${missingCoords.slice(0, 5).join(', ')}${missingCoords.length > 5 ? '...' : ''}` });
    }
  }

  // Validate vehicles
  if (!('vehicles' in root)) {
    errors.push({ path: '$.vehicles', code: 'missing', message: 'vehicles is required.' });
  } else if (!isArray(root.vehicles)) {
    errors.push({ path: '$.vehicles', code: 'type', message: 'vehicles must be an array.' });
  } else {
    const vehicles = root.vehicles as unknown[];
    const vehicleIds = new Set<string>();

    for (let i = 0; i < vehicles.length; i++) {
      const v = vehicles[i];
      if (!isObject(v)) {
        errors.push({ path: `$.vehicles[${i}]`, code: 'type', message: 'Vehicle must be an object.' });
        continue;
      }

      const veh = v as Record<string, unknown>;

      if (!('id' in veh)) {
        errors.push({ path: `$.vehicles[${i}].id`, code: 'missing', message: 'Vehicle id is required.' });
      } else if (!isString(veh.id)) {
        errors.push({ path: `$.vehicles[${i}].id`, code: 'type', message: 'Vehicle id must be a string.' });
      } else {
        if (vehicleIds.has(veh.id as string)) {
          errors.push({ path: `$.vehicles[${i}].id`, code: 'duplicate', message: `Duplicate vehicle id: "${veh.id}".` });
        }
        vehicleIds.add(veh.id as string);
      }

      if (!('position' in veh) || !isObject(veh.position)) {
        errors.push({ path: `$.vehicles[${i}].position`, code: 'missing', message: 'Vehicle position is required.' });
      } else {
        const pos = veh.position as Record<string, unknown>;
        if (!isInteger(pos.x) || !isInteger(pos.y)) {
          errors.push({ path: `$.vehicles[${i}].position`, code: 'type', message: 'Position coordinates must be integers.' });
        } else {
          const px = pos.x as number;
          const py = pos.y as number;
          if (width > 0 && height > 0 && (px < 0 || px >= width || py < 0 || py >= height)) {
            errors.push({ path: `$.vehicles[${i}].position`, code: 'out_of_bounds', message: `Position (${px},${py}) is outside map.` });
          }

          // Check not on blocked
          const cellAt = cells.find((c: unknown) => {
            if (!isObject(c)) return false;
            const cell = c as Record<string, unknown>;
            return cell.x === px && cell.y === py;
          }) as Record<string, unknown> | undefined;
          if (cellAt && cellAt.terrain === 'blocked') {
            errors.push({ path: `$.vehicles[${i}].position`, code: 'blocked', message: `Vehicle at (${px},${py}) is on blocked terrain.` });
          }
        }
      }

      if (!('startPosition' in veh) || !isObject(veh.startPosition)) {
        // optional, using position as default
      }

      if (!('status' in veh)) {
        errors.push({ path: `$.vehicles[${i}].status`, code: 'missing', message: 'Vehicle status is required.' });
      } else if (!isString(veh.status) || !VALID_VEHICLE_STATUS.includes(veh.status as VehicleStatus)) {
        errors.push({ path: `$.vehicles[${i}].status`, code: 'invalid', message: `Invalid vehicle status: "${veh.status}".` });
      }

      // Validate numeric fields
      if ('pathIndex' in veh && !isInteger(veh.pathIndex)) {
        errors.push({ path: `$.vehicles[${i}].pathIndex`, code: 'type', message: 'pathIndex must be an integer.' });
      }
      if ('totalWaitingTicks' in veh && (!isInteger(veh.totalWaitingTicks) || (veh.totalWaitingTicks as number) < 0)) {
        errors.push({ path: `$.vehicles[${i}].totalWaitingTicks`, code: 'type', message: 'totalWaitingTicks must be a non-negative integer.' });
      }
      if ('completedTasks' in veh && (!isInteger(veh.completedTasks) || (veh.completedTasks as number) < 0)) {
        errors.push({ path: `$.vehicles[${i}].completedTasks`, code: 'type', message: 'completedTasks must be a non-negative integer.' });
      }
      if ('replanCount' in veh && (!isInteger(veh.replanCount) || (veh.replanCount as number) < 0)) {
        errors.push({ path: `$.vehicles[${i}].replanCount`, code: 'type', message: 'replanCount must be a non-negative integer.' });
      }
    }

    // Validate incidents
    if (!('incidents' in root)) {
      errors.push({ path: '$.incidents', code: 'missing', message: 'incidents is required.' });
    } else if (!isArray(root.incidents)) {
      errors.push({ path: '$.incidents', code: 'type', message: 'incidents must be an array.' });
    } else {
      const incidents = root.incidents as unknown[];
      const incidentIds = new Set<string>();

      for (let i = 0; i < incidents.length; i++) {
        const inc = incidents[i];
        if (!isObject(inc)) {
          errors.push({ path: `$.incidents[${i}]`, code: 'type', message: 'Incident must be an object.' });
          continue;
        }

        const incident = inc as Record<string, unknown>;

        if (!('id' in incident)) {
          errors.push({ path: `$.incidents[${i}].id`, code: 'missing', message: 'Incident id is required.' });
        } else if (!isString(incident.id)) {
          errors.push({ path: `$.incidents[${i}].id`, code: 'type', message: 'Incident id must be a string.' });
        } else {
          if (incidentIds.has(incident.id as string)) {
            errors.push({ path: `$.incidents[${i}].id`, code: 'duplicate', message: `Duplicate incident id: "${incident.id}".` });
          }
          incidentIds.add(incident.id as string);
        }

        if (!('position' in incident) || !isObject(incident.position)) {
          errors.push({ path: `$.incidents[${i}].position`, code: 'missing', message: 'Incident position is required.' });
        } else {
          const pos = incident.position as Record<string, unknown>;
          if (!isInteger(pos.x) || !isInteger(pos.y)) {
            errors.push({ path: `$.incidents[${i}].position`, code: 'type', message: 'Position coordinates must be integers.' });
          } else {
            const px = pos.x as number;
            const py = pos.y as number;
            if (width > 0 && height > 0 && (px < 0 || px >= width || py < 0 || py >= height)) {
              errors.push({ path: `$.incidents[${i}].position`, code: 'out_of_bounds', message: `Position (${px},${py}) is outside map.` });
            }

            const cellAt = cells.find((c: unknown) => {
              if (!isObject(c)) return false;
              const cell = c as Record<string, unknown>;
              return cell.x === px && cell.y === py;
            }) as Record<string, unknown> | undefined;
            if (cellAt && cellAt.terrain === 'blocked') {
              errors.push({ path: `$.incidents[${i}].position`, code: 'blocked', message: `Incident at (${px},${py}) is on blocked terrain.` });
            }
          }
        }

        if (!('status' in incident)) {
          errors.push({ path: `$.incidents[${i}].status`, code: 'missing', message: 'Incident status is required.' });
        } else if (!isString(incident.status) || !VALID_INCIDENT_STATUS.includes(incident.status as IncidentStatus)) {
          errors.push({ path: `$.incidents[${i}].status`, code: 'invalid', message: `Invalid incident status: "${incident.status}".` });
        }
      }
    }
  }

  // Validate settings
  if ('settings' in root) {
    if (!isObject(root.settings)) {
      errors.push({ path: '$.settings', code: 'type', message: 'settings must be an object.' });
    } else {
      const settings = root.settings as Record<string, unknown>;
      if ('simulationSpeed' in settings && typeof settings.simulationSpeed !== 'number') {
        errors.push({ path: '$.settings.simulationSpeed', code: 'type', message: 'simulationSpeed must be a number.' });
      }
      if ('showCoordinates' in settings && typeof settings.showCoordinates !== 'boolean') {
        errors.push({ path: '$.settings.showCoordinates', code: 'type', message: 'showCoordinates must be a boolean.' });
      }
      if ('showCostOverlay' in settings && typeof settings.showCostOverlay !== 'boolean') {
        errors.push({ path: '$.settings.showCostOverlay', code: 'type', message: 'showCostOverlay must be a boolean.' });
      }
    }
  }

  // Validate randomSeed
  if ('randomSeed' in root) {
    if (!isInteger(root.randomSeed)) {
      errors.push({ path: '$.randomSeed', code: 'type', message: 'randomSeed must be an integer.' });
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return { success: true, data: input };
}
