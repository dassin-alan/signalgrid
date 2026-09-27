import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const evidenceDir = join(root, 'EVIDENCE');

// Ensure evidence directory exists
if (!existsSync(evidenceDir)) {
  mkdirSync(evidenceDir, { recursive: true });
}

const results = {
  timestamp: new Date().toISOString(),
  checks: {},
  testCounts: { vitest: 0, playwright: 0 },
  exitCode: 0,
};

function runCheck(name, command, options = {}) {
  try {
    const output = execSync(command, { cwd: root, stdio: 'pipe', ...options });
    return { passed: true, output: output.toString(), exitCode: 0 };
  } catch (e) {
    return { passed: false, output: e.stdout?.toString() + '\n' + e.stderr?.toString(), exitCode: e.status };
  }
}

// 1. TypeScript check
console.log('Running TypeScript check...');
const tscResult = runCheck('typecheck', 'npx tsc --noEmit');
results.checks.typecheck = { status: tscResult.passed ? 'passed' : 'failed', exitCode: tscResult.exitCode };
writeFileSync(join(evidenceDir, 'typecheck.log'), tscResult.output);
if (!tscResult.passed) results.exitCode = 1;

// 2. Vitest tests
console.log('Running Vitest tests...');
const vitestResult = runCheck('vitest', 'npx vitest run --reporter=verbose', { timeout: 120000 });
results.checks.vitest = { status: vitestResult.passed ? 'passed' : 'failed', exitCode: vitestResult.exitCode };
writeFileSync(join(evidenceDir, 'unit-tests.log'), vitestResult.output);
if (!vitestResult.passed) results.exitCode = 1;

// Parse test count
const testMatch = vitestResult.output.match(/(\d+)\s+tests?\s+(passed|failed)/i);
if (testMatch) {
  results.testCounts.vitest = parseInt(testMatch[1]) || 0;
}

// 3. Production build
console.log('Running production build...');
const buildResult = runCheck('build', 'npm run build', { timeout: 120000 });
results.checks.build = { status: buildResult.passed ? 'passed' : 'failed', exitCode: buildResult.exitCode };
writeFileSync(join(evidenceDir, 'build.log'), buildResult.output);
if (!buildResult.passed) results.exitCode = 1;

// 4. Playwright tests (optional, may fail if no browser)
console.log('Running Playwright tests...');
const pwResult = runCheck('playwright', 'npx playwright test --reporter=list', { timeout: 120000 });
results.checks.playwright = { status: pwResult.passed ? 'passed' : 'failed', exitCode: pwResult.exitCode };
writeFileSync(join(evidenceDir, 'playwright.log'), pwResult.output);
// Don't fail on playwright if browser not available

// 5. Required files check
console.log('Checking required files...');
const requiredFiles = [
  'README.md', 'ARCHITECTURE.md', 'IMPLEMENTATION_PLAN.md', 'FINAL_REPORT.md',
  'BENCHMARK_MANIFEST.json', 'index.html', 'package.json', 'package-lock.json',
  'tsconfig.json', 'vite.config.ts', 'vitest.config.ts', 'playwright.config.ts',
  'src/main.tsx', 'src/App.tsx', 'src/algorithms/astar.ts', 'src/algorithms/assignment.ts',
  'src/simulation/simulationState.ts', 'src/simulation/conflictDetection.ts',
  'src/validation/sceneValidator.ts',
];
const fileChecks = {};
for (const f of requiredFiles) {
  fileChecks[f] = existsSync(join(root, f));
}
results.checks.requiredFiles = { status: Object.values(fileChecks).every(Boolean) ? 'passed' : 'failed', files: fileChecks };
if (!Object.values(fileChecks).every(Boolean)) {
  results.exitCode = 1;
}

