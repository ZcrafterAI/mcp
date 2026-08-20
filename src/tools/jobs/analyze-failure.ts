/**
 * `analyze_job_failure` — analyze a failed job and summarize the root cause.
 */
import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { formatAnalysisFull, textResult } from '../../utils/formatters.js';
import { analyzeJobFailure, assertValidJobId, isFailedJob, normalizeJobId } from './shared.js';
const inputShape = {
    jobId: z.string().min(1).describe('JES job id of the failed job, e.g. "JOB01234".'),
    includeEvidence: z
        .boolean()
        .optional()
        .describe('Include supporting spool evidence lines in the output (default: true).'),
    spoolDd: z
        .string()
        .optional()
        .describe(
            'Force analysis to read a specific DD instead of the auto-priority list (e.g. "JESYSMSG").',
        ),
};

export const analyzeJobFailureTool = defineTool({
    name: 'analyze_job_failure',
    description:
        'Analyze a failed job: identify the abend code, failing/cancelled step, program, and a suggested fix. Produces a rich 3-section report.',
    input: inputShape,
    async run({ jobId, includeEvidence, spoolDd }, ctx) {
        assertValidJobId(jobId);
        const normalizedId = normalizeJobId(jobId);
        const normalizedDd = spoolDd?.toUpperCase();
        const analysis = await analyzeJobFailure(ctx, normalizedId, normalizedDd);
        ctx.logger.debug(
            {
                jobId: normalizedId,
                abendCode: analysis.abendCode,
                cancelledStep: analysis.cancelledStep,
                spoolDd: normalizedDd,
            },
            'analyze_job_failure',
        );
        // If the job actually completed normally, return a clear informational message
        if (!isFailedJob(analysis.job) && !analysis.abendCode && !analysis.cancelledStep) {
            return textResult(
                `Job ${analysis.job.jobName} (${analysis.job.jobId}) completed normally with return code ${analysis.job.returnCode ?? '(none)'}.\n\nNo failure analysis is required.`,
            );
        }
        return textResult(
            formatAnalysisFull(analysis, { includeEvidence: includeEvidence !== false }),
        );
    },
});
