/**
 * Server-sent-events transport — for clients that connect over HTTP.
 *
 * Exposes three routes:
 *   GET  /sse       open an event stream (one per client session)
 *   POST /messages  send a request into an open session
 *   GET  /health    liveness probe
 *
 * There is no authentication here on purpose. If you expose this beyond
 * localhost, put an authenticating proxy in front of it.
 */
import type { Logger } from 'pino';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppConfig } from '../config/schema.js';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createServer as createHttpServer } from 'node:http';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';

/** Start the HTTP listener and serve MCP over SSE. */
export async function startSse(
    server: McpServer,
    config: AppConfig,
    logger: Logger,
): Promise<void> {
    const { ssePort } = config.mcp;
    const sessions = new Map<string, SSEServerTransport>();

    const httpServer = createHttpServer((req, res) => {
        // Node's handler is synchronous, so a rejected route would otherwise
        // become an unhandled rejection and take the process down.
        route(req, res).catch((err: unknown) => {
            logger.error({ err, url: req.url }, 'SSE request failed');
            if (!res.headersSent) res.writeHead(500);
            res.end();
        });
    });

    async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const url = new URL(req.url ?? '/', `http://localhost:${ssePort}`);

        if (req.method === 'GET' && url.pathname === '/sse') {
            const transport = new SSEServerTransport('/messages', res);
            sessions.set(transport.sessionId, transport);
            res.on('close', () => sessions.delete(transport.sessionId));
            await server.connect(transport);
            return;
        }

        if (req.method === 'POST' && url.pathname === '/messages') {
            const transport = sessions.get(url.searchParams.get('sessionId') ?? '');
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
    }

    await new Promise<void>((resolve) => httpServer.listen(ssePort, () => resolve()));
    logger.info({ port: ssePort, sse: '/sse', messages: '/messages' }, 'Listening (SSE transport)');
}
