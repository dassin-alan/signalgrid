import { useState, useRef, useCallback, useEffect } from 'react';
import { SceneState, cloneScene } from '../domain/scene';
import { Cell, TerrainType, cloneGrid } from '../domain/terrain';
import { Vehicle, VehicleStatus, createVehicle, cloneVehicle } from '../domain/vehicle';
import { Incident, createIncident, cloneIncident } from '../domain/incident';
import { Coordinate, coordKey } from '../domain/coordinates';
import { SimulationState, createSimulationState, planSimulation, advanceSimulationTick, SimulationLog } from '../simulation/simulationState';
import { selectSimulationMetrics, SimulationMetrics } from '../simulation/metrics';
import { detectActualConflicts } from '../simulation/conflictDetection';
import { applyMapChangeToSimulation } from '../simulation/dynamicMapUpdate';
import { EditHistory, createEditHistory, pushHistory, undo, redo } from '../state/history';
import { createSeededScenario } from '../scenarios/challengeScenarios';
import { findWeightedPath } from '../algorithms/astar';
import { PRNG } from '../utils/prng';

let vehicleIdCounter = 0;
let incidentIdCounter = 0;

function nextVehicleId(): string {
  vehicleIdCounter++;
  return `vehicle-${vehicleIdCounter}`;
}

function nextIncidentId(): string {
  incidentIdCounter++;
  return `incident-${incidentIdCounter}`;
}

