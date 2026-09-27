# SignalGrid — Multi-Agent Urban Emergency Dispatch Simulator

A professional urban emergency dispatch and multi-agent simulation workbench.

## Features

- **2D City Grid Editor** — Edit a 24x16 map with roads, congested areas, hazardous zones, obstacles, stations, incidents, and vehicles
- **A\* Weighted Pathfinding** — Self-implemented A\* with terrain-dependent movement costs
- **Global Task Assignment** — Hungarian algorithm for optimal vehicle-to-incident assignment
- **Multi-Agent Discrete Tick Simulation** — Tick-by-tick simulation with conflict resolution
- **Collision Avoidance** — Vertex conflict, edge-swap, and stationary vehicle detection
- **Dynamic Replanning** — Modify the map during simulation without resetting state
- **Waiting & Replanning** — Vehicles wait when blocked, replan after consecutive waits
- **JSON Import/Export** — Full scene serialization with strict validation
- **Undo/Redo** — 50-level edit history with Ctrl+Z/Y/Shift+Z shortcuts
- **Challenge Scenarios** — 8 pre-built scenarios for algorithm verification
- **Deterministic Random Generation** — Seeded PRNG for reproducible scenarios

## Installation & Running

```bash
npm install
npm run dev       # Start dev server
npm run typecheck # TypeScript check
npm test          # Run unit tests
npm run build     # Production build
npm run test:e2e  # Playwright E2E tests
npm run verify:benchmark  # Full verification
```

## Architecture

```
src/
├── algorithms/     # A*, Assignment, Reservation Table
├── domain/         # Coordinates, Terrain, Vehicle, Incident, Scene
├── simulation/     # Simulation State, Tick Engine, Conflict Detection, Dynamic Update, Metrics
├── state/          # Reducer, History (Undo/Redo)
├── validation/     # Scene File Validator
├── scenarios/      # Challenge Scenarios
├── hooks/          # React Hooks
├── components/     # (App.tsx is the main component)
└── utils/          # PRNG
```

Core algorithms are independent of React and DOM.

## A\* Pathfinding

Implements weighted A\* with:
- Terrain-dependent movement costs (road=1, congested=3, hazardous=6, blocked=impassable)
- Manhattan distance heuristic (guarantees optimality)
- Deterministic tie-breaking (direction priority: up, right, down, left)
- Returns full path, total weighted cost, visited nodes, and computation time

## Task Assignment

Uses the Hungarian algorithm for minimum-cost assignment:
- Primary objective: maximize number of rescued incidents
- Secondary objective: minimize total path cost
- Deterministic tie-breaking: vehicle ID (natural sort), then incident ID
- Unreachable combinations excluded from matching

## Collision Avoidance

Implements reservation table with:
- Vertex conflict detection (two vehicles cannot occupy same cell)
- Edge-swap detection (vehicles cannot cross paths simultaneously)
- Stationary vehicle occupancy (moving vehicles respect stationary ones)
- Priority-based conflict resolution (natural sort of vehicle IDs)
- Chain dependency handling

## Waiting State

- `MAX_CONSECUTIVE_WAIT_TICKS = 3`
- After 3 consecutive waits, replanning is triggered
- States: Moving → Waiting → Moving | Waiting → Replanning → Moving | Replanning → Unreachable

## Dynamic Replanning

- Map changes during simulation trigger replanning for affected vehicles
- Tick not reset, positions not reset, completed tasks preserved
- Cost reduction triggers best-route reevaluation
- Replanned vehicles get new paths, pathIndex reset to 0

## JSON Validation

Implements `validateSceneFile(input: unknown): ValidationResult<SceneFile>` with comprehensive validation:
- Type checking for all fields
- Coordinate validation (integer, in-bounds)
- Terrain validation
- ID uniqueness
- Cell grid coverage
- Settings type validation

## Undo/Redo

- Clone-based history (50 levels)
- Ctrl+Z (Undo), Ctrl+Y/Ctrl+Shift+Z (Redo)
- New edit clears redo stack
- Continuous drag = one history entry

## Core Function Exports

- `findWeightedPath` — `src/algorithms/astar.ts`
- `assignIncidentsGlobally` — `src/algorithms/assignment.ts`
- `createSimulationState` — `src/simulation/simulationState.ts`
- `advanceSimulationTick` — `src/simulation/simulationState.ts`
- `detectActualConflicts` — `src/simulation/conflictDetection.ts`
- `applyMapChangeToSimulation` — `src/simulation/dynamicMapUpdate.ts`
- `validateSceneFile` — `src/validation/sceneValidator.ts`
- `selectSimulationMetrics` — `src/simulation/metrics.ts`
- `createSeededScenario` — `src/scenarios/challengeScenarios.ts`

## Testing

```bash
npm test         # Vitest unit tests
npm run test:e2e # Playwright browser tests
```

## Known Limitations

- UI is primarily in a single App.tsx component (large but functional)
- Playwright tests are basic; some challenge scenarios require manual verification
- No path visualization overlay on the grid canvas
- Map changes during simulation require manual trigger
