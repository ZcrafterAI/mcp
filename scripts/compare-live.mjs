#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const TOOL_CASES = [
    { name: 'list_datasets', args: (o) => ({ hlq: o.hlq, maxResults: 100 }) },
    { name: 'read_dataset', args: (o) => ({ dsn: o.dataset, member: o.member, maxLines: 200 }) },
    { name: 'list_jobs', args: (o) => ({ owner: o.owner, maxResults: 50 }) },
];

function usage() {
    console.log(`Live MCP master-vs-candidate comparison

Usage:
  npm run benchmark:live -- --baseline PATH [options]

Required:
  --baseline PATH      Built baseline entry point (for example master/dist/index.js)

Options:
  --candidate PATH     Built candidate entry point (default: ./dist/index.js)
  --runs NUMBER        Timed attempts per tool (default: 5)
  --warmups NUMBER     Untimed warmups per tool (default: 1)
  --hlq VALUE          Dataset high-level qualifier (default: ZOSMF_USER)
  --dataset VALUE      Dataset used for the read test
  --member VALUE       Optional member used for the read test
  --owner VALUE        Job owner (default: ZOSMF_USER)
  --help               Show this help

The process inherits your existing ZOSMF_* environment variables. Secrets are
never printed. This runner performs read-only operations only.`);
}

function parseArgs(argv) {
    const values = {};
    for (let i = 0; i < argv.length; i += 1) {
        const token = argv[i];
        if (token === '--help') {
            values.help = true;
            continue;
        }
        if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
        const value = argv[i + 1];
        if (!value || value.startsWith('--')) throw new Error(`Missing value for ${token}`);
        values[token.slice(2)] = value;
        i += 1;
    }
    return values;
}

function positiveInteger(value, fallback, label) {
    if (value === undefined) return fallback;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0 || (label === 'runs' && parsed < 1)) {
        throw new Error(`${label} must be ${label === 'runs' ? 'at least 1' : '0 or greater'}`);
    }
    return parsed;
}

function resolveEntry(value, label) {
    if (!value) throw new Error(`${label} is required`);
    const entry = path.resolve(value);
    if (!fs.existsSync(entry)) throw new Error(`${label} does not exist: ${entry}`);
    return entry;
}

function inheritedEnvironment() {
    return Object.fromEntries(
        Object.entries(process.env).filter(([, value]) => typeof value === 'string'),
    );
}

function secretValues() {
    return [process.env.ZOSMF_PASSWORD, process.env.ZOSMF_TOKEN].filter(
        (value) => typeof value === 'string' && value.length > 0,
    );
}

function redact(value) {
    let safe = String(value ?? '');
    for (const secret of secretValues()) safe = safe.split(secret).join('[REDACTED]');
    return safe
        .replace(/(password|token|authorization)(\s*[=:]\s*)[^\s,;]+/gi, '$1$2[REDACTED]')
        .slice(0, 500);
}

function resultText(result) {
    const text = (result.content ?? [])
        .filter((item) => item.type === 'text')
        .map((item) => item.text)
        .join('\n');
    if (text) return text;
    return result.structuredContent ? JSON.stringify(result.structuredContent) : '';
}

async function openServer(label, entry) {
    const client = new Client({ name: `zcrafter-live-comparator-${label}`, version: '1.0.0' });
    const transport = new StdioClientTransport({
        command: process.execPath,
        args: [entry],
        env: inheritedEnvironment(),
        stderr: 'pipe',
    });
    await client.connect(transport);
    return { label, entry, client };
}

async function timedCall(server, name, args) {
    const started = performance.now();
    try {
        const result = await server.client.callTool({ name, arguments: args });
        const text = resultText(result);
        if (result.isError) throw new Error(text || `${name} returned an error`);
        return { ok: true, ms: performance.now() - started, text };
    } catch (error) {
        return {
            ok: false,
            ms: performance.now() - started,
            error: redact(error?.message ?? error),
        };
    }
}

async function pairedCalls(servers, name, args, runs, warmups) {
    for (let i = 0; i < warmups; i += 1) {
        for (const server of i % 2 === 0 ? servers : [...servers].reverse()) {
            await timedCall(server, name, args);
        }
    }

    const samples = Object.fromEntries(servers.map((server) => [server.label, []]));
    for (let i = 0; i < runs; i += 1) {
        const order = i % 2 === 0 ? servers : [...servers].reverse();
        for (const server of order) samples[server.label].push(await timedCall(server, name, args));
    }
    return samples;
}

