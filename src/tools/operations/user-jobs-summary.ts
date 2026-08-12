/**
 * `get_user_jobs_summary` — summarize jobs for a specific user/owner.
 */
import type { ToolRegistrar } from '../../types/tools.js';
import { z } from 'zod';
import { formatStructuredResponse, renderTable, textResult } from '../../utils/formatters.js';
import { securedHandler } from '../../utils/tool-handler.js';
import { isFailedJob, listJobs } from '../jobs/shared.js';
const inputShape = {
    owner: z.string().min(1).describe('User id (owner) to summarize, e.g. "PAYUSR".'),
    prefix: z.string().optional().describe('Optional job name prefix filter. Defaults to "*".'),
};
export const registerUserJobsSummaryTool: ToolRegistrar = (server, ctx) => {
    server.tool('get_user_jobs_summary', 'Summarize job counts by status for a specific owner (active, queued, failed, completed).', inputShape, securedHandler(ctx, 'get_user_jobs_summary', async ({ owner, prefix }) => {
        const jobs = await listJobs(ctx, owner, prefix ?? '*');
        const active = jobs.filter((job) => job.status === 'ACTIVE').length;
        const queued = jobs.filter((job) => job.status === 'INPUT').length;
        const output = jobs.filter((job) => job.status === 'OUTPUT').length;
        const failed = jobs.filter(isFailedJob).length;
        const ok = output - failed;
        const overview = renderTable(['Metric', 'Count'], [
            ['Total visible', String(jobs.length)],
            ['Active', String(active)],
            ['Queued (INPUT)', String(queued)],
            ['Completed OK', String(Math.max(ok, 0))],
            ['Failed', String(failed)],
        ]);
        ctx.logger.debug({ owner, count: jobs.length }, 'get_user_jobs_summary');
        return textResult(formatStructuredResponse(`Job Summary — ${owner}`, [
            { heading: 'Overview', body: overview },
        ]));
    }));
};
