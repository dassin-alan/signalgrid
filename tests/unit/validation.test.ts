import { describe, it, expect } from 'vitest';
import { validateSceneFile } from '../../src/validation/sceneValidator';

const validScene = {
  schemaVersion: '1.0.0',
  map: {
    width: 3,
    height: 2,
    cells: [
      { x: 0, y: 0, terrain: 'road' },
      { x: 1, y: 0, terrain: 'road' },
      { x: 2, y: 0, terrain: 'road' },
      { x: 0, y: 1, terrain: 'road' },
      { x: 1, y: 1, terrain: 'road' },
      { x: 2, y: 1, terrain: 'road' },
    ],
  },
  vehicles: [],
  incidents: [],
  randomSeed: 42,
  settings: { simulationSpeed: 1, showCoordinates: true, showCostOverlay: false },
};

describe('Scene Validation', () => {
  it('should accept valid scene', () => {
    const result = validateSceneFile(validScene);
    expect(result.success).toBe(true);
  });

  it('should reject missing map', () => {
    const scene = { ...validScene, map: undefined };
    const result = validateSceneFile(scene);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.some(e => e.path.includes('map'))).toBe(true);
    }
  });

  it('should reject missing cells', () => {
    const scene = { ...validScene, map: { width: 3, height: 2 } };
    const result = validateSceneFile(scene);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.some(e => e.path.includes('cells'))).toBe(true);
    }
  });

  it('should reject incompatible schemaVersion', () => {
    const scene = { ...validScene, schemaVersion: '99.99.99' };
    const result = validateSceneFile(scene);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.some(e => e.path.includes('schemaVersion'))).toBe(true);
    }
  });

  it('should reject invalid vehicle status', () => {
    const scene = {
      ...validScene,
      vehicles: [{ id: 'v1', position: { x: 0, y: 0 }, status: 'flying', startPosition: { x: 0, y: 0 } }],
    };
    const result = validateSceneFile(scene);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.some(e => e.path.includes('status'))).toBe(true);
    }
  });

  it('should reject invalid incident status', () => {
    const scene = {
      ...validScene,
      incidents: [{ id: 'i1', position: { x: 0, y: 0 }, status: 'gone' }],
    };
    const result = validateSceneFile(scene);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.some(e => e.path.includes('status'))).toBe(true);
    }
  });

  it('should reject fractional coordinates', () => {
    const scene = {
      ...validScene,
      vehicles: [{ id: 'v1', position: { x: 1.5, y: 0 }, status: 'idle', startPosition: { x: 0, y: 0 } }],
    };
    const result = validateSceneFile(scene);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.some(e => e.code === 'type' && e.path.includes('position'))).toBe(true);
    }
  });

  it('should reject duplicate vehicle IDs', () => {
    const scene = {
      ...validScene,
      vehicles: [
        { id: 'v1', position: { x: 0, y: 0 }, status: 'idle', startPosition: { x: 0, y: 0 } },
        { id: 'v1', position: { x: 1, y: 0 }, status: 'idle', startPosition: { x: 1, y: 0 } },
      ],
    };
    const result = validateSceneFile(scene);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.some(e => e.code === 'duplicate' && e.path.includes('id'))).toBe(true);
    }
  });

  it('should reject duplicate cell coordinates', () => {
    const scene = {
      ...validScene,
      map: {
        width: 2,
        height: 2,
        cells: [
          { x: 0, y: 0, terrain: 'road' },
          { x: 0, y: 0, terrain: 'road' },
          { x: 1, y: 0, terrain: 'road' },
          { x: 1, y: 1, terrain: 'road' },
        ],
      },
    };
    const result = validateSceneFile(scene);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.some(e => e.code === 'duplicate_coord')).toBe(true);
    }
  });

  it('should reject missing cell coordinates (incomplete grid)', () => {
    const scene = {
      ...validScene,
      map: {
        width: 3,
        height: 2,
        cells: [
          { x: 0, y: 0, terrain: 'road' },
          { x: 1, y: 0, terrain: 'road' },
          { x: 2, y: 0, terrain: 'road' },
          { x: 0, y: 1, terrain: 'road' },
          // Missing (1,1) and (2,1)
        ],
      },
    };
    const result = validateSceneFile(scene);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.some(e => e.code === 'count')).toBe(true);
    }
  });

  it('should reject out-of-bounds incident coordinates', () => {
    const scene = {
      ...validScene,
      incidents: [{ id: 'i1', position: { x: 99, y: 99 }, status: 'pending' }],
    };
    const result = validateSceneFile(scene);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.some(e => e.code === 'out_of_bounds')).toBe(true);
    }
  });

  it('should reject non-integer randomSeed', () => {
    const scene = { ...validScene, randomSeed: 42.5 };
    const result = validateSceneFile(scene);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.some(e => e.path.includes('randomSeed'))).toBe(true);
    }
  });

  it('should reject invalid settings types', () => {
    const scene = { ...validScene, settings: { simulationSpeed: 'fast', showCoordinates: 'yes', showCostOverlay: 1 } };
    const result = validateSceneFile(scene);
    expect(result.success).toBe(false);
  });

  it('should return error objects with path, code, and message', () => {
    const result = validateSceneFile(null);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.length).toBeGreaterThan(0);
      for (const e of result.errors) {
        expect(e.path).toBeDefined();
        expect(e.code).toBeDefined();
        expect(e.message).toBeDefined();
      }
    }
  });

  it('should not throw on null input', () => {
    expect(() => validateSceneFile(null)).not.toThrow();
  });

  it('should not throw on undefined input', () => {
    expect(() => validateSceneFile(undefined)).not.toThrow();
  });

  it('should not throw on string input', () => {
    expect(() => validateSceneFile('bad')).not.toThrow();
  });
});
