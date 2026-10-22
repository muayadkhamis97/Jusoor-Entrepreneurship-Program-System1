import assert from 'node:assert/strict';
import test from 'node:test';
import { isModuleLoadError, recoverFromRenderError } from './module-load-recovery';

test('recognizes module-download failures across browser engines and production chunks', () => {
  for (const message of [
    'Failed to fetch dynamically imported module: https://example.test/src/clerk-auth-page.tsx',
    'error loading dynamically imported module: https://example.test/assets/auth.js',
    'Importing a module script failed.',
    'Loading chunk 21 failed.\n(error: https://example.test/assets/auth.js)',
    'Loading CSS chunk 21 failed.',
  ]) assert.equal(isModuleLoadError(new TypeError(message)), true, message);
  const chunkError = new Error('Unavailable module');
  chunkError.name = 'ChunkLoadError';
  assert.equal(isModuleLoadError(chunkError), true);
});

test('does not confuse API failures or application bugs with failed module imports', () => {
  for (const error of [new TypeError('Failed to fetch'), new Error('Forbidden'), new Error('Cannot read properties of undefined'), null, {}]) {
    assert.equal(isModuleLoadError(error), false);
  }
});

test('explicit module retry reloads once; ordinary render retry only resets the boundary', () => {
  let reloads = 0;
  let resets = 0;
  const actions = { reload: () => { reloads++; }, reset: () => { resets++; } };
  recoverFromRenderError(new Error('Failed to fetch dynamically imported module: /page.js'), actions);
  assert.deepEqual({ reloads, resets }, { reloads: 1, resets: 0 });
  recoverFromRenderError(new Error('Unexpected render error'), actions);
  assert.deepEqual({ reloads, resets }, { reloads: 1, resets: 1 });
});
