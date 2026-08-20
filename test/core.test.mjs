import assert from 'node:assert/strict';
import test from 'node:test';
import { configSchema } from '../dist/config/schema.js';
import { mapConcurrent, retryReadOnly } from '../dist/utils/async.js';
import { createEndpointSession, createSession, resetSessions } from '../dist/zowe/session.js';
import { assertValidJobId, normalizeJobId } from '../dist/tools/jobs/shared.js';
import { assertValidMemberName, normalizeDatasetName } from '../dist/tools/datasets/shared.js';

function config(overrides = {}) {
    return configSchema.parse({
        zosmf: {
            host: 'mainframe.example',
            user: 'USER1',
            password: 'secret',
        },
        mcp: {},
        limits: {},
        enterprise: {},
        security: {},
        ...overrides,
    });
}

test('normalizes common mainframe identifiers', () => {
    assert.equal(normalizeJobId(' tsu01234 '), 'TSU01234');
    assert.equal(normalizeDatasetName(" 'user1.cobol' "), 'USER1.COBOL');
    assert.doesNotThrow(() => assertValidJobId('job1'));
    assert.doesNotThrow(() => assertValidMemberName('hello'));
    assert.throws(() => assertValidJobId('1234'));
    assert.throws(() => assertValidMemberName('9BAD'));
});

test('reuses sessions only within the same validated config', () => {
    resetSessions();
    const firstConfig = config();
    const secondConfig = config({ zosmf: { host: 'other.example', token: 'token' } });
    assert.equal(createSession(firstConfig), createSession(firstConfig));
    assert.notEqual(createSession(firstConfig), createSession(secondConfig));
});

test('reuses endpoint sessions by config and endpoint', () => {
    resetSessions();
    const appConfig = config();
    assert.equal(
        createEndpointSession(appConfig, 'cmci'),
        createEndpointSession(appConfig, 'cmci'),
    );
    assert.notEqual(
        createEndpointSession(appConfig, 'cmci'),
        createEndpointSession(appConfig, 'db2'),
    );
});

test('bounded concurrency preserves order and never exceeds its limit', async () => {
    let active = 0;
    let peak = 0;
    const values = Array.from({ length: 12 }, (_, index) => index);
    const results = await mapConcurrent(values, 3, async (value) => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return value * 2;
    });
    assert.deepEqual(
        results,
        values.map((value) => value * 2),
    );
    assert.equal(peak, 3);
});


test('retries a temporary read failure once', async () => {
  let attempts = 0;
  const result = await retryReadOnly(async () => {
    attempts += 1;
    if (attempts === 1) {
      const error = new Error('temporary network failure');
      error.code = 'ECONNRESET';
      throw error;
    }
    return 'ok';
  }, { retries: 1, baseDelayMs: 0 });

  assert.equal(result, 'ok');
  assert.equal(attempts, 2);
});

test('does not retry permanent read failures', async () => {
  let attempts = 0;
  await assert.rejects(
    retryReadOnly(async () => {
      attempts += 1;
      const error = new Error('not found');
      error.statusCode = 404;
      throw error;
    }, { retries: 1, baseDelayMs: 0 }),
  );
  assert.equal(attempts, 1);
});
