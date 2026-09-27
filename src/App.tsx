import React, { useCallback, useEffect, useState } from 'react';
import { useSimulation } from './hooks/useSimulation';
import { TerrainType, TERRAIN_LABELS, TERRAIN_COST } from './domain/terrain';
import { coordKey } from './domain/coordinates';
import { sceneToFile, SceneFile } from './domain/scene';
import { validateSceneFile } from './validation/sceneValidator';
import { challengeScenarios } from './scenarios/challengeScenarios';
import { Vehicle } from './domain/vehicle';
import { Incident } from './domain/incident';
import { SimulationLog } from './simulation/simulationState';
import { Conflict, detectActualConflicts } from './simulation/conflictDetection';

const TOOLS: { id: TerrainType | 'vehicle' | 'incident' | 'eraser'; label: string; swatch: string }[] = [
  { id: 'road', label: 'Road', swatch: 'road' },
  { id: 'congested', label: 'Congested', swatch: 'congested' },
  { id: 'hazardous', label: 'Hazardous', swatch: 'hazardous' },
  { id: 'blocked', label: 'Blocked', swatch: 'blocked' },
  { id: 'station', label: 'Station', swatch: 'station' },
  { id: 'incident', label: 'Incident', swatch: 'incident' },
  { id: 'vehicle', label: 'Vehicle', swatch: 'vehicle' },
  { id: 'eraser', label: 'Eraser', swatch: 'eraser' },
];

const SPEEDS = [0.5, 1, 2, 4];

