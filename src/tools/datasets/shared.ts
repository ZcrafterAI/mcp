/**
 * Shared dataset helpers: normalizers and fetch routines over the Zowe
 * zos-files SDK.
 */
import type { Dataset, Member } from '../../types/zos.js';
import type { ToolContext } from '../../types/tools.js';
import { Get, List } from '@zowe/zos-files-for-zowe-sdk';
import { NotFoundError, ValidationError } from '../../utils/errors.js';

/**
 * Raw dataset entry as returned by the z/OSMF files API. Every field is
 * optional and numerics arrive as strings, which is why the normalizers below
 * coerce rather than trust the wire shape.
 */
interface RawDataset {
    dsname?: string;
    dsorg?: string;
    recfm?: string;
    lrecl?: string | number;
    blksize?: string | number;
    vol?: string;
    migr?: string;
    dsntype?: string;
}

/** Raw PDS member entry as returned by the z/OSMF files API. */
interface RawMember {
    member?: string;
    m4date?: string;
    c4date?: string;
    changed?: string;
    vers?: number;
    id?: string;
    size?: string | number;
}

/** Normalize a raw dataset list entry. */
export function normalizeDataset(raw: RawDataset): Dataset {
    const migrated = (raw.migr ?? '').toUpperCase() === 'YES' || raw.vol === 'MIGRAT';
    const dsorg = raw.dsorg;
    const pdse = (raw.dsntype ?? '').toUpperCase() === 'LIBRARY' ||
        (dsorg ?? '').toUpperCase() === 'PO-E';
    return {
        name: raw.dsname ?? '',
        dsorg,
        recfm: raw.recfm,
        lrecl: raw.lrecl != null ? Number(raw.lrecl) : undefined,
        blksize: raw.blksize != null ? Number(raw.blksize) : undefined,
        volume: migrated ? undefined : raw.vol,
        migrated,
        pdse: pdse || undefined,
    };
}
/** Normalize a raw PDS member entry (basic — from list without attributes). */
export function normalizeMember(raw: RawMember): Member {
    return {
        name: raw.member ?? '',
        modified: raw.m4date ?? raw.c4date,
        changedTime: raw.changed,
        version: raw.vers,
        user: raw.id,
        size: raw.size != null ? Number(raw.size) : undefined,
    };
}
/**
 * Normalise a dataset name: trim whitespace, strip surrounding single quotes
 * (common from ISPF copy-paste), and convert to uppercase.
 */
export function normalizeDatasetName(dsn: string): string {
    return dsn.trim().replace(/^'|'$/g, '').toUpperCase();
}
/**
 * Validate a PDS member name: must be 1–8 uppercase alphanumeric or
 * national-character (@, #, $) starting with a non-digit.
 * Throws ValidationError if invalid.
 */
export function assertValidMemberName(name: string): void {
    const upper = name.toUpperCase();
    if (!/^[A-Z@#$][A-Z0-9@#$]{0,7}$/.test(upper)) {
        throw new ValidationError(`Invalid PDS member name "${name}". Must be 1–8 characters starting with a letter or national character (@, #, $).`, { name });
    }
}
/** List datasets matching a pattern (e.g. "SYS1.*"). */
export async function listDatasets(ctx: ToolContext, pattern: string): Promise<Dataset[]> {
    const response = await List.dataSet(ctx.session, pattern, { attributes: true });
    const items: RawDataset[] = (response.apiResponse?.items ?? []);
    return items.map(normalizeDataset).filter((ds) => ds.name.length > 0);
}
/** List members of a PDS (basic — name and dates only). */
export async function listMembers(ctx: ToolContext, dsn: string): Promise<Member[]> {
    const response = await List.allMembers(ctx.session, dsn, {});
    const items: RawMember[] = (response.apiResponse?.items ?? []);
    return items.map(normalizeMember).filter((m) => m.name.length > 0);
}
/**
 * List members of a PDS with full stats (user, size, changed time).
 * Requires the member have statistics turned on in the PDS directory.
 */
export async function listMembersWithStats(ctx: ToolContext, dsn: string): Promise<Member[]> {
    const response = await List.allMembers(ctx.session, dsn, { attributes: true });
    const items: RawMember[] = (response.apiResponse?.items ?? []);
    return items.map(normalizeMember).filter((m) => m.name.length > 0);
}
/** Read a sequential dataset or PDS member as text. */
export async function readDataset(ctx: ToolContext, dsn: string, member?: string, encoding?: 'utf8' | 'ibm1047'): Promise<string> {
    const target = member ? `${dsn}(${member})` : dsn;
    const options = encoding === 'ibm1047'
        ? { responseTimeout: 60000 }
        : {};
    const buffer = await Get.dataSet(ctx.session, target, options);
    if (buffer == null) {
        throw new NotFoundError(`Dataset ${target} could not be read or is empty.`, { target });
    }
    return buffer.toString('utf8');
}
/** Fetch catalog attributes for an exact dataset name. */
export async function getDatasetInfo(ctx: ToolContext, dsn: string): Promise<Dataset> {
    const results = await listDatasets(ctx, dsn);
    const match = results.find((entry) => entry.name.toUpperCase() === dsn.trim().toUpperCase());
    if (!match) {
        throw new NotFoundError(`Dataset ${dsn} was not found in the catalog.`, { dsn });
    }
    return match;
}
