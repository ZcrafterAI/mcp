/**
 * Shared tool wiring types.
 *
 * Every tool module receives a {@link ToolContext} that bundles the live Zowe
 * session, the validated configuration, and a logger. Tools register
 * themselves against an {@link McpServer} via a `register*Tools` function.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Session } from '@zowe/imperative';
import type { Logger } from 'pino';
import type { AppConfig } from '../config/schema.js';
/** Everything a tool needs at runtime. */
export interface ToolContext {
    /** Authenticated z/OSMF session. */
    session: Session;
    /** Validated application configuration. */
    config: AppConfig;
    /** Scoped logger. */
    logger: Logger;
}
/** Signature shared by every tool-group registration function. */
export type ToolRegistrar = (server: McpServer, ctx: ToolContext) => void;
/**
 * The standard MCP text result shape. Helper for building tool responses.
 */
export interface TextToolResult {
    content: Array<{
        type: 'text';
        text: string;
    }>;
    isError?: boolean;
    /** Index signature required for compatibility with the MCP SDK result type. */
    [key: string]: unknown;
}