function percentile(values, fraction) {
    if (values.length === 0) return Number.NaN;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

function stats(samples) {
    const successes = samples.filter((sample) => sample.ok);
    const values = successes.map((sample) => sample.ms);
    return {
        failures: samples.length - successes.length,
        median: percentile(values, 0.5),
        p95: percentile(values, 0.95),
        average: values.length
            ? values.reduce((sum, value) => sum + value, 0) / values.length
            : Number.NaN,
    };
}

function formatMs(value) {
    return Number.isFinite(value) ? `${value.toFixed(0)} ms` : 'n/a';
}

function datasetNames(text) {
    return [
        ...new Set(
            text
                .toUpperCase()
                .match(/\b[A-Z$#@][A-Z0-9$#@-]{0,7}(?:\.[A-Z$#@][A-Z0-9$#@-]{0,7})+\b/g) ?? [],
        ),
    ].sort();
}

function normalizedContent(text) {
    return text.replace(/\r\n/g, '\n').trim();
}

function correctness(name, baseline, candidate, options) {
    const b = baseline.find((sample) => sample.ok);
    const c = candidate.find((sample) => sample.ok);
    if (!b || !c) return { pass: false, note: 'one or both versions failed' };

    if (name === 'list_datasets') {
        const baselineNames = datasetNames(b.text);
        const candidateNames = datasetNames(c.text);
        const expected = options.dataset.toUpperCase();
        const same = JSON.stringify(baselineNames) === JSON.stringify(candidateNames);
        return {
            pass: same && candidateNames.includes(expected),
            note: same ? `${candidateNames.length} matching names` : 'dataset lists differ',
        };
    }
    if (name === 'read_dataset') {
        const baselineText = normalizedContent(b.text);
        const candidateText = normalizedContent(c.text);
        return {
            pass: candidateText.length > 0 && candidateText === baselineText,
            note: candidateText === baselineText ? 'content matches' : 'content differs',
        };
    }
    return { pass: normalizedContent(c.text).length > 0, note: 'request completed' };
}

function delta(candidate, baseline) {
    if (!Number.isFinite(candidate) || !Number.isFinite(baseline) || baseline === 0) return 'n/a';
    const percent = ((candidate - baseline) / baseline) * 100;
    return `${percent > 0 ? '+' : ''}${percent.toFixed(1)}%`;
}

function printTable(rows) {
    const widths = rows[0].map((_, column) =>
        Math.max(...rows.map((row) => String(row[column]).length)),
    );
    for (const row of rows) {
        console.log(row.map((cell, column) => String(cell).padEnd(widths[column])).join('  '));
    }
}

async function main() {
    const raw = parseArgs(process.argv.slice(2));
    if (raw.help) return usage();

    const user = (process.env.ZOSMF_USER ?? '').toUpperCase();
    const options = {
        baseline: resolveEntry(raw.baseline, '--baseline'),
        candidate: resolveEntry(raw.candidate ?? './dist/index.js', '--candidate'),
        runs: positiveInteger(raw.runs, 5, 'runs'),
        warmups: positiveInteger(raw.warmups, 1, 'warmups'),
        hlq: (raw.hlq ?? user).toUpperCase(),
        dataset: (raw.dataset ?? '').toUpperCase(),
        member: raw.member?.toUpperCase(),
        owner: (raw.owner ?? user).toUpperCase(),
    };
    if (!options.hlq) throw new Error('Provide --hlq or set ZOSMF_USER');
    if (!options.dataset) throw new Error('Provide --dataset for the read correctness test');

    console.log('\nZcrafter MCP live A/B proof (read-only)');
    console.log(`Runs: ${options.runs} timed + ${options.warmups} warmup per operation\n`);

    const servers = [];
    try {
        servers.push(await openServer('baseline', options.baseline));
        servers.push(await openServer('candidate', options.candidate));

        const requiredTools = [...TOOL_CASES.map((test) => test.name), 'verify_zosmf_connection'];
        for (const server of servers) {
            const tools = await server.client.listTools();
            const names = new Set(tools.tools.map((tool) => tool.name));
            const missing = requiredTools.filter((name) => !names.has(name));
            if (missing.length)
                throw new Error(`${server.label} is missing tools: ${missing.join(', ')}`);
        }

        const verify = {};
        for (const server of servers)
            verify[server.label] = await timedCall(server, 'verify_zosmf_connection', {});
        const invalid = {};
        for (const server of servers)
            invalid[server.label] = await timedCall(server, 'list_datasets', {});

        const results = [];
        for (const test of TOOL_CASES) {
            const samples = await pairedCalls(
                servers,
                test.name,
                test.args(options),
                options.runs,
                options.warmups,
            );
            results.push({
                name: test.name,
                samples,
                baseline: stats(samples.baseline),
                candidate: stats(samples.candidate),
                correctness: correctness(test.name, samples.baseline, samples.candidate, options),
            });
        }

        const verifyPass = verify.baseline.ok && verify.candidate.ok;
        const invalidPass = !invalid.baseline.ok && !invalid.candidate.ok;
        console.log('Correctness');
        printTable([
            ['Check', 'Result', 'Evidence'],
            [
                'Both connect',
                verifyPass ? 'PASS' : 'FAIL',
                verifyPass ? 'z/OSMF reachable' : 'connection failure',
            ],
            ...results.map((result) => [
                result.name,
                result.correctness.pass ? 'PASS' : 'FAIL',
                result.correctness.note,
            ]),
            [
                'Invalid input',
                invalidPass ? 'PASS' : 'FAIL',
                invalidPass ? 'both rejected it' : 'one accepted bad input',
            ],
        ]);

        console.log('\nPerformance');
        printTable([
            [
                'Operation',
                'Baseline median',
                'Candidate median',
                'Change',
                'Candidate p95',
                'Failures',
            ],
            ...results.map((result) => [
                result.name,
                formatMs(result.baseline.median),
                formatMs(result.candidate.median),
                delta(result.candidate.median, result.baseline.median),
                formatMs(result.candidate.p95),
                `${result.candidate.failures}/${options.runs}`,
            ]),
        ]);

        const correctnessPass =
            verifyPass && invalidPass && results.every((result) => result.correctness.pass);
        const reliabilityPass = results.every((result) => result.candidate.failures === 0);
        const regressions = results.filter(
            (result) =>
                Number.isFinite(result.candidate.median) &&
                result.candidate.median > result.baseline.median * 1.15,
        );

        console.log(`\nVerdict: ${correctnessPass && reliabilityPass ? 'PASS' : 'FAIL'}`);
        console.log(
            regressions.length
                ? `Performance warning: >15% median regression in ${regressions.map((result) => result.name).join(', ')}.`
                : 'No median performance regression above 15%.',
        );

        if (!correctnessPass || !reliabilityPass) process.exitCode = 1;
    } finally {
        await Promise.allSettled(servers.map((server) => server.client.close()));
    }
}

main().catch((error) => {
    console.error(`Live comparison failed: ${redact(error?.message ?? error)}`);
    process.exitCode = 1;
});
