import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import pino from 'pino';
import { configSchema } from '../dist/config/schema.js';
import { buildServer } from '../dist/server.js';
import { mapConcurrent } from '../dist/utils/async.js';
import { createSession, resetSession } from '../dist/zowe/client.js';
import {
    createEndpointSession,
    resetEndpointSessions,
} from '../dist/zowe/rest-client.js';
import {
    assertValidJobId,
    normalizeJobId,
} from '../dist/tools/jobs/shared.js';
import {
    assertValidMemberName,
    normalizeDatasetName,
} from '../dist/tools/datasets/shared.js';

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
    resetSession();
    const firstConfig = config();
    const secondConfig = config({ zosmf: { host: 'other.example', token: 'token' } });
    assert.equal(createSession(firstConfig), createSession(firstConfig));
    assert.notEqual(createSession(firstConfig), createSession(secondConfig));
});

test('reuses endpoint sessions by config and endpoint', () => {
    resetEndpointSessions();
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
    assert.deepEqual(results, values.map((value) => value * 2));
    assert.equal(peak, 3);
});

test('publishes the complete MCP tool contract without duplicate names', async (t) => {
    const server = buildServer(config(), pino({ level: 'silent' }));
    const client = new Client({ name: 'contract-test', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    t.after(async () => {
        await client.close();
        await server.close();
    });

    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name);

    assert.equal(tools.length, 32);
    assert.equal(new Set(names).size, names.length);
    assert.ok(names.includes('list_jobs'));
    assert.ok(names.includes('list_datasets'));
    assert.ok(names.includes('security_posture_summary'));
});
