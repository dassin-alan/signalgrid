import { SceneState, cloneScene } from '../domain/scene';

export interface EditHistory {
  undoStack: SceneState[];
  redoStack: SceneState[];
  maxSize: number;
}

export function createEditHistory(maxSize: number = 50): EditHistory {
  return {
    undoStack: [],
    redoStack: [],
    maxSize,
  };
}

export function pushHistory(history: EditHistory, state: SceneState): EditHistory {
  const newUndo = [...history.undoStack, cloneScene(state)];
  if (newUndo.length > history.maxSize) {
    newUndo.shift();
  }
  return {
    undoStack: newUndo,
    redoStack: [],
    maxSize: history.maxSize,
  };
}

export function undo(history: EditHistory, currentState: SceneState): { state: SceneState; history: EditHistory } | null {
  if (history.undoStack.length < 2) return null;

  const newUndo = history.undoStack.slice(0, -1);
  const targetState = newUndo[newUndo.length - 1];
  const newRedo = [...history.redoStack, cloneScene(currentState)];

  return {
    state: cloneScene(targetState),
    history: {
      undoStack: newUndo,
      redoStack: newRedo,
      maxSize: history.maxSize,
    },
  };
}

export function redo(history: EditHistory, currentState: SceneState): { state: SceneState; history: EditHistory } | null {
  if (history.redoStack.length === 0) return null;

  const nextState = history.redoStack[history.redoStack.length - 1];
  const newRedo = history.redoStack.slice(0, -1);
  const newUndo = [...history.undoStack, cloneScene(currentState)];

  return {
    state: cloneScene(nextState),
    history: {
      undoStack: newUndo,
      redoStack: newRedo,
      maxSize: history.maxSize,
    },
  };
}
