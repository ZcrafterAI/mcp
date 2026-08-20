import { performance } from 'node:perf_hooks';
import pino from 'pino';
import { configSchema } from '../dist/config/schema.js';
import { buildServer } from '../dist/server.js';
import { mapConcurrent } from '../dist/utils/async.js';

const config = configSchema.parse({
    zosmf: { host: 'benchmark.invalid', user: 'BENCH', password: 'secret' },
    mcp: { name: 'zcrafter-benchmark', version: '0.0.0' },
    limits: {},
    enterprise: {},
    security: { auditLogging: false },
    logLevel: 'silent',
});
const logger = pino({ level: 'silent' });

for (let index = 0; index < 20; index += 1) buildServer(config, logger);

const samples = [];
for (let index = 0; index < 200; index += 1) {
    const start = performance.now();
    buildServer(config, logger);
    samples.push(performance.now() - start);
}
samples.sort((a, b) => a - b);

async function simulatedReads(concurrency) {
    const start = performance.now();
    await mapConcurrent(Array.from({ length: 12 }), concurrency, async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
    });
    return performance.now() - start;
}

const serialMs = await simulatedReads(1);
const boundedMs = await simulatedReads(config.limits.maxConcurrentRequests);
console.log(
    JSON.stringify(
        {
            serverBuild: {
                runs: samples.length,
                medianMs: Number(samples[99].toFixed(3)),
                p95Ms: Number(samples[189].toFixed(3)),
            },
            diagnosticReads: {
                operations: 12,
                concurrency: config.limits.maxConcurrentRequests,
                serialMs: Number(serialMs.toFixed(1)),
                boundedMs: Number(boundedMs.toFixed(1)),
                speedup: Number((serialMs / boundedMs).toFixed(2)),
            },
        },
        null,
        2,
    ),
);
