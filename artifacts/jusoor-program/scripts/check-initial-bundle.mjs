import { gzipSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const artifactRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = path.join(artifactRoot, 'dist', 'public');
const manifestPath = path.join(outputRoot, '.vite', 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const entry = manifest['index.html'];

if (!entry?.isEntry) {
  throw new Error(`Could not find the Vite HTML entry in ${manifestPath}`);
}

const initialFiles = new Set();
function collectStaticImports(chunkKey) {
  const chunk = manifest[chunkKey];
  if (!chunk) throw new Error(`Manifest import "${chunkKey}" is missing`);
  if (chunk.file.endsWith('.js')) initialFiles.add(chunk.file);
  for (const importedChunk of chunk.imports ?? []) collectStaticImports(importedChunk);
}

collectStaticImports('index.html');

const dynamicallyReachable = new Set();
function collectDeferredImports(chunkKey, seen = new Set()) {
  if (seen.has(chunkKey)) return;
  seen.add(chunkKey);

  const chunk = manifest[chunkKey];
  if (!chunk) throw new Error(`Manifest import "${chunkKey}" is missing`);

  for (const dynamicChunk of chunk.dynamicImports ?? []) {
    dynamicallyReachable.add(dynamicChunk);
    collectDeferredImports(dynamicChunk, seen);
  }
  for (const importedChunk of chunk.imports ?? []) {
    if (importedChunk !== 'index.html') collectDeferredImports(importedChunk, seen);
  }
}

collectDeferredImports('index.html');

for (const moduleKey of [
  'src/analytics-surfaces.tsx',
  'src/course-package-player.tsx',
  'src/clerk-auth-page.tsx',
]) {
  const module = manifest[moduleKey];
  if (!dynamicallyReachable.has(moduleKey)) {
    throw new Error(`${moduleKey} must stay dynamically loaded from a route boundary`);
  }
  if (!module?.isDynamicEntry) {
    throw new Error(`${moduleKey} is not emitted as an on-demand JavaScript chunk`);
  }
  if (initialFiles.has(module.file)) {
    throw new Error(`${moduleKey} was included in the initial JavaScript download`);
  }
}

let rawBytes = 0;
let gzipBytes = 0;
for (const file of initialFiles) {
  const contents = await readFile(path.join(outputRoot, file));
  rawBytes += contents.byteLength;
  gzipBytes += gzipSync(contents).byteLength;
}

const rawKiB = rawBytes / 1024;
const gzipKiB = gzipBytes / 1024;
const budgetKiB = Number(process.env.INITIAL_JS_GZIP_BUDGET_KB ?? 165);
if (!Number.isFinite(budgetKiB) || budgetKiB <= 0) {
  throw new Error('INITIAL_JS_GZIP_BUDGET_KB must be a positive number');
}

console.log(
  `Initial JavaScript (static entry graph): ${rawKiB.toFixed(1)} KiB minified, ${gzipKiB.toFixed(1)} KiB gzip`,
);
console.log(`Included files: ${[...initialFiles].join(', ')}`);
console.log(`Gzip budget: ${budgetKiB.toFixed(1)} KiB`);

if (gzipKiB > budgetKiB) {
  throw new Error(
    `Initial JavaScript exceeds the ${budgetKiB.toFixed(1)} KiB gzip budget by ${(gzipKiB - budgetKiB).toFixed(1)} KiB`,
  );
}
