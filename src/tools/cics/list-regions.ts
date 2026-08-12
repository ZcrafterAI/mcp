/**
 * `list_cics_regions` — list CICS regions via CMCI REST.
 */
import type { ToolRegistrar } from '../../types/tools.js';
import { z } from 'zod';
import { securedHandler } from '../../utils/tool-handler.js';
import { renderTable, textResult } from '../../utils/formatters.js';
import { listCicsRegions } from './shared.js';
const inputShape = {
    context: z
        .string()
        .optional()
        .describe('CMCI context (CICSplex name or region APPLID). Defaults to CMCI_CONTEXT env var.'),
    status: z
        .string()
        .optional()
        .describe('Filter by region status, e.g. "ACTIVE", "INACTIVE". Case-insensitive.'),
    maxResults: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Maximum number of regions to return after filtering.'),
};
export const registerListCicsRegionsTool: ToolRegistrar = (server, ctx) => {
    server.tool('list_cics_regions', 'List CICS regions in a CMCI context. Supports status filter and result capping.', inputShape, securedHandler(ctx, 'list_cics_regions', async ({ context, status, maxResults }) => {
        let regions = await listCicsRegions(ctx, context, status);
        const total = regions.length;
        if (maxResults != null && regions.length > maxResults) {
            regions = regions.slice(0, maxResults);
        }
        if (regions.length === 0) {
            const statusNote = status ? ` with status "${status.toUpperCase()}"` : '';
            return textResult(`No CICS regions found${statusNote} in the specified context.`);
        }
        const rows = regions.map((region) => [
            region.applid,
            region.status,
            region.cicsplex ?? '—',
            region.sysid ?? '—',
            region.version ?? '—',
            region.jobname ? `${region.jobname} ${region.jobid ?? ''}`.trim() : '—',
        ]);
        const capNote = regions.length < total ? ` (showing ${regions.length} of ${total})` : '';
        const statusLine = status ? ` [filter: status=${status.toUpperCase()}]` : '';
        ctx.logger.debug({ count: regions.length, total, status }, 'list_cics_regions');
        return textResult(`CICS Regions${statusLine} — ${regions.length} found${capNote}\n\n` +
            renderTable(['APPLID', 'Status', 'CICSPlex', 'SYSID', 'Version', 'Job'], rows));
    }));
};
