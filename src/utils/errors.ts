/**
 * Custom error classes and MCP error mapping.
 *
 * Tool handlers should `throw` these typed errors; {@link toToolErrorResult}
 * converts any thrown value into a safe, AI-friendly MCP text result without
 * leaking stack traces or credentials.
 */
import type { TextToolResult } from '../types/tools.js';
/** Base class for all errors raised by this server. */
export class MainframeMcpError extends Error {
    /** Stable, machine-readable error code. */
    readonly code: string;
    /** Optional structured details safe to surface to the caller. */
    readonly details?: Record<string, unknown>;
    constructor(message: string, code: string = 'MAINFRAME_ERROR', details?: Record<string, unknown>) {
        super(message);
        this.name = this.constructor.name;
        this.code = code;
        this.details = details;
    }
}
/** Configuration is missing or invalid. */
export class ConfigError extends MainframeMcpError {
    constructor(message: string, details?: Record<string, unknown>) {
        super(message, 'CONFIG_ERROR', details);
    }
}
/** A connectivity or authentication failure talking to z/OSMF. */
export class ConnectionError extends MainframeMcpError {
    constructor(message: string, details?: Record<string, unknown>) {
        super(message, 'CONNECTION_ERROR', details);
    }
}
/** The requested z/OS resource (job, dataset, file) was not found. */
export class NotFoundError extends MainframeMcpError {
    constructor(message: string, details?: Record<string, unknown>) {
        super(message, 'NOT_FOUND', details);
    }
}
/** Tool input failed validation. */
export class ValidationError extends MainframeMcpError {
    constructor(message: string, details?: Record<string, unknown>) {
        super(message, 'VALIDATION_ERROR', details);
    }
}
/** A safety limit (line caps, spool-file caps, etc.) was exceeded. */
export class LimitExceededError extends MainframeMcpError {
    constructor(message: string, details?: Record<string, unknown>) {
        super(message, 'LIMIT_EXCEEDED', details);
    }
}
/** Operation blocked by enterprise security policy. */
export class ForbiddenError extends MainframeMcpError {
    constructor(message: string, details?: Record<string, unknown>) {
        super(message, 'FORBIDDEN', details);
    }
}
/** Wrap an unknown thrown value into a {@link MainframeMcpError}. */
export function normalizeError(err: unknown): MainframeMcpError {
    if (err instanceof MainframeMcpError)
        return err;
    if (err instanceof Error) {
        // Zowe ImperativeError exposes useful diagnostic fields; surface the message only.
        const maybeImperative = err as { mDetails?: { msg?: string } };
        const message = maybeImperative.mDetails?.msg ?? err.message;
        const lower = message.toLowerCase();
        if (/401|403|unauthorized|authentication failed|invalid credentials|forbidden/i.test(message)) {
            return new ConnectionError('z/OSMF authentication failed. Verify ZOSMF_USER/ZOSMF_PASSWORD or ZOSMF_TOKEN.', { cause: message });
        }
        if (/econnrefused|enotfound|etimedout|timeout|certificate|self signed|unable to verify/i.test(lower)) {
            return new ConnectionError('Unable to reach z/OSMF. Check ZOSMF_HOST, ZOSMF_PORT, VPN/network, and TLS settings.', { cause: message });
        }
        return new MainframeMcpError(message, 'UNEXPECTED_ERROR');
    }
    return new MainframeMcpError(String(err), 'UNEXPECTED_ERROR');
}
/**
 * Convert any thrown value into a standard MCP error result. The text is shaped
 * for an AI agent: a clear one-line summary plus the stable error code.
 */
export function toToolErrorResult(err: unknown): TextToolResult {
    const normalized = normalizeError(err);
    const lines = [`Error [${normalized.code}]: ${normalized.message}`];
    if (normalized.details && Object.keys(normalized.details).length > 0) {
        lines.push('', 'Details:');
        for (const [key, value] of Object.entries(normalized.details)) {
            lines.push(`  ${key}: ${String(value)}`);
        }
    }
    return {
        content: [{ type: 'text', text: lines.join('\n') }],
        isError: true,
    };
}
/**
 * Wrap an async tool handler so any thrown error becomes a clean MCP error
 * result instead of crashing the server. Keeps every tool's body free of
 * boilerplate try/catch.
 */
export function safeHandler<TArgs>(handler: (args: TArgs) => Promise<TextToolResult>): (args: TArgs) => Promise<TextToolResult> {
    return async (args) => {
        try {
            return await handler(args);
        }
        catch (err) {
            return toToolErrorResult(err);
        }
    };
}
