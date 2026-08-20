/**
 * Generic REST helpers for z/OSMF, CMCI, and Db2 REST endpoints.
 */
import type { AppConfig } from '../config/schema.js';
import { RestClient, Session } from '@zowe/imperative';
import { ConfigError, ConnectionError, normalizeError } from '../utils/errors.js';

export type EnterpriseEndpoint = 'zosmf' | 'cmci' | 'db2';

let endpointSessions = new WeakMap<AppConfig, Map<EnterpriseEndpoint, Session>>();

/** Resolve host/port/basePath for an enterprise endpoint. */
export function resolveEndpoint(config: AppConfig, endpoint: EnterpriseEndpoint): { host: string; port: number; basePath: string; } {
    const { zosmf, enterprise } = config;
    switch (endpoint) {
        case 'cmci':
            return {
                host: enterprise.cmciHost ?? zosmf.host,
                port: enterprise.cmciPort,
                basePath: enterprise.cmciBasePath,
            };
        case 'db2':
            return {
                host: enterprise.db2Host ?? zosmf.host,
                port: enterprise.db2Port,
                basePath: enterprise.db2BasePath,
            };
        default:
            return {
                host: zosmf.host,
                port: zosmf.port,
                basePath: zosmf.basePath ?? '',
            };
    }
}
/** Build a dedicated Session for a non-z/OSMF endpoint (CMCI, Db2 REST). */
export function createEndpointSession(config: AppConfig, endpoint: EnterpriseEndpoint): Session {
    const cached = endpointSessions.get(config)?.get(endpoint);
    if (cached)
        return cached;
    const { zosmf } = config;
    const { host, port, basePath } = resolveEndpoint(config, endpoint);
    const base = {
        hostname: host,
        port,
        protocol: 'https' as const,
        rejectUnauthorized: zosmf.rejectUnauthorized,
        basePath: basePath || undefined,
    };
    if (zosmf.token) {
        const session = new Session({
            ...base,
            type: 'token',
            tokenType: zosmf.tokenType ?? 'LTPA2',
            tokenValue: zosmf.token,
        });
        cacheEndpointSession(config, endpoint, session);
        return session;
    }
    if (zosmf.user && zosmf.password) {
        const session = new Session({
            ...base,
            type: 'basic',
            user: zosmf.user,
            password: zosmf.password,
        });
        cacheEndpointSession(config, endpoint, session);
        return session;
    }
    throw new ConfigError('No usable authentication for enterprise REST endpoints.');
}

function cacheEndpointSession(config: AppConfig, endpoint: EnterpriseEndpoint, session: Session): void {
    const cache = endpointSessions.get(config) ?? new Map<EnterpriseEndpoint, Session>();
    cache.set(endpoint, session);
    endpointSessions.set(config, cache);
}

/** Reset cached enterprise sessions (primarily for tests). */
export function resetEndpointSessions(): void {
    endpointSessions = new WeakMap<AppConfig, Map<EnterpriseEndpoint, Session>>();
}
/** GET and return a JSON body from an endpoint. */
export async function getJson<T extends object>(session: Session, resource: string): Promise<T> {
    try {
        return await RestClient.getExpectJSON(session, resource);
    }
    catch (err) {
        throw mapRestError(err, resource);
    }
}
/** GET and return a text body from an endpoint. */
export async function getText(session: Session, resource: string): Promise<string> {
    try {
        return await RestClient.getExpectString(session, resource);
    }
    catch (err) {
        throw mapRestError(err, resource);
    }
}
/** POST JSON and return a JSON body. */
export async function postJson<T extends object>(session: Session, resource: string, body: unknown): Promise<T> {
    try {
        return await RestClient.postExpectJSON(session, resource, [], body);
    }
    catch (err) {
        throw mapRestError(err, resource);
    }
}
function mapRestError(err: unknown, resource: string): Error {
    const normalized = normalizeError(err);
    if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|certificate/i.test(normalized.message)) {
        return new ConnectionError(`REST call failed for ${resource}: ${normalized.message}`);
    }
    return normalized;
}
/** Require Db2 REST configuration before catalog calls. */
export function requireDb2Config(config: AppConfig): { location: string; } {
    if (!config.enterprise.db2Location) {
        throw new ConfigError('Db2 tools require DB2_LOCATION (Db2 subsystem location name). Optionally set DB2_HOST and DB2_PORT.');
    }
    return { location: config.enterprise.db2Location };
}
/** Require CMCI context (CICSplex name or region APPLID). */
export function requireCmciContext(config: AppConfig, context?: string): string {
    const resolved = context ?? config.enterprise.cmciContext;
    if (!resolved) {
        throw new ConfigError('CICS tools require CMCI_CONTEXT (CICSplex name or region APPLID). Optionally set CMCI_HOST and CMCI_PORT.');
    }
    return resolved;
}
/** Require a RACF audit source path or dataset. */
export function requireRacfAuditSource(config: AppConfig): { ussPath?: string; dataset?: string; } {
    const { racfAuditUssPath, racfAuditDataset } = config.enterprise;
    if (!racfAuditUssPath && !racfAuditDataset) {
        throw new ConfigError('RACF audit tools require RACF_AUDIT_USS_PATH or RACF_AUDIT_DATASET to be configured.');
    }
    return { ussPath: racfAuditUssPath, dataset: racfAuditDataset };
}
