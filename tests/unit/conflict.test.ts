import { describe, it, expect } from 'vitest';
import { detectActualConflicts } from '../../src/simulation/conflictDetection';
import { createVehicle } from '../../src/domain/vehicle';
import { Vehicle } from '../../src/domain/vehicle';

describe('Conflict Detection', () => {
  it('should detect vertex conflicts (two vehicles in same cell)', () => {
    const prev: Vehicle[] = [
      { ...createVehicle('v1', { x: 0, y: 0 }), position: { x: 0, y: 0 } },
      { ...createVehicle('v2', { x: 2, y: 0 }), position: { x: 2, y: 0 } },
    ];
    const next: Vehicle[] = [
      { ...createVehicle('v1', { x: 0, y: 0 }), position: { x: 1, y: 0 } },
      { ...createVehicle('v2', { x: 2, y: 0 }), position: { x: 1, y: 0 } },
    ];

    const conflicts = detectActualConflicts(prev, next);
    expect(conflicts.some(c => c.type === 'vertex')).toBe(true);
  });

  it('should detect edge swap conflicts', () => {
    const prev: Vehicle[] = [
      { ...createVehicle('v1', { x: 0, y: 0 }), position: { x: 0, y: 0 } },
      { ...createVehicle('v2', { x: 0, y: 0 }), position: { x: 1, y: 0 } },
    ];
    const next: Vehicle[] = [
      { ...createVehicle('v1', { x: 0, y: 0 }), position: { x: 1, y: 0 } },
      { ...createVehicle('v2', { x: 0, y: 0 }), position: { x: 0, y: 0 } },
    ];

    const conflicts = detectActualConflicts(prev, next);
    expect(conflicts.some(c => c.type === 'edge_swap')).toBe(true);
  });

  it('should not detect conflicts when vehicles move safely', () => {
    const prev: Vehicle[] = [
      { ...createVehicle('v1', { x: 0, y: 0 }), position: { x: 0, y: 0 } },
      { ...createVehicle('v2', { x: 0, y: 0 }), position: { x: 3, y: 0 } },
    ];
    const next: Vehicle[] = [
      { ...createVehicle('v1', { x: 0, y: 0 }), position: { x: 1, y: 0 } },
      { ...createVehicle('v2', { x: 0, y: 0 }), position: { x: 4, y: 0 } },
    ];

    const conflicts = detectActualConflicts(prev, next);
    expect(conflicts.length).toBe(0);
  });

  it('should detect stationary vehicle occupation', () => {
    // Stationary vehicle is one that didn't move
    const prev: Vehicle[] = [
      { ...createVehicle('v1', { x: 0, y: 0 }), position: { x: 1, y: 1 }, status: 'idle' },
      { ...createVehicle('v2', { x: 0, y: 0 }), position: { x: 2, y: 1 } },
    ];
    const next: Vehicle[] = [
      { ...createVehicle('v1', { x: 0, y: 0 }), position: { x: 1, y: 1 }, status: 'idle' },
      { ...createVehicle('v2', { x: 0, y: 0 }), position: { x: 1, y: 1 } },
    ];

    const conflicts = detectActualConflicts(prev, next);
    expect(conflicts.some(c => c.type === 'vertex')).toBe(true);
  });
});
