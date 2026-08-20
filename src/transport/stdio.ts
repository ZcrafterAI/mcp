/**
 * Standard input/output transport — the default.
 *
 * The AI client launches this server as a child process and speaks JSON-RPC
 * over its stdin/stdout. Nothing else may be written to stdout, which is why
 * all logging goes to stderr (see `utils/logger.ts`).
 */
import type { Logger } from 'pino';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

/** Serve over stdio until the process exits. */
export async function startStdio(server: McpServer, logger: Logger): Promise<void> {
    await server.connect(new StdioServerTransport());
    logger.info('Connected over stdio');
}
