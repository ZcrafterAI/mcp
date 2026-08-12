/**
 * `get_job_output` — retrieve spool output for a job.
 *
 * With no `ddName`, returns the spool-file inventory (optionally filtered by step).
 * With a `ddName`, returns that DD's content (line-capped; optionally grep-filtered).
 */
import type { ToolRegistrar } from '../../types/tools.js';
import { z } from 'zod';
import { NotFoundError } from '../../utils/errors.js';
import { formatContentHeader, formatSpoolFiles, textResult, truncateLines, } from '../../utils/formatters.js';
import { securedHandler } from '../../utils/tool-handler.js';
import { assertValidJobId, fetchJob, fetchSpoolContent, fetchSpoolFiles, normalizeJobId } from './shared.js';
const inputShape = {
    jobId: z.string().min(1).describe('JES job id, e.g. "JOB01234".'),
    ddName: z
        .string()
        .optional()
        .describe('DD name (e.g. "JESMSGLG"). Omit to list available spool files.'),
    stepName: z
        .string()
        .optional()
        .describe('Filter spool inventory to files produced by this step name. Only used when ddName is omitted.'),
    searchText: z
        .string()
        .optional()
        .describe('When reading a DD, return only lines containing this text (case-insensitive grep). Applied before line capping.'),
    maxLines: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Maximum output lines returned (caps at server configuration maximum).'),
};
export const registerGetJobOutputTool: ToolRegistrar = (server, ctx) => {
    server.tool('get_job_output', 'Retrieve spool output for a job. Lists spool files (with optional step filter), or returns one DD content (with optional text grep and line cap).', inputShape, securedHandler(ctx, 'get_job_output', async ({ jobId, ddName, stepName, searchText, maxLines }) => {
        assertValidJobId(jobId);
        const normalizedId = normalizeJobId(jobId);
        const job = await fetchJob(ctx, normalizedId);
        let files = await fetchSpoolFiles(ctx, job.jobName, job.jobId);
        if (!ddName) {
            // Spool inventory mode — optionally filter by step
            if (stepName) {
                const upper = stepName.toUpperCase();
                files = files.filter((f) => (f.stepName ?? '').toUpperCase() === upper);
                if (files.length === 0) {
                    return textResult(`No spool files found for step "${stepName}" in ${job.jobName} (${job.jobId}).`);
                }
            }
            return textResult(formatSpoolFiles(job.jobName, job.jobId, files));
        }
        // Content mode — locate the DD
        const normalizedDd = ddName.toUpperCase();
        const match = files.find((file) => file.ddName.toUpperCase() === normalizedDd);
        if (!match) {
            const available = files.map((f) => f.ddName).join(', ') || '(none)';
            throw new NotFoundError(`DD "${ddName}" not found for ${job.jobName} (${job.jobId}).`, {
                available,
            });
        }
        let raw = await fetchSpoolContent(ctx, job.jobName, job.jobId, match.id);
        // Apply searchText grep before truncation
        let grepNote = '';
        if (searchText) {
            const lower = searchText.toLowerCase();
            const allLines = raw.split(/\r?\n/);
            const matched = allLines.filter((line) => line.toLowerCase().includes(lower));
            raw = matched.join('\n');
            grepNote = `\n[grep: "${searchText}" — ${matched.length} of ${allLines.length} lines matched]`;
        }
        const cap = Math.min(maxLines ?? ctx.config.limits.maxJobOutputLines, ctx.config.limits.maxJobOutputLines);
        const { text, truncated, totalLines } = truncateLines(raw, cap);
        ctx.logger.debug({ jobId: normalizedId, ddName: normalizedDd, totalLines, truncated, searchText }, 'get_job_output');
        const header = formatContentHeader(`Output of ${job.jobName} (${job.jobId}) DD=${match.ddName}`, truncated, totalLines, cap);
        return textResult(header + grepNote + (grepNote ? '\n' : '') + text);
    }));
};
