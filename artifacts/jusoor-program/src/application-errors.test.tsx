import assert from 'node:assert/strict';
import test from 'node:test';
import { applicationSubmitErrorKey } from './application-errors';

test('application submission explains duplicate applications and keeps other failures retryable', () => {
  assert.match(
    applicationSubmitErrorKey({ status: 409 }),
    /already exists.*Sign in/i,
  );
  assert.match(
    applicationSubmitErrorKey({ response: { status: 409 } }),
    /already exists.*Sign in/i,
  );
  assert.match(
    applicationSubmitErrorKey({ status: 503 }),
    /Check your connection and try again/,
  );
  assert.match(
    applicationSubmitErrorKey({ status: 422 }),
    /Review the required application fields/,
  );
  assert.match(
    applicationSubmitErrorKey({ status: 409, data: { error: 'duplicate' } }),
    /already exists/,
  );
  assert.match(
    applicationSubmitErrorKey({ status: 400, data: { error: 'Program closed' } }),
    /no longer accepting applications/,
  );
  assert.match(applicationSubmitErrorKey(new Error('offline')), /Check your connection and try again/);
});