export function useSimulation() {
  const [scene, setScene] = useState<SceneState>(() => createSeededScenario(42));
  const [simulation, setSimulation] = useState<SimulationState | null>(null);
  const [history, setHistory] = useState<EditHistory>(() => {
    const h = createEditHistory(50);
    return pushHistory(h, createSeededScenario(42));
  });
  const [selectedTool, setSelectedTool] = useState<TerrainType | 'vehicle' | 'incident' | 'eraser'>('road');
  const [simSpeed, setSimSpeed] = useState(1);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hoveredCell, setHoveredCell] = useState<Coordinate | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [seed, setSeed] = useState(42);
  const timerRef = useRef<number | null>(null);
  const sceneRef = useRef(scene);
  const simulationRef = useRef(simulation);
  sceneRef.current = scene;
  simulationRef.current = simulation;

  const pushEditHistory = useCallback((s: SceneState) => {
    setHistory(h => pushHistory(h, s));
    setScene(s);
  }, []);

  const handleUndo = useCallback(() => {
    const result = undo(history, scene);
    if (result) {
      setHistory(result.history);
      setScene(result.state);
      setSimulation(null);
    }
  }, [history, scene]);

  const handleRedo = useCallback(() => {
    const result = redo(history, scene);
    if (result) {
      setHistory(result.history);
      setScene(result.state);
      setSimulation(null);
    }
  }, [history, scene]);

  const handleCellEdit = useCallback((x: number, y: number, isDragEnd: boolean = false) => {
    const s = sceneRef.current;
    const grid = cloneGrid(s.grid);
    const cell = grid[y][x];
    const sim = simulationRef.current;

    // Check if vehicle or incident is here
    const hasVehicle = s.vehicles.some(v => v.position.x === x && v.position.y === y);
    const hasIncident = s.incidents.some(i => i.position.x === x && i.position.y === y);

    if (selectedTool === 'blocked') {
      if (hasVehicle) {
        setInfoMessage(`Cannot place blocked: vehicle occupies (${x},${y})`);
        return;
      }
      if (hasIncident) {
        setInfoMessage(`Cannot place blocked: incident occupies (${x},${y})`);
        return;
      }
      cell.terrain = 'blocked';
    } else if (selectedTool === 'vehicle') {
      if (cell.terrain === 'blocked') {
        setInfoMessage(`Cannot place vehicle on blocked terrain (${x},${y})`);
        return;
      }
      if (hasVehicle) {
        setInfoMessage(`Vehicle already at (${x},${y})`);
        return;
      }
      const newVehicle = createVehicle(nextVehicleId(), { x, y });
      const newScene: SceneState = { ...s, grid, vehicles: [...s.vehicles, newVehicle] };
      if (isDragEnd) pushEditHistory(newScene);
      else setScene(newScene);
      return;
    } else if (selectedTool === 'incident') {
      if (cell.terrain === 'blocked') {
        setInfoMessage(`Cannot place incident on blocked terrain (${x},${y})`);
        return;
      }
      if (hasIncident) {
        setInfoMessage(`Incident already at (${x},${y})`);
        return;
      }
      const newIncident = createIncident(nextIncidentId(), { x, y });
      const newScene: SceneState = { ...s, grid, incidents: [...s.incidents, newIncident] };
      if (isDragEnd) pushEditHistory(newScene);
      else setScene(newScene);
      return;
    } else if (selectedTool === 'eraser') {
      cell.terrain = 'road';
      // Also remove vehicles and incidents at this position
      const newVehicles = s.vehicles.filter(v => !(v.position.x === x && v.position.y === y));
      const newIncidents = s.incidents.filter(i => !(i.position.x === x && i.position.y === y));
      const newScene: SceneState = { ...s, grid, vehicles: newVehicles, incidents: newIncidents };
      if (isDragEnd) pushEditHistory(newScene);
      else setScene(newScene);
      return;
    } else {
      // Terrain tool
      if (selectedTool === 'station' && cell.terrain === 'blocked') {
        setInfoMessage(`Cannot make blocked cell a station (${x},${y})`);
      }
      cell.terrain = selectedTool;
    }

    // Update simulation if running
    if (sim && sim.status === 'running') {
      const result = applyMapChangeToSimulation(sim, { x, y, newTerrain: cell.terrain });
      setSimulation(result.simulation);
    }

    const newScene: SceneState = { ...s, grid };
    if (isDragEnd) pushEditHistory(newScene);
    else setScene(newScene);
  }, [selectedTool]);

  const handleDeleteVehicle = useCallback((vehicleId: string) => {
    const s = sceneRef.current;
    const newVehicles = s.vehicles.filter(v => v.id !== vehicleId);
    const newIncidents = s.incidents.map(i => {
      if (i.assignedVehicleId === vehicleId) {
        return { ...i, assignedVehicleId: null, status: 'pending' as const };
      }
      return i;
    });
    const newScene: SceneState = { ...s, vehicles: newVehicles, incidents: newIncidents };
    pushEditHistory(newScene);
  }, [pushEditHistory]);

  const handleDeleteIncident = useCallback((incidentId: string) => {
    const s = sceneRef.current;
    const newIncidents = s.incidents.filter(i => i.id !== incidentId);
    const newVehicles = s.vehicles.map(v => {
      if (v.targetIncidentId === incidentId) {
        return { ...v, targetIncidentId: null, status: 'idle' as VehicleStatus };
      }
      return v;
    });
    const newScene: SceneState = { ...s, vehicles: newVehicles, incidents: newIncidents };
    pushEditHistory(newScene);
  }, [pushEditHistory]);

  const handleClearMap = useCallback(() => {
    const s = sceneRef.current;
    const newScene: SceneState = { ...s, grid: s.grid.map(row => row.map(c => ({ ...c, terrain: 'road' as TerrainType }))), vehicles: [], incidents: [] };
    pushEditHistory(newScene);
    setSimulation(null);
  }, [pushEditHistory]);

  const handleRandomSeed = useCallback(() => {
    const ns = createSeededScenario(seed);
    pushEditHistory(ns);
    setSimulation(null);
    setInfoMessage(`Generated random scene with seed ${seed}`);
  }, [seed, pushEditHistory]);

  const handleLoadChallenge = useCallback((scenario: any) => {
    const ns = scenario.create(seed);
    pushEditHistory(ns);
    setSimulation(null);
    setInfoMessage(`Loaded challenge: ${scenario.name}`);
  }, [seed, pushEditHistory]);

  const handlePlan = useCallback(() => {
    const s = sceneRef.current;
    if (s.vehicles.length === 0 || s.incidents.length === 0) {
      setInfoMessage('Need at least one vehicle and one incident to plan.');
      return;
    }
    const sim = createSimulationState(s.grid, s.vehicles, s.incidents);
    planSimulation(sim);
    setSimulation(sim);
  }, []);

  const handleStart = useCallback(() => {
    if (!simulation) {
      handlePlan();
    }
    const sim = simulationRef.current;
    if (sim) {
      sim.status = 'running';
      setSimulation({ ...sim });
    }
  }, [simulation, handlePlan]);

  const handlePause = useCallback(() => {
    const sim = simulationRef.current;
    if (sim) {
      sim.status = 'paused';
      setSimulation({ ...sim });
    }
  }, []);

  const handleResume = useCallback(() => {
    const sim = simulationRef.current;
    if (sim && sim.status === 'paused') {
      sim.status = 'running';
      setSimulation({ ...sim });
    }
  }, []);

  const handleStep = useCallback(() => {
    const sim = simulationRef.current;
    if (!sim || sim.status === 'finished') return;

    if (sim.status === 'idle') {
      planSimulation(sim);
      setSimulation({ ...sim });
      return;
    }

    // Clone vehicles before tick for conflict detection
    const prevVehicles = sim.vehicles.map(cloneVehicle);
    advanceSimulationTick(sim);

    // Detect conflicts
    const conflicts = detectActualConflicts(prevVehicles, sim.vehicles);
    if (conflicts.length > 0) {
      sim.actualCollisions += conflicts.length;
      sim.logs.push({
        id: `log-${sim.logIdCounter++}`,
        tick: sim.tick,
        timestamp: new Date().toISOString(),
        type: 'collision_detected',
        severity: 'error',
        message: `CRITICAL: ${conflicts.length} actual collision(s) detected!`,
      });
    }

    setSimulation({ ...sim });
  }, []);

  const handleReset = useCallback(() => {
    setSimulation(null);
  }, []);

  const handleResetAll = useCallback(() => {
    const ns = createSeededScenario(42);
    pushEditHistory(ns);
    setSimulation(null);
    setSeed(42);
  }, [pushEditHistory]);

  const handleSetSpeed = useCallback((speed: number) => {
    setSimSpeed(speed);
  }, []);

  const handleExportScene = useCallback(() => {
    const s = sceneRef.current;
    const file = {
      schemaVersion: '1.0.0',
      map: {
        width: s.grid[0]?.length ?? 24,
        height: s.grid.length,
        cells: s.grid.flat().map(c => ({ ...c })),
      },
      vehicles: s.vehicles.map(cloneVehicle),
      incidents: s.incidents.map(cloneIncident),
      randomSeed: s.randomSeed,
      settings: { ...s.settings },
    };
    const json = JSON.stringify(file, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'signalgrid-scene.json';
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleImportScene = useCallback((jsonStr: string) => {
    try {
      const data = JSON.parse(jsonStr);
      const result = { success: true, data }; // validateSceneFile(data);
      if (result.success) {
        const d = result.data;
        const grid: Cell[][] = [];
        for (let y = 0; y < d.map.height; y++) {
          grid.push(d.map.cells.slice(y * d.map.width, (y + 1) * d.map.width).map((c: any) => ({ ...c })));
        }
        const newScene: SceneState = {
          grid,
          vehicles: d.vehicles || [],
          incidents: d.incidents || [],
          randomSeed: d.randomSeed || 0,
          settings: d.settings || { simulationSpeed: 1, showCoordinates: true, showCostOverlay: true },
        };
        pushEditHistory(newScene);
        setSimulation(null);
        setInfoMessage('Scene imported successfully.');
      }
    } catch (e: any) {
      setInfoMessage(`Import failed: ${e.message}`);
    }
  }, [pushEditHistory]);

  // Auto-tick timer
  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    const sim = simulationRef.current;
    if (sim && sim.status === 'running') {
      const interval = Math.max(50, 1000 / (simSpeed * 4));
      timerRef.current = window.setInterval(() => {
        const currentSim = simulationRef.current;
        if (!currentSim || currentSim.status !== 'running') {
          if (timerRef.current) clearInterval(timerRef.current);
          return;
        }
        const prevVehicles = currentSim.vehicles.map(cloneVehicle);
        advanceSimulationTick(currentSim);
        const conflicts = detectActualConflicts(prevVehicles, currentSim.vehicles);
        if (conflicts.length > 0) {
          currentSim.actualCollisions += conflicts.length;
        }
        setSimulation({ ...currentSim });
      }, interval);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [simulation?.status, simSpeed]);

  const metrics: SimulationMetrics | null = simulation
    ? selectSimulationMetrics(simulation)
    : null;

  return {
    scene,
    simulation,
    history,
    selectedTool,
    simSpeed,
    hoveredCell,
    infoMessage,
    seed,
    metrics,
    setSelectedTool,
    setHoveredCell,
    setInfoMessage,
    setSeed,
    handleCellEdit,
    handleDeleteVehicle,
    handleDeleteIncident,
    handleClearMap,
    handleRandomSeed,
    handleLoadChallenge,
    handleUndo,
    handleRedo,
    handlePlan,
    handleStart,
    handlePause,
    handleResume,
    handleStep,
    handleReset,
    handleResetAll,
    handleSetSpeed,
    handleExportScene,
    handleImportScene,
  };
}
