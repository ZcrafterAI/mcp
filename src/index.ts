#!/usr/bin/env node
/**
 * Start here.
 *
 * Reads configuration from the environment, builds the server with every tool
 * attached, and connects it to the AI client. A bad configuration exits
 * non-zero with a message explaining what to fix.
 */
import { loadConfig } from './config/index.js';
import { createLogger } from './utils/logger.js';
import { buildServer } from './server.js';
import { startStdio } from './transport/stdio.js';
import { startSse } from './transport/sse.js';

async function main(): Promise<void> {
    const config = loadConfig();
    const logger = createLogger({ level: config.logLevel, name: config.mcp.name });
    logger.info(
        { transport: config.mcp.transport, version: config.mcp.version },
        `Starting ${config.mcp.name}`,
    );

    const server = buildServer(config, logger);

    const shutdown = async (signal: string): Promise<void> => {
        logger.info({ signal }, 'Shutting down');
        try {
            await server.close();
        } finally {
            process.exit(0);
        }
    };
    process.on('SIGINT', () => void shutdown('SIGINT'));
    process.on('SIGTERM', () => void shutdown('SIGTERM'));

    if (config.mcp.transport === 'sse') {
        await startSse(server, config, logger);
    } else {
        await startStdio(server, logger);
    }
}

main().catch((err: unknown) => {
    // The logger may not exist yet if config failed, so write straight to stderr.
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[mcp] fatal: ${message}\n`);
    process.exit(1);
});
