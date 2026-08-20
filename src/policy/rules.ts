/**
 * The guardrails.
 *
 * Every rule here answers one question: may this call proceed? They run before
 * a tool does any work, and they only ever narrow what the caller's mainframe
 * credentials already permit — RACF and z/OSMF still make the final decision.
 */
import type { AppConfig } from '../config/schema.js';
import type { ToolContext } from '../types/tools.js';
import { ForbiddenError } from '../utils/errors.js';
import { globToRegExp } from '../utils/glob.js';

/** How a tool call ended. */
export type AuditOutcome = 'success' | 'error' | 'blocked';

/** Whether an audit record was written before or after the call ran. */
export type AuditPhase = 'started' | 'finished';

/**
 * Tools that change something on the mainframe, refused when
 * `SECURITY_READ_ONLY=true`.
 *
 * Names are listed here ahead of the tools existing, so read-only mode covers
 * a new write tool from the moment it is added. Add the name here in the same
 * change that adds the tool.
 */
export const WRITE_TOOLS: Set<string> = new Set([
    'submit_jcl',
    'delete_dataset',
    'delete_dataset_member',
    'write_dataset',
    'write_dataset_member',
    'create_dataset',
    'rename_dataset',
    'delete_uss_file',
    'write_uss_file',
    'create_uss_directory',
    'change_uss_permissions',
]);
/** Settings that hold lists arrive as one comma-separated string. */
function parseCsv(value?: string): string[] {
    return (
        value
            ?.split(',')
            .map((entry) => entry.trim())
            .filter(Boolean) ?? []
    );
}
export function assertToolAllowed(config: AppConfig, toolName: string): void {
    const blocked = parseCsv(config.security.blockedTools);
    if (blocked.includes(toolName)) {
        throw new ForbiddenError(
            `Tool "${toolName}" is blocked by server policy (SECURITY_BLOCKED_TOOLS).`,
            { toolName },
        );
    }
    const allowed = parseCsv(config.security.allowedTools);
    if (allowed.length > 0 && !allowed.includes(toolName)) {
        throw new ForbiddenError(
            `Tool "${toolName}" is not in the server's allowed tool list (SECURITY_ALLOWED_TOOLS).`,
            { toolName },
        );
    }
}
export function assertWriteAllowed(config: AppConfig, toolName: string): void {
    if (config.security.readOnly && WRITE_TOOLS.has(toolName)) {
        throw new ForbiddenError(
            `Tool "${toolName}" is a write operation and the server is running in read-only mode (SECURITY_READ_ONLY=true).`,
            { toolName },
        );
    }
}
function normalizeDatasetName(dsn: string): string {
    return dsn
        .trim()
        .toUpperCase()
        .replace(/^\.+|\.+$/g, '');
}
export function assertDatasetAllowed(config: AppConfig, dsn: string): void {
    const patterns = parseCsv(config.security.allowedDatasetPatterns);
    if (patterns.length === 0) return;
    const upper = normalizeDatasetName(dsn);
    const permitted = patterns.some((pattern) => globToRegExp(pattern.toUpperCase()).test(upper));
    if (!permitted) {
        throw new ForbiddenError(
            `Dataset "${dsn}" is outside the allowed dataset patterns (SECURITY_ALLOWED_DATASET_PATTERNS).`,
            { dsn },
        );
    }
}
function normalizeUssPath(rawPath: string): string {
    const segments: string[] = [];
    for (const segment of rawPath.split('/')) {
        if (segment === '' || segment === '.') continue;
        if (segment === '..') {
            segments.pop();
        } else {
            segments.push(segment);
        }
    }
    return '/' + segments.join('/');
}
export function assertUssPathAllowed(config: AppConfig, path: string): void {
    const prefixes = parseCsv(config.security.allowedUssPaths);
    if (prefixes.length === 0) return;
    const normalized = normalizeUssPath(path.trim());
    const permitted = prefixes.some((prefix) => {
        const normalizedPrefix = normalizeUssPath(prefix.trim());
        // Require the normalized path to start with the prefix followed by '/' or be an exact match,
        // so '/u/userdev' does not accidentally permit '/u/userdev2'.
        return normalized === normalizedPrefix || normalized.startsWith(normalizedPrefix + '/');
    });
    if (!permitted) {
        throw new ForbiddenError(
            `USS path "${path}" is outside the allowed USS path prefixes (SECURITY_ALLOWED_USS_PATHS).`,
            { path },
        );
    }
}
export function assertJclSizeAllowed(config: AppConfig, jcl: string): void {
    const bytes = Buffer.byteLength(jcl, 'utf8');
    if (bytes > config.security.maxJclBytes) {
        throw new ForbiddenError(
            `JCL payload (${bytes} bytes) exceeds the server limit of ${config.security.maxJclBytes} bytes (SECURITY_MAX_JCL_BYTES).`,
            { bytes, limit: config.security.maxJclBytes },
        );
    }
}
const SENSITIVE_KEY_PATTERN =
    /password|token|secret|credential|apikey|api_key|auth|passphrase|private/i;
export function redactArgs(args: unknown): unknown {
    if (Array.isArray(args)) {
        return args.map(redactArgs);
    }
    if (args !== null && typeof args === 'object') {
        const out: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(args)) {
            if (SENSITIVE_KEY_PATTERN.test(key)) {
                out[key] = '[REDACTED]';
            } else if (key === 'jcl' && typeof value === 'string') {
                out[key] = `[JCL ${Buffer.byteLength(value, 'utf8')} bytes]`;
            } else {
                out[key] = redactArgs(value);
            }
        }
        return out;
    }
    return args;
}
/** Options describing a single audit record. */
export interface AuditDetails {
    phase: AuditPhase;
    outcome?: AuditOutcome;
    durationMs?: number;
    errorCode?: string;
}

/**
 * Write one audit record for a tool call. Arguments are redacted first, so
 * credentials and JCL bodies never reach the log.
 */
export function auditToolCall(
    ctx: ToolContext,
    toolName: string,
    args: Record<string, unknown>,
    details: AuditDetails,
): void {
    if (!ctx.config.security.auditLogging) return;
    ctx.logger.info(
        {
            audit: true,
            tool: toolName,
            phase: details.phase,
            user: ctx.config.zosmf.user ?? '(token-auth)',
            host: ctx.config.zosmf.host,
            args: redactArgs(args),
            ...(details.outcome !== undefined && { outcome: details.outcome }),
            ...(details.durationMs !== undefined && { durationMs: details.durationMs }),
            ...(details.errorCode !== undefined && { errorCode: details.errorCode }),
        },
        'MCP tool invocation',
    );
}
/**
 * Run every applicable policy check for one tool call.
 * Throws {@link ForbiddenError} on the first violation; returns silently when
 * the call is permitted.
 */
export function enforceSecurity(
    ctx: ToolContext,
    toolName: string,
    resources?: {
        dataset?: string;
        ussPath?: string;
    },
): void {
    assertToolAllowed(ctx.config, toolName);
    assertWriteAllowed(ctx.config, toolName);
    if (resources?.dataset) assertDatasetAllowed(ctx.config, resources.dataset);
    if (resources?.ussPath) assertUssPathAllowed(ctx.config, resources.ussPath);
}
