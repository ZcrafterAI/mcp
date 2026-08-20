/**
 * The two types every tool touches.
 */
import type { Session } from '@zowe/imperative';
import type { Logger } from 'pino';
import type { AppConfig } from '../config/schema.js';

/** What a tool is handed when it runs. */
export interface ToolContext {
    /** Authenticated z/OSMF session. */
    session: Session;
    /** Validated configuration. */
    config: AppConfig;
    /** Logger, already scoped to this server. */
    logger: Logger;
}

/**
 * What a tool returns: text for the AI agent to read. `isError` marks a
 * failure the agent should react to rather than treat as an answer.
 */
export interface TextToolResult {
    content: Array<{ type: 'text'; text: string }>;
    isError?: boolean;
    /** Required so this satisfies the MCP SDK's open result type. */
    [key: string]: unknown;
}