function App() {
  const sim = useSimulation();
  const [cellSize, setCellSize] = useState(32);
  const [logCollapsed, setLogCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [logFilterVehicle, setLogFilterVehicle] = useState('');
  const [logFilterType, setLogFilterType] = useState('');
  const [logFilterSeverity, setLogFilterSeverity] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const canvasRef = React.useRef<HTMLDivElement>(null);

  const scene = sim.scene;
  const grid = scene.grid;
  const width = grid[0]?.length ?? 24;
  const height = grid.length;

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        sim.handleUndo();
      } else if (e.ctrlKey && e.key === 'y') {
        e.preventDefault();
        sim.handleRedo();
      } else if (e.ctrlKey && e.key === 'Z') {
        e.preventDefault();
        sim.handleRedo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [sim.handleUndo, sim.handleRedo]);

  // Fit cell size to screen
  useEffect(() => {
    const calcSize = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const availW = vw - (leftCollapsed ? 0 : 180) - (rightCollapsed ? 0 : 280) - 48;
      const availH = vh - 44 - (logCollapsed ? 32 : 180) - 48;
      const byW = Math.floor(availW / width);
      const byH = Math.floor(availH / height);
      setCellSize(Math.max(16, Math.min(byW, byH, 48)));
    };
    calcSize();
    window.addEventListener('resize', calcSize);
    return () => window.removeEventListener('resize', calcSize);
  }, [width, height, leftCollapsed, rightCollapsed, logCollapsed]);

  const handleExportClick = useCallback(() => {
    const file = sceneToFile(scene);
    const json = JSON.stringify(file, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'signalgrid-scene.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [scene]);

  const handleImportClick = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (re: any) => {
        try {
          const data = JSON.parse(re.target.result);
          const result = validateSceneFile(data);
          if (result.success) {
            sim.handleImportScene(re.target.result);
          } else {
            sim.setInfoMessage(`Validation failed: ${result.errors.map(e => e.message).join('; ')}`);
          }
        } catch (err: any) {
          sim.setInfoMessage(`Import error: ${err.message}`);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [sim]);

  const simulationStatus = sim.simulation?.status ?? 'idle';
  const logs = sim.simulation?.logs ?? [];

  // Filter logs
  const filteredLogs = logs.filter(l => {
    if (logFilterVehicle && l.vehicleId !== logFilterVehicle) return false;
    if (logFilterType && l.type !== logFilterType) return false;
    if (logFilterSeverity && l.severity !== logFilterSeverity) return false;
    return true;
  });

  return (
    <div className="app-layout">
      {/* Top Bar */}
      <div className="top-bar" data-testid="top-bar">
        <span className="brand">SignalGrid</span>
        <span className={`status-badge status-${simulationStatus}`} data-testid="sim-status">
          {simulationStatus.toUpperCase()}
        </span>
        <span className="tick-display" data-testid="tick-display">
          Tick: {sim.simulation?.tick ?? 0}
        </span>
        <button onClick={sim.handlePlan} data-testid="btn-plan" disabled={simulationStatus === 'running'}>Plan</button>
        <button className="success" onClick={sim.handleStart} data-testid="btn-start">Start</button>
        <button onClick={sim.handlePause} data-testid="btn-pause" disabled={simulationStatus !== 'running'}>Pause</button>
        <button onClick={sim.handleResume} data-testid="btn-resume" disabled={simulationStatus !== 'paused'}>Resume</button>
        <button onClick={sim.handleStep} data-testid="btn-step" disabled={simulationStatus === 'running'}>Step</button>
        <button onClick={sim.handleReset} data-testid="btn-reset">Reset Sim</button>
        <button className="danger" onClick={sim.handleResetAll} data-testid="btn-reset-all">Reset All</button>
        <span className="spacer" />
        <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>Speed:</span>
        {SPEEDS.map(s => (
          <button key={s} className={sim.simSpeed === s ? 'active' : ''} onClick={() => sim.handleSetSpeed(s)} data-testid={`speed-${s}`}>
            {s}x
          </button>
        ))}
        <button onClick={handleExportClick} data-testid="btn-export">Export</button>
        <button onClick={handleImportClick} data-testid="btn-import">Import</button>
      </div>

      {/* Main Content */}
      <div className="main-content">
        {/* Left Panel */}
        {!leftCollapsed ? (
          <div className="left-panel" data-testid="left-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>Tools</h3>
              <button className="collapse-btn" onClick={() => setLeftCollapsed(true)} aria-label="Collapse tools panel">-</button>
            </div>
            {TOOLS.map(tool => (
              <button
                key={tool.id}
                className={`tool-btn ${sim.selectedTool === tool.id ? 'active' : ''}`}
                onClick={() => sim.setSelectedTool(tool.id)}
                data-testid={`tool-${tool.id}`}
                aria-label={tool.label}
              >
                <span className={`terrain-swatch ${tool.swatch}`} />
                {tool.label}
              </button>
            ))}
            <h3>Actions</h3>
            <button onClick={sim.handleClearMap} data-testid="btn-clear">Clear Map</button>
            <button onClick={sim.handleUndo} data-testid="btn-undo" disabled={sim.history.undoStack.length === 0}>Undo</button>
            <button onClick={sim.handleRedo} data-testid="btn-redo" disabled={sim.history.redoStack.length === 0}>Redo</button>
            <h3>Random</h3>
            <div className="seed-row">
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Seed:</span>
              <input
                type="number"
                value={sim.seed}
                onChange={e => sim.setSeed(parseInt(e.target.value) || 0)}
                data-testid="seed-input"
              />
              <button onClick={sim.handleRandomSeed} data-testid="btn-random">Generate</button>
            </div>
            <h3>Challenge Scenarios</h3>
            {challengeScenarios.map(cs => (
              <button key={cs.name} className="challenge-btn" onClick={() => sim.handleLoadChallenge(cs)} data-testid={`challenge-${cs.name.toLowerCase().replace(/\s+/g, '-')}`}>
                {cs.name}
              </button>
            ))}
          </div>
        ) : (
          <button className="reopen-btn" style={{ position: 'static', writingMode: 'vertical-lr', height: 'auto', padding: '8px 4px' }} onClick={() => setLeftCollapsed(false)} aria-label="Reopen tools panel">
            Tools
          </button>
        )}

        {/* Center Grid */}
        <div className="center-area" data-testid="center-area">
          <div className="grid-wrapper" ref={canvasRef}>
            <div
              className="grid-canvas"
              style={{
                gridTemplateColumns: `repeat(${width}, ${cellSize}px)`,
                gridTemplateRows: `repeat(${height}, ${cellSize}px)`,
              }}
              data-testid="grid-canvas"
            >
              {grid.flat().map(cell => {
                const terrain = cell.terrain;
                const hasVehicle = scene.vehicles.find(v => v.position.x === cell.x && v.position.y === cell.y);
                const hasIncident = scene.incidents.find(i => i.position.x === cell.x && i.position.y === cell.y);
                const cellKey = coordKey(cell);

                return (
                  <div
                    key={cellKey}
                    className={`grid-cell ${terrain}`}
                    style={{ width: cellSize, height: cellSize }}
                    onMouseDown={() => sim.handleCellEdit(cell.x, cell.y, false)}
                    onMouseEnter={() => {
                      sim.setHoveredCell({ x: cell.x, y: cell.y });
                    }}
                    onMouseUp={() => sim.handleCellEdit(cell.x, cell.y, true)}
                    data-testid={`cell-${cell.x}-${cell.y}`}
                    data-terrain={terrain}
                  >
                    {sim.scene.settings.showCostOverlay && terrain !== 'blocked' && (
                      <span className="cost-label">{TERRAIN_COST[terrain]}</span>
                    )}
                    {sim.scene.settings.showCoordinates && (
                      <span className="coord-label">{cell.x},{cell.y}</span>
                    )}
                    {hasVehicle && (
                      <div className={`vehicle-dot ${hasVehicle.status}`} data-testid={`vehicle-${hasVehicle.id}-grid`}>
                        {hasVehicle.id.replace('vehicle-', 'V')}
                      </div>
                    )}
                    {hasIncident && (
                      <div className={`incident-dot ${hasIncident.status}`} data-testid={`incident-${hasIncident.id}-grid`}>
                        {hasIncident.id.replace('incident-', 'I')}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Panel */}
        {!rightCollapsed ? (
          <div className="right-panel" data-testid="right-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>Vehicles</h3>
              <button className="collapse-btn" onClick={() => setRightCollapsed(true)} aria-label="Collapse panel">-</button>
            </div>
            {scene.vehicles.map(v => (
              <div key={v.id} className="vehicle-card" data-testid={`vehicle-card-${v.id}`}>
                <div className="v-header">
                  <span className="v-id">{v.id}</span>
                  <span className={`v-status ${v.status}`}>{v.status}</span>
                </div>
                <div className="v-info">
                  <div>Pos: ({v.position.x}, {v.position.y})</div>
                  {v.targetIncidentId && <div>Target: {v.targetIncidentId}</div>}
                  <div>Cost: {v.accumulatedMoveCost}</div>
                  <div>Waiting: {v.totalWaitingTicks} | Replan: {v.replanCount}</div>
                  <div>Tasks: {v.completedTasks}</div>
                </div>
                <div className="v-actions">
                  <button onClick={() => sim.handleDeleteVehicle(v.id)} data-testid={`delete-vehicle-${v.id}`}>Remove</button>
                </div>
              </div>
            ))}
            <h3>Incidents</h3>
            {scene.incidents.map(inc => (
              <div key={inc.id} className="incident-card" data-testid={`incident-card-${inc.id}`}>
                <div className="i-header">
                  <span className="i-id">{inc.id}</span>
                  <span className={`i-status ${inc.status}`}>{inc.status}</span>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                  Pos: ({inc.position.x}, {inc.position.y})
                  {inc.assignedVehicleId && <span> | Assigned: {inc.assignedVehicleId}</span>}
                </div>
                <div className="v-actions">
                  <button onClick={() => sim.handleDeleteIncident(inc.id)} data-testid={`delete-incident-${inc.id}`}>Remove</button>
                </div>
              </div>
            ))}
            <h3>Metrics</h3>
            <div className="panel-section" data-testid="metrics-panel">
              {sim.metrics && (
                <>
                  <div className="metric-row"><span>Vehicles</span><span className="metric-val">{sim.metrics.totalVehicles}</span></div>
                  <div className="metric-row"><span>Incidents</span><span className="metric-val">{sim.metrics.totalIncidents}</span></div>
                  <div className="metric-row"><span>Assigned</span><span className="metric-val">{sim.metrics.assignedIncidents}</span></div>
                  <div className="metric-row"><span>Completed</span><span className="metric-val ok">{sim.metrics.completedIncidents}</span></div>
                  <div className="metric-row"><span>Unreachable</span><span className="metric-val err">{sim.metrics.unreachableIncidents}</span></div>
                  <div className="metric-row"><span>Tick</span><span className="metric-val">{sim.metrics.currentTick}</span></div>
                  <div className="metric-row"><span>Total Moves Cost</span><span className="metric-val">{sim.metrics.actualMoveCost}</span></div>
                  <div className="metric-row"><span>Total Waiting</span><span className="metric-val">{sim.metrics.totalWaitingTicks}</span></div>
                  <div className="metric-row"><span>Replan Count</span><span className="metric-val">{sim.metrics.replanCount}</span></div>
                  <div className="metric-row"><span>Avg Response</span><span className="metric-val">{sim.metrics.averageResponseTime.toFixed(1)}</span></div>
                  <div className="metric-row"><span>Potential Conflicts</span><span className="metric-val warn">{sim.metrics.potentialConflicts}</span></div>
                  <div className="metric-row"><span>Conflicts Avoided</span><span className="metric-val ok">{sim.metrics.conflictsAvoided}</span></div>
                  <div className="metric-row"><span>Actual Collisions</span><span className={`metric-val ${sim.metrics.actualCollisions > 0 ? 'err' : 'ok'}`}>{sim.metrics.actualCollisions}</span></div>
                </>
              )}
            </div>
          </div>
        ) : (
          <button className="reopen-btn" style={{ position: 'static', writingMode: 'vertical-lr', height: 'auto', padding: '8px 4px' }} onClick={() => setRightCollapsed(true)} aria-label="Reopen panel">
            Info
          </button>
        )}
      </div>

      {/* Bottom Log Panel */}
      {!logCollapsed ? (
        <div className="bottom-panel" data-testid="log-panel">
          <div className="log-header">
            <h3>Event Log</h3>
            <span className="log-count">({filteredLogs.length}/{logs.length})</span>
            <div className="log-filters">
              <select value={logFilterVehicle} onChange={e => setLogFilterVehicle(e.target.value)} data-testid="log-filter-vehicle">
                <option value="">All Vehicles</option>
                {scene.vehicles.map(v => <option key={v.id} value={v.id}>{v.id}</option>)}
              </select>
              <select value={logFilterSeverity} onChange={e => setLogFilterSeverity(e.target.value)} data-testid="log-filter-severity">
                <option value="">All Severities</option>
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="error">Error</option>
                <option value="success">Success</option>
              </select>
            </div>
            <label style={{ fontSize: 10, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <input type="checkbox" checked={autoScroll} onChange={e => setAutoScroll(e.target.checked)} />
              Auto-scroll
            </label>
            <button onClick={() => sim.setInfoMessage(null)} style={{ fontSize: 10 }}>Clear Filters</button>
            <button className="collapse-btn" onClick={() => setLogCollapsed(true)} aria-label="Collapse log panel" data-testid="collapse-log">-</button>
          </div>
          <div className="log-body" data-testid="log-body">
            {filteredLogs.map(l => (
              <div key={l.id} className={`log-entry ${l.severity}`} data-testid={`log-${l.id}`}>
                <span className="log-tick">[{l.tick}]</span>
                <span className="log-type">{l.type}</span>
                <span className="log-msg">{l.message}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <button className="reopen-btn" onClick={() => setLogCollapsed(false)} data-testid="reopen-log" aria-label="Reopen log panel">
          Show Log
        </button>
      )}

      {/* Info Toast */}
      {sim.infoMessage && (
        <div className="info-toast" data-testid="info-toast" onClick={() => sim.setInfoMessage(null)}>
          {sim.infoMessage}
        </div>
      )}
    </div>
  );
}

export default App;
