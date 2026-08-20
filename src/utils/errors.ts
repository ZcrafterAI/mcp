/**
 * Errors, and how they reach the AI agent.
 *
 * Tools throw one of the typed errors below. The guard around every tool call
 * turns whatever was thrown into a short, readable message with a stable code
 * — never a stack trace, and never anything containing credentials.
 */
import type { TextToolResult } from '../types/tools.js';

/** Base class for every error this server raises deliberately. */
export class MainframeMcpError extends Error {
    /** Stable, machine-readable code, e.g. `NOT_FOUND`. */
    readonly code: string;
    /** Extra context that is safe to show the caller. */
    readonly details?: Record<string, unknown>;

    constructor(message: string, code = 'MAINFRAME_ERROR', details?: Record<string, unknown>) {
        super(message);
        this.name = this.constructor.name;
        this.code = code;
        this.details = details;
    }
}

/** A setting is missing or invalid. */
export class ConfigError extends MainframeMcpError {
    constructor(message: string, details?: Record<string, unknown>) {
        super(message, 'CONFIG_ERROR', details);
    }
}

/** The mainframe could not be reached, or refused the credentials. */
export class ConnectionError extends MainframeMcpError {
    constructor(message: string, details?: Record<string, unknown>) {
        super(message, 'CONNECTION_ERROR', details);
    }
}

/** The requested job, dataset, or file does not exist. */
export class NotFoundError extends MainframeMcpError {
    constructor(message: string, details?: Record<string, unknown>) {
        super(message, 'NOT_FOUND', details);
    }
}

/** The caller's input was not usable. */
export class ValidationError extends MainframeMcpError {
    constructor(message: string, details?: Record<string, unknown>) {
        super(message, 'VALIDATION_ERROR', details);
    }
}

/** A safety limit (line caps, spool-file caps) was reached. */
export class LimitExceededError extends MainframeMcpError {
    constructor(message: string, details?: Record<string, unknown>) {
        super(message, 'LIMIT_EXCEEDED', details);
    }
}

/** Server policy refused the call. See `policy/rules.ts`. */
export class ForbiddenError extends MainframeMcpError {
    constructor(message: string, details?: Record<string, unknown>) {
        super(message, 'FORBIDDEN', details);
    }
}

/** Credentials were rejected — worth saying so plainly rather than "401". */
const AUTH_FAILURE = /401|403|unauthorized|authentication failed|invalid credentials|forbidden/i;

/**
 * The host could not be reached, or TLS did not check out. The last two
 * alternatives are how the Zowe SDK words a transport failure, which is often
 * all the text that reaches us.
 */
const REACHABILITY_FAILURE =
    /econnrefused|enotfound|etimedout|eai_again|getaddrinfo|timeout|certificate|self signed|unable to verify|failed to send an http request|http\(s\) request error/i;

/**
 * Turn anything that was thrown into a {@link MainframeMcpError}, upgrading
 * the two failure modes users hit most into messages that name the setting
 * they need to look at.
 */
export function normalizeError(err: unknown): MainframeMcpError {
    if (err instanceof MainframeMcpError) return err;

    if (err instanceof Error) {
        // Zowe's ImperativeError carries the useful text one level down.
        const imperative = err as { mDetails?: { msg?: string } };
        const message = imperative.mDetails?.msg ?? err.message;

        if (AUTH_FAILURE.test(message)) {
            return new ConnectionError(
                'z/OSMF rejected the credentials. Check ZOSMF_USER and ZOSMF_PASSWORD, or ZOSMF_TOKEN.',
                { cause: message },
            );
        }
        if (REACHABILITY_FAILURE.test(message)) {
            return new ConnectionError(
                'Unable to reach z/OSMF. Check ZOSMF_HOST, ZOSMF_PORT, your network or VPN, and the TLS settings.',
                { cause: message },
            );
        }
        return new MainframeMcpError(message, 'UNEXPECTED_ERROR');
    }

    return new MainframeMcpError(String(err), 'UNEXPECTED_ERROR');
}

/**
 * Render an error as an MCP result: a one-line summary with its code, then any
 * safe details. Shaped for an agent to read and act on.
 */
export function toToolErrorResult(err: unknown): TextToolResult {
    const error = normalizeError(err);
    const lines = [`Error [${error.code}]: ${error.message}`];

    if (error.details && Object.keys(error.details).length > 0) {
        lines.push('', 'Details:');
        for (const [key, value] of Object.entries(error.details)) {
            lines.push(`  ${key}: ${String(value)}`);
        }
    }

    return { content: [{ type: 'text', text: lines.join('\n') }], isError: true };
}
