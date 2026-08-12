/**
 * Zowe session factory.
 *
 * Creates the single authenticated z/OSMF {@link Session} that every tool
 * shares. The session is lazy and connectionless until a tool issues a REST
 * call, so creation here cannot fail on a bad host — that surfaces on first use
 * and is mapped to a {@link ConnectionError} by the tool layer.
 */
import type { AppConfig } from '../config/schema.js';
import { Session } from '@zowe/imperative';
import { childLogger } from '../utils/logger.js';
import { ConnectionError } from '../utils/errors.js';
import { describeConnection, resolveSessionConfig } from './profiles.js';
let sharedSession: Session | undefined;
/** Create (or return the cached) z/OSMF session. */
export function createSession(config: AppConfig): Session {
    if (sharedSession)
        return sharedSession;
    const log = childLogger('zowe');
    const sessionConfig = resolveSessionConfig(config);
    try {
        sharedSession = new Session(sessionConfig);
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
    return sharedSession;
}
/** Reset the cached session (primarily for tests). */
export function resetSession(): void {
    sharedSession = undefined;
}
