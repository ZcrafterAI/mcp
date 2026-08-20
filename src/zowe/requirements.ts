/**
 * Optional features and the settings they need.
 *
 * CICS, Db2, and RACF audit tools are always registered, but they cannot work
 * until the matching environment variables are set. Each guard below fails
 * with a message naming exactly what is missing, so an AI agent can tell the
 * user what to configure instead of reporting an opaque error.
 */
import type { AppConfig } from '../config/schema.js';
import { ConfigError } from '../utils/errors.js';

/** Db2 tools need a subsystem location name. */
export function requireDb2Config(config: AppConfig): { location: string } {
    const location = config.enterprise.db2Location;
    if (!location) {
        throw new ConfigError(
            'Db2 tools require DB2_LOCATION (the Db2 subsystem location name). Optionally set DB2_HOST and DB2_PORT.',
        );
    }
    return { location };
}

/** CICS tools need a CICSplex name or region APPLID to scope the request. */
export function requireCmciContext(config: AppConfig, context?: string): string {
    const resolved = context ?? config.enterprise.cmciContext;
    if (!resolved) {
        throw new ConfigError(
            'CICS tools require CMCI_CONTEXT (a CICSplex name or region APPLID). Optionally set CMCI_HOST and CMCI_PORT.',
        );
    }
    return resolved;
}

/** The RACF audit query needs somewhere to read audit records from. */
export function requireRacfAuditSource(config: AppConfig): { ussPath?: string; dataset?: string } {
    const { racfAuditUssPath, racfAuditDataset } = config.enterprise;
    if (!racfAuditUssPath && !racfAuditDataset) {
        throw new ConfigError(
            'RACF audit tools require RACF_AUDIT_USS_PATH or RACF_AUDIT_DATASET to be configured.',
        );
    }
    return { ussPath: racfAuditUssPath, dataset: racfAuditDataset };
}
