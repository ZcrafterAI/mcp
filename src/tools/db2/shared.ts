/**
 * Shared Db2 REST helpers.
 */
import type { Db2CatalogEntry } from '../../types/zos.js';
import type { ToolContext } from '../../types/tools.js';
import { createEndpointSession } from '../../zowe/session.js';
import { postJson } from '../../zowe/rest-client.js';
import { requireDb2Config } from '../../zowe/requirements.js';
import { asText } from '../../zowe/response.js';

/** Db2 REST `/v4/sql` response envelope. */
interface Db2SqlResponse {
    error?: string;
    sqlState?: string;
    rows?: Record<string, unknown>[];
    resultSet?: Record<string, unknown>[];
}

/** Db2 REST `/v4/locations` response envelope. */
interface Db2LocationsResponse {
    locations?: string[];
    rows?: { location: string }[];
}
/**
 * Sanitize a value for safe inclusion as a SQL literal in read-only catalog queries.
 * - Escapes single quotes (SQL injection prevention)
 * - Strips statement terminators and newlines
 * - Strips inline comment sequences (-- and /*)
 * - Caps at 64 characters
 */
export function sanitizeSqlLiteral(value: string): string {
    return value
        .replace(/'/g, "''") // escape single quotes
        .replace(/--[^\n]*/g, '') // strip -- line comments
        .replace(/\/\*[\s\S]*?\*\//g, '') // strip block comments
        .replace(/[;\r\n]/g, '') // strip statement terminators and newlines
        .slice(0, 64);
}
/** Execute a read-only SQL statement via Db2 REST. */
export async function executeDb2Sql(
    ctx: ToolContext,
    sql: string,
): Promise<Record<string, unknown>[]> {
    const { location } = requireDb2Config(ctx.config);
    const session = createEndpointSession(ctx.config, 'db2');
    const response = await postJson<Db2SqlResponse>(session, `/v4/sql/${location}`, { sql });
    if (response.error) {
        throw new Error(`Db2 SQL error (${response.sqlState ?? 'unknown'}): ${response.error}`);
    }
    return response.rows ?? response.resultSet ?? [];
}
/** List Db2 subsystems/locations visible to the REST service. */
export async function listDb2Subsystems(ctx: ToolContext): Promise<string[]> {
    const { location } = requireDb2Config(ctx.config);
    const session = createEndpointSession(ctx.config, 'db2');
    try {
        const response = await postJson<Db2LocationsResponse>(session, '/v4/locations', {});
        if (response.locations) return response.locations;
        if (response.rows) return response.rows.map((row) => String(row.location));
    } catch {
        // Fall back to configured location only.
    }
    return [location];
}
/** Valid Db2 catalog object type codes for filtering. */
const VALID_CATALOG_TYPES = ['T', 'V', 'A', 'M', 'X'];
/** Friendly type name mapping for display. */
const TYPE_NAMES: Record<string, string> = {
    T: 'TABLE',
    V: 'VIEW',
    A: 'ALIAS',
    M: 'MATERIALIZED QUERY TABLE',
    X: 'AUXILIARY TABLE',
};
/** Search the Db2 catalog for tables, views, or aliases. */
export async function searchDb2Catalog(
    ctx: ToolContext,
    pattern: string,
    schema?: string,
    type?: string,
    maxResults: number = 50,
): Promise<Db2CatalogEntry[]> {
    const likePattern = sanitizeSqlLiteral(pattern).replace(/\*/g, '%').replace(/\?/g, '_');
    const schemaFilter = schema ? `AND CREATOR = '${sanitizeSqlLiteral(schema)}'` : '';
    let typeFilter = '';
    if (type) {
        const upper = type.trim().toUpperCase();
        // Accept full words like "TABLE" or short codes like "T"
        const code =
            Object.entries(TYPE_NAMES).find(([, name]) => name === upper)?.[0] ??
            (VALID_CATALOG_TYPES.includes(upper) ? upper : null);
        if (code) typeFilter = `AND TYPE = '${code}'`;
    }
    const limit = Math.min(maxResults, 200);
    const sql = `
    SELECT CREATOR, NAME, TYPE,
           CHAR(BIGINT(CARDF)) AS ROWCOUNT,
           CHAR(CREATEDTS, ISO) AS CREATED,
           REMARKS
    FROM SYSIBM.SYSTABLES
    WHERE NAME LIKE '${likePattern}' ${schemaFilter} ${typeFilter}
    FETCH FIRST ${limit} ROWS ONLY
  `.trim();
    const rows = await executeDb2Sql(ctx, sql);
    return rows.map((row) => {
        // Db2 REST answers with either upper- or lower-case column names.
        const column = (name: string): unknown =>
            row[name.toUpperCase()] ?? row[name.toLowerCase()];
        const remarks = column('remarks');
        return {
            schema: asText(column('creator')),
            name: asText(column('name')),
            type: TYPE_NAMES[asText(column('type'), '')] ?? asText(column('type')),
            rowCount: column('rowcount') != null ? asText(column('rowcount')) : undefined,
            created: column('created') != null ? asText(column('created')) : undefined,
            remarks: remarks != null ? asText(remarks).trim() || undefined : undefined,
        };
    });
}
