/**
 * `investigate_incident` — full investigation bundle for a job incident.
 *
 * Combines status, failure analysis, the spool inventory, and (when relevant)
 * the diagnostic spool excerpts into a single response an AI agent can reason
 * over in one shot.
 *
 * Improvements over the original:
 *   - `maxExcerptLines` parameter lets callers control verbosity
 *   - Retrieves excerpts from ALL diagnostic DDs (not just the first), up to
 *     the configured spool-file limit, so agents get a richer picture
 *   - Surfaces the abend code reference title inline when available
 */
import type { ToolRegistrar } from '../../types/tools.js';
import { z } from 'zod';
import { securedHandler } from '../../utils/tool-handler.js';
import { formatAnalysisFull, formatSpoolFiles, formatStructuredResponse, textResult, truncateLines, } from '../../utils/formatters.js';
import { lookupAbend } from '../../utils/abend-codes.js';
import { analyzeJobFailure, fetchDiagnosticSpool, fetchSpoolFiles } from '../jobs/shared.js';
const inputShape = {
    jobId: z.string().min(1).describe('JES job id to investigate, e.g. "JOB01234".'),
    maxExcerptLines: z
        .number()
        .int()
        .positive()
        .max(500)
        .optional()
        .describe('Maximum lines to include from each diagnostic spool excerpt. Defaults to 80. Increase for a deeper view.'),
};
export const registerInvestigateTool: ToolRegistrar = (server, ctx) => {
    server.tool('investigate_incident', 'Assemble a full incident bundle for a job: status, root-cause analysis (with abend reference), complete spool inventory, and diagnostic excerpts from all relevant DDs.', inputShape, securedHandler(ctx, 'investigate_incident', async ({ jobId, maxExcerptLines }) => {
        const excerptLines = maxExcerptLines ?? 80;
        const analysis = await analyzeJobFailure(ctx, jobId);
        const job = analysis.job;
        const spoolFiles = await fetchSpoolFiles(ctx, job.jobName, job.jobId);
        // Rich failure analysis (summary + evidence + remediation)
        const analysisFull = formatAnalysisFull(analysis, { includeEvidence: true });
        // Inline abend code reference when we have a known code
        const abendInfo = analysis.abendCode ? lookupAbend(analysis.abendCode) : undefined;
        const abendReference = abendInfo
            ? `${abendInfo.code} — ${abendInfo.title}\n${abendInfo.suggestedFix}`
            : analysis.abendCode
                ? `Abend code ${analysis.abendCode} has no reference entry in the local catalog.`
                : 'No abend code detected.';
        const sections = [
            { heading: 'Failure analysis', body: analysisFull },
            {
                heading: `Abend reference (${analysis.abendCode ?? 'N/A'})`,
                body: abendReference,
            },
            {
                heading: 'Spool inventory',
                body: formatSpoolFiles(job.jobName, job.jobId, spoolFiles),
            },
        ];
        // Collect diagnostic excerpts from ALL relevant DDs (not just the first)
        if (analysis.abendCode || analysis.failedStep || analysis.cancelledStep) {
            const diags = await fetchDiagnosticSpool(ctx, job.jobName, job.jobId);
            for (const diag of diags) {
                const { text, truncated, totalLines } = truncateLines(diag.text, excerptLines);
                const suffix = truncated
                    ? `\n... [showing first ${excerptLines} of ${totalLines} lines — increase maxExcerptLines for more]`
                    : '';
                sections.push({
                    heading: `Diagnostic excerpt — ${diag.ddName}`,
                    body: text + suffix,
                });
            }
        }
        ctx.logger.debug({ jobId, abendCode: analysis.abendCode, excerptSections: sections.length }, 'investigate_incident');
        return textResult(formatStructuredResponse(`Incident Investigation — ${job.jobName} (${job.jobId})`, sections));
    }));
};
