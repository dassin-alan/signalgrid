import { describe, it, expect } from 'vitest';
import { createEditHistory, pushHistory, undo, redo } from '../../src/state/history';
import { createSeededScenario } from '../../src/scenarios/challengeScenarios';

describe('Edit History', () => {
  it('should undo and restore previous state', () => {
    const state1 = createSeededScenario(42);
    let history = createEditHistory(50);
    history = pushHistory(history, state1);

    const state2 = createSeededScenario(99);
    history = pushHistory(history, state2);

    // State has been pushed
    const result = undo(history, state2);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.state.randomSeed).toBe(42);
    }
  });

  it('should redo after undo', () => {
    const state1 = createSeededScenario(42);
    let history = createEditHistory(50);
    history = pushHistory(history, state1);

    const state2 = createSeededScenario(99);
    history = pushHistory(history, state2);

    const undoResult = undo(history, state2);
    expect(undoResult).not.toBeNull();

    if (undoResult) {
      const redoResult = redo(undoResult.history, undoResult.state);
      expect(redoResult).not.toBeNull();
      if (redoResult) {
        expect(redoResult.state.randomSeed).toBe(99);
      }
    }
  });

  it('should clear redo stack on new edit', () => {
    const state1 = createSeededScenario(42);
    let history = createEditHistory(50);
    history = pushHistory(history, state1);

    const state2 = createSeededScenario(99);
    history = pushHistory(history, state2);

    const undoResult = undo(history, state2);
    expect(undoResult).not.toBeNull();

    if (undoResult) {
      // New edit after undo
      const state3 = createSeededScenario(77);
      const newHistory = pushHistory(undoResult.history, state3);
      expect(newHistory.redoStack.length).toBe(0);
    }
  });

  it('should respect max history size', () => {
    const history = createEditHistory(3);
    let h = history;
    for (let i = 0; i < 5; i++) {
      h = pushHistory(h, createSeededScenario(i));
    }
    expect(h.undoStack.length).toBeLessThanOrEqual(3);
  });
});
