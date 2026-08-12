/**
 * `get_dataset_info` — catalog attributes for a dataset without reading content.
 */
import type { ToolRegistrar } from '../../types/tools.js';
import { z } from 'zod';
import { formatDatasetInfo, textResult } from '../../utils/formatters.js';
import { assertDatasetAllowed } from '../../utils/security.js';
import { securedHandler } from '../../utils/tool-handler.js';
import { getDatasetInfo, listMembersWithStats, normalizeDatasetName } from './shared.js';
const RECENT_MEMBER_COUNT = 5;
const inputShape = {
    dsn: z.string().min(1).describe('Fully-qualified dataset name, e.g. "SYS1.PROCLIB".'),
    includeMembers: z
        .boolean()
        .optional()
        .describe('For PDS/PDSE: also retrieve member count and the 5 most-recently-modified members.'),
};
export const registerDatasetInfoTool: ToolRegistrar = (server, ctx) => {
    server.tool('get_dataset_info', 'Get catalog attributes (DSORG, type, RECFM, LRECL, BLKSIZE, volume) for a dataset without reading its content. Optionally includes member summary for PDS/PDSE.', inputShape, securedHandler(ctx, 'get_dataset_info', async ({ dsn, includeMembers }) => {
        const normalizedDsn = normalizeDatasetName(dsn);
        assertDatasetAllowed(ctx.config, normalizedDsn);
        const info = await getDatasetInfo(ctx, normalizedDsn);
        ctx.logger.debug({ dsn: normalizedDsn, includeMembers }, 'get_dataset_info');
        let memberData;
        // Only attempt member listing for PDS or PDSE
        if (includeMembers) {
            const isPds = (info.dsorg ?? '').toUpperCase().startsWith('PO') || info.pdse;
            if (isPds) {
                const allMembers = await listMembersWithStats(ctx, normalizedDsn);
                // Sort newest-modified first, take top N
                const sorted = allMembers.slice().sort((a, b) => {
                    const da = a.modified ?? '';
                    const db = b.modified ?? '';
                    if (db !== da)
                        return db.localeCompare(da);
                    return a.name.localeCompare(b.name);
                });
                memberData = {
                    total: allMembers.length,
                    recent: sorted.slice(0, RECENT_MEMBER_COUNT),
                };
            }
        }
        return textResult(formatDatasetInfo(info, memberData));
    }, ({ dsn }) => ({ dataset: dsn })));
};
