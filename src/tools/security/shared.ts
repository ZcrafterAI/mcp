/**
 * Shared RACF audit helpers.
 */
import type { ToolContext } from '../../types/tools.js';
import type { RacfAuditEntry } from '../../parsers/racf.js';
import { filterAuditEntries, parseRacfAuditLine } from '../../parsers/racf.js';
import { requireRacfAuditSource } from '../../zowe/requirements.js';
import { readDataset } from '../datasets/shared.js';
import { readUssFile } from '../uss/shared.js';
import { truncateLines } from '../../utils/formatters.js';
/** Load and parse RACF audit records from the configured source. */
export async function loadRacfAuditRecords(ctx: ToolContext): Promise<RacfAuditEntry[]> {
    const source = requireRacfAuditSource(ctx.config);
    let text: string;
    if (source.ussPath) {
        text = await readUssFile(ctx, source.ussPath);
    } else {
        // requireRacfAuditSource guarantees one of ussPath/dataset is set.
        text = await readDataset(ctx, source.dataset!);
    }
    const { text: capped } = truncateLines(text, ctx.config.limits.maxAuditLines);
    return capped.split(/\r?\n/).filter(Boolean).map(parseRacfAuditLine);
}
/** Query RACF audit records with optional filters and result cap. */
export async function queryRacfAudit(
    ctx: ToolContext,
    filters: {
        user?: string;
        resource?: string;
        hours?: number;
        event?: string;
        result?: string;
        class?: string;
    },
    maxResults?: number,
): Promise<RacfAuditEntry[]> {
    const records = await loadRacfAuditRecords(ctx);
    let filtered = filterAuditEntries(records, filters);
    if (maxResults != null && filtered.length > maxResults) {
        filtered = filtered.slice(0, maxResults);
    }
    return filtered;
}
