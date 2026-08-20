import assert from 'node:assert/strict';
import test from 'node:test';
import pino from 'pino';
import { configSchema } from '../dist/config/schema.js';
import { ForbiddenError, normalizeError } from '../dist/utils/errors.js';
import {
    assertDatasetAllowed,
    assertUssPathAllowed,
    enforceSecurity,
    redactArgs,
} from '../dist/policy/rules.js';

function config(security = {}) {
    return configSchema.parse({
        zosmf: { host: 'mainframe.example', user: 'USER1', password: 'secret' },
        mcp: {},
        limits: {},
        enterprise: {},
        security,
    });
}

function ctx(security) {
    return { config: config(security), logger: pino({ level: 'silent' }), session: {} };
}

test('read-only mode blocks writes but leaves reads alone', () => {
    const readOnly = ctx({ readOnly: 'true' });
    assert.throws(() => enforceSecurity(readOnly, 'submit_jcl'), ForbiddenError);
    assert.doesNotThrow(() => enforceSecurity(readOnly, 'list_jobs'));
});

test('allow and block lists are matched against the published tool name', () => {
    // Regression guard: the name a tool registers under must be the same name
    // policy is evaluated against, or these settings silently do nothing.
    const blocked = ctx({ blockedTools: 'summarize_abends' });
    assert.throws(() => enforceSecurity(blocked, 'summarize_abends'), ForbiddenError);

    const allowed = ctx({ allowedTools: 'list_jobs,list_db2_subsystems' });
    assert.doesNotThrow(() => enforceSecurity(allowed, 'list_db2_subsystems'));
    assert.throws(() => enforceSecurity(allowed, 'read_dataset'), ForbiddenError);
});

test('dataset boundaries follow the configured patterns', () => {
    const cfg = config({ allowedDatasetPatterns: 'PROD.*,SYS1.PROCLIB' });
    assert.doesNotThrow(() => assertDatasetAllowed(cfg, 'prod.payroll'));
    assert.doesNotThrow(() => assertDatasetAllowed(cfg, 'SYS1.PROCLIB'));
    assert.throws(() => assertDatasetAllowed(cfg, 'TEST.PAYROLL'), ForbiddenError);
});

test('USS boundaries are not fooled by a shared prefix or by ".."', () => {
    const cfg = config({ allowedUssPaths: '/u/appdev' });
    assert.doesNotThrow(() => assertUssPathAllowed(cfg, '/u/appdev/logs/run.log'));
    assert.throws(() => assertUssPathAllowed(cfg, '/u/appdev2/secrets'), ForbiddenError);
    assert.throws(() => assertUssPathAllowed(cfg, '/u/appdev/../etc/passwd'), ForbiddenError);
});

test('audit records never carry credentials or a JCL body', () => {
    const redacted = redactArgs({
        dsn: 'PROD.PAYROLL',
        password: 'hunter2',
        nested: { apiKey: 'abc123' },
        jcl: '//PAYJOB JOB\n//STEP1 EXEC PGM=IEFBR14\n',
    });
    assert.equal(redacted.dsn, 'PROD.PAYROLL');
    assert.equal(redacted.password, '[REDACTED]');
    assert.equal(redacted.nested.apiKey, '[REDACTED]');
    assert.match(redacted.jcl, /^\[JCL \d+ bytes\]$/);
});

test('an unreachable host is reported as a connection problem, not a mystery', () => {
    // The Zowe SDK often gives us only this sentence, with the cause nested
    // underneath. It should still point at the settings worth checking.
    const sdkError = new Error('Failed to send an HTTP request.');
    const normalized = normalizeError(sdkError);
    assert.equal(normalized.code, 'CONNECTION_ERROR');
    assert.match(normalized.message, /ZOSMF_HOST/);
});

test('rejected credentials are named as such', () => {
    const normalized = normalizeError(new Error('Request failed with status 401 Unauthorized'));
    assert.equal(normalized.code, 'CONNECTION_ERROR');
    assert.match(normalized.message, /ZOSMF_USER|ZOSMF_TOKEN/);
});
