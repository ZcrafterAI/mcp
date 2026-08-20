/**
 * The single way a tool is declared in this codebase.
 *
 * `defineTool` takes a plain description of a tool — its name, what it does,
 * its inputs, and the function that runs it — and returns an object that knows
 * how to register itself with the MCP server. Everything cross-cutting
 * (security policy, audit logging, error handling) is applied here, so a tool
 * file only ever contains the logic that is unique to that tool.
 */
import type { McpServer, ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import type {
    ShapeOutput,
    ZodRawShapeCompat,
} from '@modelcontextprotocol/sdk/server/zod-compat.js';
import type { TextToolResult, ToolContext } from '../types/tools.js';
import { guard } from '../policy/guard.js';

/** The `{ field: zodSchema }` object describing a tool's inputs. */
export type ToolInputShape = ZodRawShapeCompat;

/** The parsed, validated arguments handed to a tool's `run` function. */
export type ToolArgs<Shape extends ToolInputShape> = ShapeOutput<Shape>;

/**
 * z/OS resources a call is about, pulled out of the arguments so the security
 * layer can check them against the configured boundaries before the tool runs.
 */
export interface ToolResourceRefs {
    /** Dataset name the call will touch. */
    dataset?: string;
    /** USS path the call will touch. */
    ussPath?: string;
}

/** Everything needed to declare one tool. */
export interface ToolSpec<Shape extends ToolInputShape> {
    /** Stable tool id exposed over MCP, e.g. `list_jobs`. */
    name: string;
    /** One or two sentences telling an AI agent when to reach for this tool. */
    description: string;
    /** Input fields, each a zod schema with a `.describe()` explanation. */
    input: Shape;
    /** Optional: point the security layer at the resources this call touches. */
    resources?: (args: ToolArgs<Shape>) => ToolResourceRefs;
    /**
     * The tool's actual work. Throw a typed error to fail; never catch here.
     * May be synchronous when the tool answers from local data alone.
     */
    run: (args: ToolArgs<Shape>, ctx: ToolContext) => TextToolResult | Promise<TextToolResult>;
}

/** A declared tool, ready to be attached to a server. */
export interface Tool {
    readonly name: string;
    register(server: McpServer, ctx: ToolContext): void;
}

/**
 * Declare a tool. The generic parameter is inferred from `input`, so `run`
 * receives fully-typed arguments with no casting.
 */
export function defineTool<Shape extends ToolInputShape>(spec: ToolSpec<Shape>): Tool {
    return {
        name: spec.name,
        register(server, ctx) {
            // The SDK describes its callback with a conditional type that
            // TypeScript cannot resolve while `Shape` is still generic. The
            // shapes do line up, and this is the only place a handler is ever
            // attached, so the assertion is contained to this one line.
            const handler = guard(ctx, spec) as unknown as ToolCallback<Shape>;
            server.tool(spec.name, spec.description, spec.input, handler);
        },
    };
}
