/**
 * `get_cics_region_status` — status of a single CICS region.
 */
import type { ToolRegistrar } from '../../types/tools.js';
import { z } from 'zod';
import { securedHandler } from '../../utils/tool-handler.js';
import { textResult } from '../../utils/formatters.js';
import { assertValidApplid, getCicsRegion, normalizeApplid } from './shared.js';
const inputShape = {
    region: z.string().min(1).describe('CICS region APPLID, e.g. "CICSPAY1" (max 8 chars).'),
    context: z.string().optional().describe('CMCI context. Defaults to CMCI_CONTEXT env var.'),
};
export const registerGetCicsRegionTool: ToolRegistrar = (server, ctx) => {
    server.tool('get_cics_region_status', 'Get the current status, version, and attributes of a CICS region via CMCI.', inputShape, securedHandler(ctx, 'get_cics_region_status', async ({ region, context }) => {
        assertValidApplid(region);
        const applid = normalizeApplid(region);
        const info = await getCicsRegion(ctx, applid, context);
        ctx.logger.debug({ region: info.applid, status: info.status }, 'get_cics_region_status');
        const lines = [
            `Region:      ${info.applid}`,
            `Status:      ${info.status}`,
            `CICSPlex:    ${info.cicsplex ?? '—'}`,
            `SYSID:       ${info.sysid ?? '—'}`,
            `Version:     ${info.version ?? '—'}`,
            `MVS Group:   ${info.mvsgroupid ?? '—'}`,
            `Uptime:      ${info.uptime ?? '—'}`,
            `Job:         ${info.jobname ? `${info.jobname} ${info.jobid ?? ''}`.trim() : '—'}`,
        ];
        return textResult(lines.join('\n'));
    }));
};
