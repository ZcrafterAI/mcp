/**
 * `get_job_status` — current status and return code of a single job.
 */
import type { ToolRegistrar } from '../../types/tools.js';
import { z } from 'zod';
import { ValidationError } from '../../utils/errors.js';
import { formatJobStatus, formatSpoolFiles, textResult } from '../../utils/formatters.js';
import { securedHandler } from '../../utils/tool-handler.js';
import { assertValidJobId, fetchJob, fetchSpoolFiles, normalizeJobId } from './shared.js';
const inputShape = {
    jobId: z.string().min(1).describe('JES job id, e.g. "JOB01234".'),
    jobName: z
        .string()
        .optional()
        .describe('Optional job name for confirmation/disambiguation (max 8 chars).'),
    includeSpoolSummary: z
        .boolean()
        .optional()
        .describe('When true, also list the spool DD inventory below the status block.'),
};
export const registerGetJobStatusTool: ToolRegistrar = (server, ctx) => {
    server.tool('get_job_status', 'Get the current status, return code, and failure indicator for a specific job. Optionally includes spool file inventory.', inputShape, securedHandler(ctx, 'get_job_status', async ({ jobId, jobName, includeSpoolSummary }) => {
        assertValidJobId(jobId);
        const normalizedId = normalizeJobId(jobId);
        const job = await fetchJob(ctx, normalizedId);
        if (jobName && job.jobName.toUpperCase() !== jobName.toUpperCase()) {
            throw new ValidationError(`Job id ${normalizedId} belongs to ${job.jobName}, not ${jobName.toUpperCase()}.`, { expectedJobName: job.jobName, providedJobName: jobName });
        }
        ctx.logger.debug({ jobId: normalizedId, status: job.status }, 'get_job_status');
        let output = formatJobStatus(job);
        if (includeSpoolSummary) {
            const files = await fetchSpoolFiles(ctx, job.jobName, job.jobId);
            output += '\n\n' + formatSpoolFiles(job.jobName, job.jobId, files);
        }
        return textResult(output);
    }));
};
