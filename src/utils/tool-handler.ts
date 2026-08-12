/**
 * Secure MCP tool handler wrapper.
 *
 * Wraps every tool handler with:
 *   1. Pre-execution security checks (tool allowlist, read-only, resource boundaries)
 *   2. Pre-execution audit log entry
 *   3. Handler execution
 *   4. Post-execution audit log entry with outcome and duration
 *   5. Safe error conversion so no uncaught exception crashes the server
 */
import type { ToolContext } from '../types/tools.js';
import type { TextToolResult } from '../types/tools.js';
import { toToolErrorResult } from './errors.js';
import { auditToolCall, enforceSecurity } from './security.js';
import { ForbiddenError } from './errors.js';
/**
 * Wrap a tool handler with enterprise security checks, pre/post audit
 * logging, and safe error conversion.
 *
 * @param ctx - Tool context (session, config, logger)
 * @param toolName - Stable tool identifier used in audit records
 * @param handler - The async tool implementation
 * @param resources - Optional function to extract resource references (dataset
 *   DSN, USS path) from the parsed args for boundary enforcement
 */
export function securedHandler<T extends Record<string, unknown>>(ctx: ToolContext, toolName: string, handler: (args: T) => Promise<TextToolResult>, resources?: (args: T) => {
    dataset?: string;
    ussPath?: string;
}): (args: T) => Promise<TextToolResult> {
    return async (args) => {
        const start = Date.now();
        // 1. Security gate (throws ForbiddenError on violation — caught below)
        try {
            enforceSecurity(ctx, toolName, args, resources?.(args));
        }
        catch (err) {
            if (err instanceof ForbiddenError) {
                // Emit a blocked audit record before surfacing the error
                auditToolCall(ctx, toolName, args, {
                    outcome: 'blocked',
                    durationMs: Date.now() - start,
                    errorCode: err.code,
                });
            }
            return toToolErrorResult(err);
        }
        // 2. Handler execution with post-call audit
        try {
            const result = await handler(args);
            const durationMs = Date.now() - start;
            // Treat MCP error results (isError=true) as an error outcome
            const outcome = result.isError ? 'error' : 'success';
            auditToolCall(ctx, toolName, args, { outcome, durationMs });
            return result;
        }
        catch (err) {
            const durationMs = Date.now() - start;
            const errorResult = toToolErrorResult(err);
            auditToolCall(ctx, toolName, args, {
                outcome: 'error',
                durationMs,
            });
            return errorResult;
        }
    };
}
