/**
 * `get_job_jcl` — retrieve the submitted JCL for a job from its spool.
 */
import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { NotFoundError } from '../../utils/errors.js';
import { formatContentHeader, textResult, truncateLines } from '../../utils/formatters.js';
import {
    assertValidJobId,
    fetchJob,
    fetchSpoolContent,
    fetchSpoolFiles,
    normalizeJobId,
} from './shared.js';
/**
 * DD names that typically contain the submitted JCL, in priority order.
 * JESJCLIN is most common; JESJCL is used on some systems; JCL and SYSIN as fallbacks.
 */
const JCL_DDS = ['JESJCLIN', 'JESJCL', 'JCL', 'SYSIN'];

const inputShape = {
    jobId: z.string().min(1).describe('JES job id, e.g. "JOB01234".'),
    maxLines: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Maximum lines to return (caps at server configuration maximum).'),
};

export const getJobJclTool = defineTool({
    name: 'get_job_jcl',
    description:
        'Retrieve the JCL that was submitted for a job (from JESJCLIN / JESJCL / JCL spool DDs). Supports custom line limit.',
    input: inputShape,
    async run({ jobId, maxLines }, ctx) {
        assertValidJobId(jobId);
        const normalizedId = normalizeJobId(jobId);
        const job = await fetchJob(ctx, normalizedId);
        const files = await fetchSpoolFiles(ctx, job.jobName, job.jobId);
        const jclFile = files
            .filter((file) => JCL_DDS.includes(file.ddName.toUpperCase()))
            .sort(
                (a, b) =>
                    JCL_DDS.indexOf(a.ddName.toUpperCase()) -
                    JCL_DDS.indexOf(b.ddName.toUpperCase()),
            )[0];
        if (!jclFile) {
            throw new NotFoundError(`No JCL spool DD found for ${job.jobName} (${job.jobId}).`, {
                searched: JCL_DDS.join(', '),
                available: files.map((f) => f.ddName).join(', '),
            });
        }
        const raw = await fetchSpoolContent(ctx, job.jobName, job.jobId, jclFile.id);
        const cap = Math.min(
            maxLines ?? ctx.config.limits.maxJobOutputLines,
            ctx.config.limits.maxJobOutputLines,
        );
        const { text, truncated, totalLines } = truncateLines(raw, cap);
        ctx.logger.debug(
            { jobId: normalizedId, ddName: jclFile.ddName, totalLines },
            'get_job_jcl',
        );
        const header = formatContentHeader(
            `JCL — ${job.jobName} (${job.jobId}) DD=${jclFile.ddName}  [${totalLines} lines]`,
            truncated,
            totalLines,
            cap,
        );
        return textResult(header + text);
    },
});
