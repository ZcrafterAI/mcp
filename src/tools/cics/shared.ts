/**
 * Shared CICS CMCI helpers.
 */
import type { CicsRegion, CicsTransaction } from '../../types/zos.js';
import type { ToolContext } from '../../types/tools.js';
import { ValidationError } from '../../utils/errors.js';
import { parseCmciXml } from '../../utils/cmci-parser.js';
import type { CmciRecord } from '../../utils/cmci-parser.js';
import { createEndpointSession, getText, requireCmciContext } from '../../zowe/rest-client.js';
/** Normalize a CICS APPLID: trim and uppercase. */
export function normalizeApplid(applid: string): string {
    return applid.trim().toUpperCase();
}
/**
 * Assert the APPLID looks like a valid CICS region identifier.
 * z/OS limits APLIDs to 8 uppercase alphanumeric / national chars.
 */
export function assertValidApplid(applid: string): void {
    const normalized = normalizeApplid(applid);
    if (!normalized || normalized.length > 8 || !/^[A-Z0-9@#$]{1,8}$/.test(normalized)) {
        throw new ValidationError(`Invalid CICS APPLID "${applid}". Must be 1–8 alphanumeric characters (A-Z, 0-9, @, #, $).`, { applid });
    }
}
/** Normalize a raw CMCI status string to a consistent uppercase value. */
export function normalizeCicsStatus(status: string | undefined): string {
    const upper = (status ?? 'UNKNOWN').trim().toUpperCase();
    // CMCI returns a variety of spellings; canonicalize common ones.
    if (upper === 'ACTIVE' || upper === 'ENABLED')
        return 'ACTIVE';
    if (upper === 'INACTIVE' || upper === 'DISABLED')
        return 'INACTIVE';
    return upper;
}
function mapRegion(record: CmciRecord) {
    return {
        applid: record.applid ?? record.cicsregion ?? record.name ?? '—',
        status: normalizeCicsStatus(record.cicsstatus ?? record.status ?? record.cicsstate),
        cicsplex: record.cicsplexname ?? record.cicsplex,
        sysid: record.sysid,
        jobname: record.jobname,
        jobid: record.jobid,
        mvsgroupid: record.mvsgroupid ?? record.sysgroup,
        version: record.cicsversion ?? record.version,
        uptime: record.uptime ?? record.starttime,
    };
}
function mapTransaction(record: CmciRecord) {
    return {
        tranid: record.tranid ?? record.transaction ?? '—',
        program: record.program ?? record.pgmname ?? '—',
        status: normalizeCicsStatus(record.status ?? record.trstatus),
        taskcount: String(record.taskcount ?? record.currtasks ?? '—'),
        priority: record.priority != null ? String(record.priority) : undefined,
        profile: record.profile ?? record.tranprof,
    };
}
/** Build a CMCI GET resource path. */
function cmciPath(context: string, resource: string, scope = '*'): string {
    return `/${resource}/${encodeURIComponent(context)}/${encodeURIComponent(scope)}/`;
}
/** List CICS regions in a CMCI context with optional status filter. */
export async function listCicsRegions(ctx: ToolContext, context?: string, statusFilter?: string): Promise<CicsRegion[]> {
    const cmciContext = requireCmciContext(ctx.config, context);
    const session = createEndpointSession(ctx.config, 'cmci');
    const xml = await getText(session, cmciPath(cmciContext, 'CICSRegion'));
    let regions = parseCmciXml(xml).map(mapRegion);
    if (statusFilter) {
        const upper = normalizeCicsStatus(statusFilter);
        regions = regions.filter((r) => normalizeCicsStatus(r.status) === upper);
    }
    return regions;
}
/** Get status for a specific CICS region APPLID. */
export async function getCicsRegion(ctx: ToolContext, region: string, context?: string): Promise<CicsRegion> {
    assertValidApplid(region);
    const normalizedApplid = normalizeApplid(region);
    const cmciContext = requireCmciContext(ctx.config, context);
    const session = createEndpointSession(ctx.config, 'cmci');
    const xml = await getText(session, cmciPath(cmciContext, 'CICSRegion', normalizedApplid));
    const records = parseCmciXml(xml).map(mapRegion);
    if (records.length === 0) {
        return { applid: normalizedApplid, status: 'NOT FOUND' };
    }
    return records[0];
}
/** List transactions in a CICS region with optional prefix and status filter. */
export async function listCicsTransactions(ctx: ToolContext, region: string, context?: string, tranPrefix?: string, statusFilter?: string): Promise<CicsTransaction[]> {
    assertValidApplid(region);
    const normalizedApplid = normalizeApplid(region);
    const cmciContext = requireCmciContext(ctx.config, context);
    const session = createEndpointSession(ctx.config, 'cmci');
    const xml = await getText(session, cmciPath(cmciContext, 'CICSTransaction', normalizedApplid));
    let transactions = parseCmciXml(xml).map(mapTransaction);
    if (tranPrefix) {
        const prefix = tranPrefix.trim().toUpperCase();
        transactions = transactions.filter((t) => t.tranid.toUpperCase().startsWith(prefix));
    }
    if (statusFilter) {
        const upper = normalizeCicsStatus(statusFilter);
        transactions = transactions.filter((t) => normalizeCicsStatus(t.status) === upper);
    }
    return transactions;
}
