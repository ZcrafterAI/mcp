/**
 * The wrapper every tool runs inside.
 *
 * Each call goes through the same four steps, so no individual tool has to
 * remember them:
 *
 *   1. Check the call against server policy (allow/block lists, read-only
 *      mode, dataset and USS boundaries) and refuse it if it is out of bounds.
 *   2. Write a `started` audit record, so a call that hangs still leaves a trace.
 *   3. Run the tool.
 *   4. Write a `finished` audit record with the outcome and how long it took,
 *      converting any thrown error into a readable MCP result rather than
 *      letting it crash the server.
 */
import type { ToolInputShape, ToolSpec } from '../tools/define-tool.js';
import type { TextToolResult, ToolContext } from '../types/tools.js';
import { ForbiddenError, toToolErrorResult } from '../utils/errors.js';
import { auditToolCall, enforceSecurity } from './rules.js';

/**
 * Wrap a tool's `run` function with the security, audit, and error-handling
 * steps described above.
 */
export function guard<Shape extends ToolInputShape>(
    ctx: ToolContext,
    spec: ToolSpec<Shape>,
): (args: Parameters<ToolSpec<Shape>['run']>[0]) => Promise<TextToolResult> {
    return async (args) => {
        const startedAt = Date.now();
        const record = args as Record<string, unknown>;

        try {
            enforceSecurity(ctx, spec.name, spec.resources?.(args));
        } catch (err) {
            if (err instanceof ForbiddenError) {
                auditToolCall(ctx, spec.name, record, {
                    phase: 'finished',
                    outcome: 'blocked',
                    durationMs: Date.now() - startedAt,
                    errorCode: err.code,
                });
            }
            return toToolErrorResult(err);
        }

        auditToolCall(ctx, spec.name, record, { phase: 'started' });

        try {
            const result = await spec.run(args, ctx);
            auditToolCall(ctx, spec.name, record, {
                phase: 'finished',
                // A tool can report failure by returning isError instead of throwing.
                outcome: result.isError ? 'error' : 'success',
                durationMs: Date.now() - startedAt,
            });
            return result;
        } catch (err) {
            const errorResult = toToolErrorResult(err);
            auditToolCall(ctx, spec.name, record, {
                phase: 'finished',
                outcome: 'error',
                durationMs: Date.now() - startedAt,
            });
            return errorResult;
        }
    };
}
