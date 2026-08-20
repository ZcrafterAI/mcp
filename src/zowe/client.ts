/**
 * Zowe session factory.
 *
 * Creates an authenticated z/OSMF {@link Session} for each validated config.
 * The session is lazy and connectionless until a tool issues a REST
 * call, so creation here cannot fail on a bad host — that surfaces on first use
 * and is mapped to a {@link ConnectionError} by the tool layer.
 */
import type { AppConfig } from '../config/schema.js';
import { Session } from '@zowe/imperative';
import { childLogger } from '../utils/logger.js';
import { ConnectionError } from '../utils/errors.js';
import { describeConnection, resolveSessionConfig } from './profiles.js';
let sessions = new WeakMap<AppConfig, Session>();
/** Create (or return the cached) z/OSMF session for this config. */
export function createSession(config: AppConfig): Session {
    const cached = sessions.get(config);
    if (cached)
        return cached;
    const log = childLogger('zowe');
    const sessionConfig = resolveSessionConfig(config);
    try {
        const session = new Session(sessionConfig);
        sessions.set(config, session);
    }
    catch (err) {
        throw new ConnectionError('Failed to create z/OSMF session.', {
            cause: err instanceof Error ? err.message : String(err),
        });
    }
    log.info(describeConnection(config), 'z/OSMF session initialized');
    if (!config.zosmf.rejectUnauthorized) {
        log.warn('TLS certificate verification is DISABLED (ZOSMF_REJECT_UNAUTHORIZED=false).');
    }
    return sessions.get(config)!;
}
/** Reset the cached session (primarily for tests). */
export function resetSession(): void {
    sessions = new WeakMap<AppConfig, Session>();
}
