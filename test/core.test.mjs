import assert from 'node:assert/strict';
import test from 'node:test';
import { configSchema } from '../dist/config/schema.js';
import { isRetryableReadError, mapConcurrent, retryReadOnly } from '../dist/utils/async.js';
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

test('bounded concurrency handles empty input, invalid limits, and mapper failures', async () => {
    assert.deepEqual(await mapConcurrent([], 3, async (value) => value), []);
    assert.deepEqual(await mapConcurrent([1, 2], 0, async (value) => value * 2), [2, 4]);
    await assert.rejects(
        mapConcurrent([1], 1, async () => {
            throw new Error('mapper failed');
        }),
        /mapper failed/,
    );
});

test('retries a temporary read failure and preserves the result', async () => {
    let attempts = 0;
    const waits = [];
    const result = await retryReadOnly(
        async () => {
            attempts += 1;
            if (attempts === 1) {
                const error = new Error('temporary network failure');
                error.code = 'ECONNRESET';
                throw error;
            }
            return 'recovered';
        },
        { retries: 1, baseDelayMs: 125, sleep: async (delayMs) => waits.push(delayMs) },
    );

    assert.equal(result, 'recovered');
    assert.equal(attempts, 2);
    assert.deepEqual(waits, [125]);
});

test('recognizes temporary HTTP, network, message, and nested-cause failures', () => {
    const connectionReset = new Error('socket closed');
    connectionReset.code = 'ECONNRESET';
    const nestedTimeout = new Error('request failed', {
        cause: Object.assign(new Error('late'), { code: 'ETIMEDOUT' }),
    });
    const zoweBusy = Object.assign(new Error('Rest request failed'), {
        mDetails: { msg: 'The service is busy', httpStatus: 503, source: 'http' },
    });
    const zoweReset = Object.assign(new Error('Rest request failed'), {
        mDetails: { msg: 'Failed to send an HTTP request', errno: 'ECONNRESET' },
    });
    const zoweStringStatus = Object.assign(new Error('Rest request failed'), {
        mDetails: { errorCode: '502', additionalDetails: 'bad gateway' },
    });

    for (const error of [
        Object.assign(new Error('busy'), { statusCode: 429 }),
        Object.assign(new Error('upstream failed'), { response: { status: 503 } }),
        new Error('HTTP(S) status 504 Gateway Timeout'),
        new Error('service temporarily unavailable'),
        connectionReset,
        nestedTimeout,
        zoweBusy,
        zoweReset,
        zoweStringStatus,
    ]) {
        assert.equal(isRetryableReadError(error), true, error.message);
    }

    assert.equal(isRetryableReadError('socket hang up'), true);
    assert.equal(
        isRetryableReadError(Object.assign(new Error('custom'), { code: 'CUSTOM' })),
        false,
    );
    assert.equal(isRetryableReadError({ cause: { code: 'EPIPE' } }), true);
});

test('does not retry authentication, validation, or missing-resource failures', async () => {
    const failures = [
        Object.assign(new Error('unauthorized'), { statusCode: 401 }),
        Object.assign(new Error('forbidden'), { statusCode: 403 }),
        Object.assign(new Error('not found'), { statusCode: 404 }),
        new Error('Validation failed'),
    ];

    for (const failure of failures) {
        let attempts = 0;
        await assert.rejects(
            retryReadOnly(
                async () => {
                    attempts += 1;
                    throw failure;
                },
                { retries: 2, baseDelayMs: 0 },
            ),
            failure,
        );
        assert.equal(attempts, 1, failure.message);
        assert.equal(isRetryableReadError(failure), false, failure.message);
    }
});

test('caps retries and applies exponential backoff', async () => {
    let attempts = 0;
    const waits = [];
    const failure = Object.assign(new Error('upstream unavailable'), { statusCode: 503 });

    await assert.rejects(
        retryReadOnly(
            async () => {
                attempts += 1;
                throw failure;
            },
            {
                retries: 3,
                baseDelayMs: 100,
                maxDelayMs: 250,
                sleep: async (delayMs) => waits.push(delayMs),
            },
        ),
        failure,
    );

    assert.equal(attempts, 4);
    assert.deepEqual(waits, [100, 200, 250]);
});

test('retry options clamp invalid values and can disable retries', async () => {
    let attempts = 0;
    const failure = Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' });
    await assert.rejects(
        retryReadOnly(
            async () => {
                attempts += 1;
                throw failure;
            },
            { retries: -10, baseDelayMs: -1 },
        ),
        failure,
    );
    assert.equal(attempts, 1);
});

test('default retry sleep path recovers without an injected clock', async () => {
    let attempts = 0;
    const result = await retryReadOnly(
        async () => {
            attempts += 1;
            if (attempts === 1) {
                throw Object.assign(new Error('connection reset'), { code: 'ECONNRESET' });
            }
            return 'ok';
        },
        { baseDelayMs: 0 },
    );
    assert.equal(result, 'ok');
    assert.equal(attempts, 2);
});
