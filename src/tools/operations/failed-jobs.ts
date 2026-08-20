/**
 * `find_failed_jobs` — find all failed jobs in a time window.
 */
import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { formatStructuredResponse, renderTable, textResult } from '../../utils/formatters.js';
import { fetchQuickFailureStep } from '../jobs/shared.js';
import { findFailedJobs } from './shared.js';
import { mapConcurrent } from '../../utils/async.js';
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

export const findFailedJobsTool = defineTool({
    name: 'find_failed_jobs',
    description: 'Find all failed jobs within a recent time window and summarize their abend/step.',
    input: inputShape,
    async run({ hours, owner }, ctx) {
        const window = hours ?? 24;
        const failures = await findFailedJobs(ctx, window, owner ?? '*');
        if (failures.length === 0) {
            return textResult(`Failed Jobs — Last ${window} Hours (0 found)`);
        }
        const detailedFailures = failures.slice(0, MAX_STEP_LOOKUP);
        const steps = await mapConcurrent(
            detailedFailures,
            ctx.config.limits.maxConcurrentRequests,
            async ({ job }) => {
                try {
                    return (await fetchQuickFailureStep(ctx, job.jobName, job.jobId)) ?? '—';
                } catch {
                    return '—';
                }
            },
        );
        const rows = failures.map(({ job, abendCode }, index) => {
            const step = steps[index] ?? '—';
            return [job.jobName, job.jobId, abendCode ?? job.returnCode ?? '—', step];
        });
        ctx.logger.debug({ window, count: failures.length }, 'find_failed_jobs');
        const note =
            failures.length > MAX_STEP_LOOKUP
                ? `\n\n(Step detail shown for the first ${MAX_STEP_LOOKUP} jobs.)`
                : '';
        return textResult(
            formatStructuredResponse(`Failed Jobs — Last ${window} Hours`, [
                {
                    heading: `${failures.length} failed job(s)`,
                    body:
                        renderTable(['Job Name', 'Job ID', 'Abend Code', 'Failed Step'], rows) +
                        note,
                },
            ]),
        );
    },
});
