#!/usr/bin/env node
/**
 * Entry point.
 *
 * Loads configuration, initializes logging, builds the MCP server with every
 * tool registered, and connects the configured transport. Failures during
 * startup exit non-zero with a clear message on stderr.
 */
import { loadConfig } from './config/index.js';
import { createLogger } from './utils/logger.js';
import { buildServer, startSse, startStdio } from './server.js';
async function main() {
    const config = loadConfig();
    const logger = createLogger({ level: config.logLevel, name: config.mcp.name });
    logger.info({ transport: config.mcp.transport, version: config.mcp.version }, 'Starting mainframe-mcp-server');
    const server = buildServer(config, logger);
    const shutdown = async (signal: string) => {
        logger.info({ signal }, 'Shutting down');
        try {
            await server.close();
        }
        finally {
            process.exit(0);
        }
    };
    process.on('SIGINT', () => void shutdown('SIGINT'));
    process.on('SIGTERM', () => void shutdown('SIGTERM'));
    if (config.mcp.transport === 'sse') {
        await startSse(server, config, logger);
    }
    else {
        await startStdio(server, logger);
    }
}
main().catch((err) => {
    // Logger may not exist yet if config failed; write directly to stderr.
    process.stderr.write(`[mainframe-mcp-server] fatal: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
});
