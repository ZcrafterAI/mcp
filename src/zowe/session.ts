/**
 * Connections to the mainframe.
 *
 * Every mainframe call goes through a Zowe `Session`, which bundles the host,
 * port, TLS setting, and credentials. There are three places we talk to:
 *
 *   zosmf  z/OSMF — jobs, datasets, Unix files, performance records
 *   cmci   CICS management interface
 *   db2    Db2 REST
 *
 * They share credentials but not addresses, so each gets its own session,
 * built once and reused. Creating a session opens no socket: a bad hostname
 * surfaces on the first real call, not here.
 */
import type { ISession } from '@zowe/imperative';
import type { AppConfig } from '../config/schema.js';
import { Session } from '@zowe/imperative';
import { ConfigError, ConnectionError } from '../utils/errors.js';
import { childLogger } from '../utils/logger.js';

/** The mainframe services this server can reach. */
export type Endpoint = 'zosmf' | 'cmci' | 'db2';

/** Sessions live as long as the config object they were built from. */
let cache = new WeakMap<AppConfig, Map<Endpoint, Session>>();

/** Where an endpoint lives. CICS and Db2 fall back to the z/OSMF host. */
function addressOf(
    config: AppConfig,
    endpoint: Endpoint,
): Pick<ISession, 'hostname' | 'port' | 'basePath'> {
    const { zosmf, enterprise } = config;
    switch (endpoint) {
        case 'cmci':
            return {
                hostname: enterprise.cmciHost ?? zosmf.host,
                port: enterprise.cmciPort,
                basePath: enterprise.cmciBasePath || undefined,
            };
        case 'db2':
            return {
                hostname: enterprise.db2Host ?? zosmf.host,
                port: enterprise.db2Port,
                basePath: enterprise.db2BasePath || undefined,
            };
        case 'zosmf':
            return {
                hostname: zosmf.host,
                port: zosmf.port,
                basePath: zosmf.basePath || undefined,
            };
    }
}

/**
 * The credential half of a session. Token wins when both are supplied.
 * The config schema guarantees one of them is present, so the throw at the
 * end should be unreachable.
 */
function credentialsOf(
    config: AppConfig,
): Pick<ISession, 'type' | 'user' | 'password' | 'tokenType' | 'tokenValue'> {
    const { zosmf } = config;
    if (zosmf.token) {
        return { type: 'token', tokenType: zosmf.tokenType ?? 'LTPA2', tokenValue: zosmf.token };
    }
    if (zosmf.user && zosmf.password) {
        return { type: 'basic', user: zosmf.user, password: zosmf.password };
    }
    throw new ConfigError(
        'No usable z/OSMF authentication. Set ZOSMF_USER and ZOSMF_PASSWORD, or ZOSMF_TOKEN.',
    );
}

/** Assemble the full session description the Zowe SDK expects. */
export function buildSessionConfig(config: AppConfig, endpoint: Endpoint = 'zosmf'): ISession {
    return {
        ...addressOf(config, endpoint),
        protocol: 'https',
        rejectUnauthorized: config.zosmf.rejectUnauthorized,
        ...credentialsOf(config),
    };
}

/** Get the session for an endpoint, creating it the first time it is asked for. */
export function createEndpointSession(config: AppConfig, endpoint: Endpoint): Session {
    const perEndpoint = cache.get(config) ?? new Map<Endpoint, Session>();
    cache.set(config, perEndpoint);

    const existing = perEndpoint.get(endpoint);
    if (existing) return existing;

    let session: Session;
    try {
        session = new Session(buildSessionConfig(config, endpoint));
    } catch (err) {
        throw new ConnectionError(`Failed to create the ${endpoint} session.`, {
            cause: err instanceof Error ? err.message : String(err),
        });
    }
    perEndpoint.set(endpoint, session);

    const log = childLogger('zowe');
    log.info({ endpoint, ...describeConnection(config, endpoint) }, 'Session initialized');
    if (!config.zosmf.rejectUnauthorized) {
        log.warn('TLS certificate verification is DISABLED (ZOSMF_REJECT_UNAUTHORIZED=false).');
    }
    return session;
}

/** Get the main z/OSMF session — what almost every tool uses. */
export function createSession(config: AppConfig): Session {
    return createEndpointSession(config, 'zosmf');
}

/** A connection summary with the credentials removed, safe to log or display. */
export interface ConnectionSummary {
    host: string;
    port: number;
    auth: 'token' | 'basic';
    /** First two characters of the user id; absent when using token auth. */
    user?: string;
    rejectUnauthorized: boolean;
}

/** Describe a connection without exposing the credentials. */
export function describeConnection(
    config: AppConfig,
    endpoint: Endpoint = 'zosmf',
): ConnectionSummary {
    const { hostname, port } = addressOf(config, endpoint);
    const { zosmf } = config;
    return {
        host: hostname ?? zosmf.host,
        port: port ?? zosmf.port,
        auth: zosmf.token ? 'token' : 'basic',
        user: zosmf.user ? `${zosmf.user.slice(0, 2)}***` : undefined,
        rejectUnauthorized: zosmf.rejectUnauthorized,
    };
}

/** Drop every cached session. Used by tests. */
export function resetSessions(): void {
    cache = new WeakMap<AppConfig, Map<Endpoint, Session>>();
}