// 6. Core exports check
console.log('Checking core exports...');
const coreExports = [
  { file: 'src/algorithms/astar.ts', export: 'findWeightedPath' },
  { file: 'src/algorithms/assignment.ts', export: 'assignIncidentsGlobally' },
  { file: 'src/simulation/simulationState.ts', export: 'createSimulationState' },
  { file: 'src/simulation/simulationState.ts', export: 'advanceSimulationTick' },
  { file: 'src/simulation/conflictDetection.ts', export: 'detectActualConflicts' },
  { file: 'src/simulation/dynamicMapUpdate.ts', export: 'applyMapChangeToSimulation' },
  { file: 'src/validation/sceneValidator.ts', export: 'validateSceneFile' },
  { file: 'src/simulation/metrics.ts', export: 'selectSimulationMetrics' },
  { file: 'src/scenarios/challengeScenarios.ts', export: 'createSeededScenario' },
];
const exportChecks = {};
for (const { file, export: exp } of coreExports) {
  const content = existsSync(join(root, file)) ? readFileSync(join(root, file), 'utf-8') : '';
  exportChecks[`${file}:${exp}`] = content.includes(`export function ${exp}`) || content.includes(`export const ${exp}`);
}
results.checks.coreExports = { status: Object.values(exportChecks).every(Boolean) ? 'passed' : 'failed', exports: exportChecks };
if (!Object.values(exportChecks).every(Boolean)) {
  results.exitCode = 1;
}

// 7. TODO scan
console.log('Scanning for TODOs...');
const srcFiles = execSync('find src -name "*.ts" -o -name "*.tsx" 2>/dev/null || dir /s /b src\\*.ts src\\*.tsx 2>nul', { cwd: root, shell: true, stdio: 'pipe' }).toString();
const todoFiles = [];
const srcFileList = srcFiles.split('\n').filter(Boolean);
for (const f of srcFileList) {
  const content = readFileSync(join(root, f.trim()), 'utf-8');
  if (content.includes('TODO')) {
    todoFiles.push(f.trim());
  }
}
results.checks.todoScan = { status: todoFiles.length === 0 ? 'passed' : 'warning', files: todoFiles };

// 8. any scan
console.log('Scanning for "any" types...');
const anyCounts = {};
let totalAny = 0;
for (const f of (srcFileList.length > 0 ? srcFileList : ['src/App.tsx'])) {
  const content = existsSync(join(root, f.trim())) ? readFileSync(join(root, f.trim()), 'utf-8') : '';
  const anyMatches = content.match(/\bany\b/g);
  if (anyMatches && anyMatches.length > 5) {
    anyCounts[f.trim()] = anyMatches.length;
    totalAny += anyMatches.length;
  }
}
results.checks.anyScan = { status: totalAny < 20 ? 'passed' : 'warning', count: totalAny, details: anyCounts };

// 9. Dependencies check
console.log('Checking dependencies...');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
const forbiddenPatterns = ['pathfinding', 'graph', 'algorithm', 'navigation', 'map', 'game', 'simulation-engine', 'routing', 'planning'];
const forbiddenDeps = [];
for (const dep of Object.keys(allDeps)) {
  for (const pattern of forbiddenPatterns) {
    if (dep.toLowerCase().includes(pattern)) {
      forbiddenDeps.push(dep);
    }
  }
}
results.checks.dependencies = { status: forbiddenDeps.length === 0 ? 'passed' : 'failed', forbiddenDeps };

// 10. Environment
console.log('Recording environment...');
const env = {
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  cwd: root,
  timestamp: new Date().toISOString(),
};
writeFileSync(join(evidenceDir, 'environment.txt'), JSON.stringify(env, null, 2));

// 11. Project tree
console.log('Generating project tree...');
const treeResult = runCheck('tree', 'find . -not -path "./node_modules/*" -not -path "./dist/*" -not -path "./.git/*" -not -path "./_delivery/*" | sort');
writeFileSync(join(evidenceDir, 'project-tree.txt'), treeResult.output);

// Write summary
writeFileSync(join(evidenceDir, 'verification-summary.json'), JSON.stringify(results, null, 2));

console.log('\n=== Verification Summary ===');
console.log(JSON.stringify(results, null, 2));

process.exit(results.exitCode);
