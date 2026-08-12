/**
 * Profile resolution.
 *
 * Translates the validated {@link AppConfig} into the `ISession` shape the Zowe
 * SDK expects. Supports both basic (user/password) and token-based auth.
 */
import type { ISession } from '@zowe/imperative';
import type { AppConfig } from '../config/schema.js';
import { ConfigError } from '../utils/errors.js';
/** Build the Zowe session configuration from app config. */
export function resolveSessionConfig(config: AppConfig): ISession {
    const { zosmf } = config;
    const base = {
        hostname: zosmf.host,
        port: zosmf.port,
        protocol: 'https' as const,
        rejectUnauthorized: zosmf.rejectUnauthorized,
        basePath: zosmf.basePath,
    };
    if (zosmf.token) {
        return {
            ...base,
            type: 'token',
            tokenType: zosmf.tokenType ?? 'LTPA2',
            tokenValue: zosmf.token,
        };
    }
    if (zosmf.user && zosmf.password) {
        return {
            ...base,
            type: 'basic',
            user: zosmf.user,
            password: zosmf.password,
        };
    }
    // Should be unreachable: config schema enforces one auth method.
    throw new ConfigError('No usable z/OSMF authentication method was resolved.');
}
/** A redacted summary of the connection, safe for logging. */
export function describeConnection(config: AppConfig): Record<string, unknown> {
    const { zosmf } = config;
    return {
        host: zosmf.host,
        port: zosmf.port,
        auth: zosmf.token ? 'token' : 'basic',
        user: zosmf.user ? `${zosmf.user.slice(0, 2)}***` : undefined,
        rejectUnauthorized: zosmf.rejectUnauthorized,
    };
}
