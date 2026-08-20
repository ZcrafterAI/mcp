/**
 * Builds the MCP server.
 *
 * One job: create the server, give every tool the things it needs (a z/OSMF
 * session, the validated config, a logger), and attach them. How the server
 * talks to the AI client afterwards is the transport layer's problem.
 */
import type { Logger } from 'pino';
import type { AppConfig } from './config/schema.js';
import type { ToolContext } from './types/tools.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createSession } from './zowe/session.js';
import { TOOL_GROUPS } from './tools/registry.js';

/** Create the MCP server with every tool registered and ready to serve. */
export function buildServer(config: AppConfig, logger: Logger): McpServer {
    const server = new McpServer(
        { name: config.mcp.name, version: config.mcp.version },
        { capabilities: { tools: {}, logging: {} } },
    );

    const ctx: ToolContext = {
        session: createSession(config),
        config,
        logger,
    };

    let total = 0;
    for (const group of TOOL_GROUPS) {
        for (const tool of group.tools) {
            tool.register(server, ctx);
        }
        total += group.tools.length;
        logger.debug({ group: group.id, tools: group.tools.length }, `Registered ${group.title}`);
    }

    logger.info({ groups: TOOL_GROUPS.length, tools: total }, 'Tools registered');
    return server;
}
