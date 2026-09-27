import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, createReadStream } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const deliveryDir = join(root, '_delivery');
const submissionId = 'claude-code-dsv4pro';
const zipName = `signalgrid-${submissionId}`;
const zipFile = join(deliveryDir, `${zipName}.zip`);

// Ensure delivery directory
if (!existsSync(deliveryDir)) {
  mkdirSync(deliveryDir, { recursive: true });
}

console.log('Packaging submission...');

// Build the project first
console.log('Building...');
execSync('npm run build', { cwd: root, stdio: 'inherit' });

// Files to include
const includePatterns = [
  'src/**/*.ts',
  'src/**/*.tsx',
  'src/**/*.css',
  'tests/**/*.ts',
  'tests/**/*.tsx',
  'scripts/*.mjs',
  'index.html',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'tsconfig.node.json',
  'vite.config.ts',
  'vitest.config.ts',
  'playwright.config.ts',
  'README.md',
  'ARCHITECTURE.md',
  'IMPLEMENTATION_PLAN.md',
  'FINAL_REPORT.md',
  'BENCHMARK_MANIFEST.json',
  'EVIDENCE/**/*',
];

// Files to exclude
const excludePatterns = [
  'node_modules',
  'dist',
  '.git',
  '.env',
  '_delivery',
];

// Use a simpler approach: copy all files except excluded
console.log('Creating ZIP...');

// Create a staging directory
const stageDir = join(deliveryDir, '.stage', zipName);
if (existsSync(stageDir)) {
  execSync(`rm -rf "${stageDir}"`, { shell: true });
}
mkdirSync(stageDir, { recursive: true });

// Copy files
const copyExcludes = 'node_modules dist .git .env _delivery .claude .vscode .idea';
// Use PowerShell compatible approach on Windows, rsync-style on Unix
try {
  // Try tar approach for Unix
  const isWindows = process.platform === 'win32';

  if (isWindows) {
    // Use PowerShell or a simple copy for Windows
    // Just copy src, tests, scripts, and root files
    const dirs = ['src', 'tests', 'scripts', 'EVIDENCE'];
    const rootFiles = [
      'index.html', 'package.json', 'package-lock.json',
      'tsconfig.json', 'tsconfig.node.json', 'vite.config.ts',
      'vitest.config.ts', 'playwright.config.ts',
      'README.md', 'ARCHITECTURE.md', 'IMPLEMENTATION_PLAN.md',
      'FINAL_REPORT.md', 'BENCHMARK_MANIFEST.json',
    ];

    for (const d of dirs) {
      const src = join(root, d);
      if (existsSync(src)) {
        const dst = join(stageDir, d);
        mkdirSync(dst, { recursive: true });
        execSync(`cp -r "${src}/"* "${dst}/" 2>/dev/null || true`, { shell: true });
      }
    }

    for (const f of rootFiles) {
      const src = join(root, f);
      if (existsSync(src)) {
        execSync(`cp "${src}" "${stageDir}/${f}"`, { shell: true });
      }
    }
  } else {
    // Unix-based copy
    execSync(`rsync -av --exclude='node_modules' --exclude='dist' --exclude='.git' --exclude='_delivery' --exclude='.env' ./ "${stageDir}/"`, { cwd: root, stdio: 'inherit' });
  }

  // Create ZIP
  const zipCmd = `cd "${deliveryDir}/.stage" && zip -r "${zipFile}" "${zipName}"`;
  execSync(zipCmd, { stdio: 'inherit' });

  // Clean up staging
  execSync(`rm -rf "${stageDir}"`, { shell: true });

} catch (e) {
  console.error('Error creating package:', e.message);
  // Fallback: try a simpler approach
  console.log('Fallback: creating minimal package...');
}

// Compute SHA-256 of ZIP
if (existsSync(zipFile)) {
  const hash = createHash('sha256');
  const stream = createReadStream(zipFile);
  await new Promise((resolve, reject) => {
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', resolve);
    stream.on('error', reject);
  });
  const sha256 = hash.digest('hex');

  // Write SHA256
  writeFileSync(`${zipFile}.sha256.txt`, sha256);

  // Write SHA256SUMS.txt inside evidence
  const sumsPath = join(root, 'SHA256SUMS.txt');
  const sumsContent = [
    `${sha256}  ${zipName}.zip`,
  ];
  writeFileSync(sumsPath, sumsContent.join('\n'));

  console.log(`Package created: ${zipFile}`);
  console.log(`SHA-256: ${sha256}`);
  console.log(`Size: ${(await import('fs')).statSync(zipFile).size} bytes`);
} else {
  console.error('ZIP file was not created!');
  process.exit(1);
}
