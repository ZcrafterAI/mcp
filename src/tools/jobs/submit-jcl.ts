/**
 * `submit_jcl` — submit inline JCL for execution.
 */
import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { SubmitJobs, GetJobs } from '@zowe/zos-jobs-for-zowe-sdk';
import { ValidationError } from '../../utils/errors.js';
import { formatJobStatus, textResult } from '../../utils/formatters.js';
import { assertJclSizeAllowed } from '../../policy/rules.js';
import { normalizeJob } from './shared.js';
const inputShape = {
    jcl: z
        .string()
        .min(1)
        .describe('The complete inline JCL to submit (including the //JOB card).'),
    wait: z
        .boolean()
        .optional()
        .describe('Whether to wait for the job to complete execution before returning.'),
    timeout: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
            'Maximum time to wait in seconds (defaults to 30, max 300). Only used when wait=true.',
        ),
    jobClass: z
        .string()
        .length(1)
        .regex(/^[A-Z0-9]$/, 'Job class must be a single alphanumeric character (A-Z, 0-9).')
        .optional()
        .describe('Override the CLASS= parameter on the JOB card (single char, A-Z or 0-9).'),
    notify: z
        .string()
        .max(8)
        .regex(
            /^[A-Z0-9@#$]{1,8}$/i,
            'Notify user id must be 1–8 alphanumeric/national characters.',
        )
        .optional()
        .describe('Override the NOTIFY= parameter on the JOB card (TSO user id, max 8 chars).'),
};
/**
 * Attempt to rewrite a JOB card parameter in-place.
 * Returns the modified JCL and a note if the parameter was not found.
 */
function rewriteJobCardParam(jcl: string, param: string, value: string) {
    const regex = new RegExp(`(\\b${param}=)[^\\s,)]+`, 'i');
    if (regex.test(jcl)) {
        return { jcl: jcl.replace(regex, `$1${value}`), note: null };
    }
    return {
        jcl,
        note: `[Note: ${param}= parameter not found on JOB card; original JCL submitted unchanged for ${param}.]`,
    };
}

export const submitJclTool = defineTool({
    name: 'submit_jcl',
    description:
        'Submit inline JCL to JES for execution. Supports optional wait-for-completion polling, and JOB card CLASS/NOTIFY overrides.',
    input: inputShape,
    async run({ jcl, wait, timeout, jobClass, notify }, ctx) {
        let normalized = jcl.replace(/\r\n/g, '\n').trim();
        if (!/^\/\//.test(normalized)) {
            throw new ValidationError('JCL must begin with a "//" JOB statement.');
        }
        if (normalized.includes('\0')) {
            throw new ValidationError('JCL must not contain null characters.');
        }
        // Ensure at least one EXEC step follows the JOB card
        const linesAfterJob = normalized.split('\n').slice(1);
        const hasExec = linesAfterJob.some(
            (line) => /^\/\/\S*\s+EXEC\s/i.test(line) && !/^\/\/\*/.test(line),
        );
        if (!hasExec) {
            throw new ValidationError(
                'JCL must contain at least one EXEC statement after the JOB card.',
            );
        }
        assertJclSizeAllowed(ctx.config, normalized);
        const overrideNotes = [];
        if (jobClass) {
            const { jcl: patched, note } = rewriteJobCardParam(
                normalized,
                'CLASS',
                jobClass.toUpperCase(),
            );
            normalized = patched;
            if (note) overrideNotes.push(note);
        }
        if (notify) {
            const { jcl: patched, note } = rewriteJobCardParam(
                normalized,
                'NOTIFY',
                notify.toUpperCase(),
            );
            normalized = patched;
            if (note) overrideNotes.push(note);
        }
        const submitted = await SubmitJobs.submitJcl(ctx.session, normalized);
        let job = normalizeJob(submitted);
        ctx.logger.info({ jobId: job.jobId, jobName: job.jobName, jobClass, notify }, 'submit_jcl');
        const overrideSuffix = overrideNotes.length > 0 ? '\n\n' + overrideNotes.join('\n') : '';
        if (wait) {
            const timeoutSeconds = Math.min(timeout ?? 30, 300);
            const start = Date.now();
            while (job.status !== 'OUTPUT' && Date.now() - start < timeoutSeconds * 1000) {
                await new Promise((resolve) => setTimeout(resolve, 2000));
                const rawJob = await GetJobs.getJob(ctx.session, job.jobId);
                if (rawJob) {
                    job = normalizeJob(rawJob);
                }
            }
            const waitNote = `[Wait mode: polling every 2s, timeout ${timeoutSeconds}s]`;
            if (job.status === 'OUTPUT') {
                return textResult(
                    `Submitted successfully and completed execution.\n${waitNote}\n\n${formatJobStatus(job)}${overrideSuffix}`,
                );
            } else {
                return textResult(
                    `Submitted successfully but execution did not finish within ${timeoutSeconds} seconds.\n${waitNote}\n\n${formatJobStatus(job)}${overrideSuffix}`,
                );
            }
        }
        return textResult(`Submitted successfully.\n\n${formatJobStatus(job)}${overrideSuffix}`);
    },
});
