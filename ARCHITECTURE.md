# SignalGrid Architecture

## Overview

SignalGrid is a single-page React application built with TypeScript, Vite, and Vitest. Core algorithms are decoupled from React/DOM.

## Directory Structure

```
signalgrid/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
├── playwright.config.ts
├── src/
│   ├── main.tsx                    # Entry point
│   ├── App.tsx                     # Main UI component
│   ├── index.css                   # Global styles
│   ├── algorithms/
│   │   ├── astar.ts                # A* pathfinding
│   │   ├── assignment.ts           # Hungarian algorithm + greedy
│   │   └── reservationTable.ts     # Reservation table for collision avoidance
│   ├── domain/
│   │   ├── coordinates.ts          # Coordinate type and helpers
│   │   ├── terrain.ts              # Terrain types, costs, grid
│   │   ├── vehicle.ts              # Vehicle entity
│   │   ├── incident.ts             # Incident entity
│   │   └── scene.ts                # Scene state and file format
│   ├── simulation/
│   │   ├── simulationState.ts      # Simulation state & tick engine
│   │   ├── conflictDetection.ts    # Collision detection
│   │   ├── dynamicMapUpdate.ts     # Dynamic replanning
│   │   └── metrics.ts              # Metrics selector
│   ├── state/
│   │   └── history.ts              # Undo/Redo history
│   ├── validation/
│   │   └── sceneValidator.ts       # JSON validation
│   ├── scenarios/
│   │   └── challengeScenarios.ts   # 8 challenge scenarios
│   ├── hooks/
│   │   └── useSimulation.ts        # Main simulation hook
│   └── utils/
│       └── prng.ts                 # Mulberry32 PRNG
├── tests/
│   ├── unit/
│   │   ├── astar.test.ts
│   │   ├── assignment.test.ts
│   │   ├── conflict.test.ts
│   │   ├── history.test.ts
│   │   ├── simulation.test.ts
│   │   └── validation.test.ts
│   └── e2e/
│       └── app.test.ts
├── scripts/
│   ├── verify-benchmark.mjs
│   └── package-submission.mjs
├── EVIDENCE/
└── _delivery/
```

## Design Decisions

### Algorithm Independence
All algorithms in `src/algorithms/` and `src/simulation/` are pure functions with no React or DOM dependencies. They can be imported and tested independently.

### State Management
The application uses React `useState` and `useRef` for state management. The `useSimulation` hook encapsulates all simulation logic. Undo/Redo uses a clone-based history system.

### Styling
Uses a single `index.css` file with CSS custom properties for theming. Dark sci-fi theme with glass-morphism elements.

### Testing
- Vitest for unit tests (algorithm and domain logic)
- Playwright for E2E tests (browser interactions)
- Tests import production code directly (no mocks for core algorithms)

## Data Flow

1. User interacts with grid → `useSimulation.handleCellEdit` → updates Scene state
2. User clicks "Plan" → `planSimulation` → runs A* + Hungarian algorithm
3. User clicks "Start" / "Step" → `advanceSimulationTick` → updates vehicle positions
4. Metrics recalculated via `selectSimulationMetrics` from simulation state

## Key Technical Decisions

- **Hungarian Algorithm**: Chosen over greedy for guaranteed optimal assignment
- **A\* Tie-breaking**: Direction priority ensures deterministic behavior
- **Clone-based Undo**: Simple but memory-intensive; capped at 50 entries
- **PRNG**: Mulberry32 algorithm for deterministic seeded random generation
