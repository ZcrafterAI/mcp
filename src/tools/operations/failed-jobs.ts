/**
 * `find_failed_jobs` — find all failed jobs in a time window.
 */
import type { ToolRegistrar } from '../../types/tools.js';
import { z } from 'zod';
import { securedHandler } from '../../utils/tool-handler.js';
import { formatStructuredResponse, renderTable, textResult } from '../../utils/formatters.js';
import { fetchQuickFailureStep } from '../jobs/shared.js';
import { findFailedJobs } from './shared.js';
/** Cap how many jobs we'll scan spool for (one DD each). */
const MAX_STEP_LOOKUP = 15;
const inputShape = {
    hours: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Look-back window in hours. Defaults to 24.'),
    owner: z.string().optional().describe('Owner filter. Defaults to "*" (all owners).'),
};
export const registerFailedJobsTool: ToolRegistrar = (server, ctx) => {
    server.tool('find_failed_jobs', 'Find all failed jobs within a recent time window and summarize their abend/step.', inputShape, securedHandler(ctx, 'find_failed_jobs', async ({ hours, owner }) => {
        const window = hours ?? 24;
        const failures = await findFailedJobs(ctx, window, owner ?? '*');
        if (failures.length === 0) {
            return textResult(`Failed Jobs — Last ${window} Hours (0 found)`);
        }
        const rows = [];
        for (let i = 0; i < failures.length; i += 1) {
            const { job, abendCode } = failures[i];
            let step = '—';
            if (i < MAX_STEP_LOOKUP) {
                try {
                    step = (await fetchQuickFailureStep(ctx, job.jobName, job.jobId)) ?? '—';
                }
                catch {
                    step = '—';
                }
            }
            rows.push([job.jobName, job.jobId, abendCode ?? (job.returnCode ?? '—'), step]);
        }
        ctx.logger.debug({ window, count: failures.length }, 'find_failed_jobs');
        const note = failures.length > MAX_STEP_LOOKUP
            ? `\n\n(Step detail shown for the first ${MAX_STEP_LOOKUP} jobs.)`
            : '';
        return textResult(formatStructuredResponse(`Failed Jobs — Last ${window} Hours`, [
            {
                heading: `${failures.length} failed job(s)`,
                body: renderTable(['Job Name', 'Job ID', 'Abend Code', 'Failed Step'], rows) + note,
            },
        ]));
    }));
};
