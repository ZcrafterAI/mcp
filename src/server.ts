/**
 * MCP Server bootstrap.
 *
 * Builds the {@link McpServer}, wires up the shared {@link ToolContext}, and
 * registers every tool group. Transport selection (stdio vs SSE) lives here so
 * the entry point stays thin.
 */
import type { Logger } from 'pino';
import type { AppConfig } from './config/schema.js';
import { createServer as createHttpServer } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { createSession } from './zowe/client.js';
import { registerJobTools } from './tools/jobs/index.js';
import { registerDatasetTools } from './tools/datasets/index.js';
import { registerUssTools } from './tools/uss/index.js';
import { registerOperationsTools } from './tools/operations/index.js';
import { registerCicsTools } from './tools/cics/index.js';
import { registerDb2Tools } from './tools/db2/index.js';
import { registerSmfTools } from './tools/smf/index.js';
import { registerSecurityTools } from './tools/security/index.js';
import { registerIntelligenceTools } from './tools/intelligence/index.js';
/** Build the MCP server and register all tools. */
export function buildServer(config: AppConfig, logger: Logger): McpServer {
    const server = new McpServer({ name: config.mcp.name, version: config.mcp.version }, { capabilities: { tools: {}, logging: {} } });
    const ctx = {
        session: createSession(config),
        config,
        logger,
    };
    registerJobTools(server, ctx);
    registerDatasetTools(server, ctx);
    registerUssTools(server, ctx);
    registerOperationsTools(server, ctx);
    registerCicsTools(server, ctx);
    registerDb2Tools(server, ctx);
    registerSmfTools(server, ctx);
    registerSecurityTools(server, ctx);
    registerIntelligenceTools(server, ctx);
    logger.info('All tool groups registered');
    return server;
}
/** Connect the server over stdio (default transport). */
export async function startStdio(server: McpServer, logger: Logger): Promise<void> {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    logger.info('mainframe-mcp-server connected over stdio');
}
/** Connect the server over SSE behind a minimal HTTP listener. */
export async function startSse(server: McpServer, config: AppConfig, logger: Logger): Promise<void> {
    const transports = new Map();
    const httpServer = createHttpServer(async (req, res) => {
        const url = new URL(req.url ?? '/', `http://localhost:${config.mcp.ssePort}`);
        if (req.method === 'GET' && url.pathname === '/sse') {
            const transport = new SSEServerTransport('/messages', res);
            transports.set(transport.sessionId, transport);
            res.on('close', () => transports.delete(transport.sessionId));
            await server.connect(transport);
            return;
        }
        if (req.method === 'POST' && url.pathname === '/messages') {
            const sessionId = url.searchParams.get('sessionId') ?? '';
            const transport = transports.get(sessionId);
            if (!transport) {
                res.writeHead(400).end('Unknown or missing sessionId');
                return;
            }
            await transport.handlePostMessage(req, res);
            return;
        }
        if (req.method === 'GET' && url.pathname === '/health') {
            res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"status":"ok"}');
            return;
        }
        res.writeHead(404).end('Not found');
    });
    await new Promise<void>((resolve) => httpServer.listen(config.mcp.ssePort, () => resolve()));
    logger.info({ port: config.mcp.ssePort, sse: '/sse', messages: '/messages' }, 'mainframe-mcp-server listening (SSE transport)');
}
