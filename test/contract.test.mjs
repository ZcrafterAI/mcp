import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import pino from 'pino';
import { configSchema } from '../dist/config/schema.js';
import { buildServer } from '../dist/server.js';
import { allTools } from '../dist/tools/registry.js';

function config(security = {}) {
    return configSchema.parse({
        zosmf: { host: 'mainframe.example', user: 'USER1', password: 'secret' },
        mcp: {},
        limits: {},
        enterprise: {},
        security,
    });
}

/** Start a server and a client wired to each other in memory. */
async function connect(t, security) {
    const server = buildServer(config(security), pino({ level: 'silent' }));
    const client = new Client({ name: 'contract-test', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    t.after(async () => {
        await client.close();
        await server.close();
    });

    await server.connect(serverTransport);
    await client.connect(clientTransport);
    return client;
}

test('every registered tool is advertised, described, and named once', async (t) => {
    const client = await connect(t, {});
    const { tools } = await client.listTools();

    const advertised = tools.map((tool) => tool.name).sort();
    const declared = allTools()
        .map((tool) => tool.name)
        .sort();

    // The registry and the wire must agree, or a tool exists that nothing lists.
    assert.deepEqual(advertised, declared);
    assert.equal(new Set(advertised).size, advertised.length);
    for (const tool of tools) {
        assert.ok(tool.description?.length > 20, `${tool.name} needs a real description`);
    }
});

test('blocking a tool by its published name actually blocks it', async (t) => {
    // Regression guard. A tool used to be able to register under one name while
    // policy was evaluated against another, which made these settings silently
    // do nothing. Blocking is refused before any mainframe call is attempted,
    // so this runs without a live host.
    const client = await connect(t, { blockedTools: 'summarize_abends' });
    const result = await client.callTool({ name: 'summarize_abends', arguments: {} });

    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /FORBIDDEN/);
    assert.match(result.content[0].text, /summarize_abends/);
});

test('an allow-list permits only the tools it names', async (t) => {
    const client = await connect(t, { allowedTools: 'list_db2_subsystems' });

    const denied = await client.callTool({ name: 'summarize_abends', arguments: {} });
    assert.equal(denied.isError, true);
    assert.match(denied.content[0].text, /FORBIDDEN/);

    // The permitted tool passes policy and fails later, on configuration.
    const permitted = await client.callTool({ name: 'list_db2_subsystems', arguments: {} });
    assert.doesNotMatch(permitted.content[0].text, /FORBIDDEN/);
});

test('local abend lookup works end-to-end through the MCP contract', async (t) => {
    const client = await connect(t, {});

    const known = await client.callTool({ name: 'lookup_abend_code', arguments: { code: '0C7' } });
    assert.equal(known.isError, undefined);
    assert.match(known.content[0].text, /S0C7/);
    assert.match(known.content[0].text, /Remediation|Fix:/);

    const wrongCategory = await client.callTool({
        name: 'lookup_abend_code',
        arguments: { code: 'S0C7', category: 'user' },
    });
    assert.match(wrongCategory.content[0].text, /system code, not a user code/);

    const unknown = await client.callTool({
        name: 'lookup_abend_code',
        arguments: { code: 'ZZZZ' },
    });
    assert.match(unknown.content[0].text, /No reference entry/);

    const catalog = await client.callTool({
        name: 'lookup_abend_code',
        arguments: { search: 'storage', category: 'system' },
    });
    assert.match(catalog.content[0].text, /Abend Code Reference/);
});

test('security posture reports risky defaults through the MCP contract', async (t) => {
    const client = await connect(t, {});
    const result = await client.callTool({ name: 'security_posture_summary', arguments: {} });

    assert.equal(result.isError, undefined);
    assert.match(result.content[0].text, /Security Posture Summary/);
    assert.match(result.content[0].text, /Audit logging/);
    assert.match(result.content[0].text, /WRITE-TOOL REGISTRY/);
    assert.match(result.content[0].text, /WARNING|CRITICAL/);

    const hardenedClient = await connect(t, {
        readOnly: 'true',
        allowedTools:
            'list_jobs,list_datasets,read_dataset,list_uss_directory,read_uss_file,lookup_abend_code,security_posture_summary',
        blockedTools:
            'submit_jcl,delete_dataset,write_dataset,delete_uss_file,write_uss_file,create_dataset',
        allowedDatasetPatterns: 'DEV.*,TEST.*,QA.*,SANDBOX.*',
        allowedUssPaths: '/u/dev,/u/test,/u/qa,/tmp/sandbox',
    });
    const hardened = await hardenedClient.callTool({
        name: 'security_posture_summary',
        arguments: {},
    });
    assert.match(hardened.content[0].text, /read-only/);
    assert.match(hardened.content[0].text, /7 tools configured/);
    assert.match(hardened.content[0].text, /6 tools blocked/);
});
