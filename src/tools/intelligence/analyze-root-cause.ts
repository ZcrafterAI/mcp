/**
 * `analyze_root_cause` — AI-assisted deep root-cause analysis for a failed job.
 *
 * Extends the basic failure analysis with:
 *   - Historical correlation (similar incidents & correlated abends)
 *   - Abend code reference look-up when a known code is identified
 *   - Normalized health score (0–100) for the surrounding environment
 *   - Prioritized, de-duplicated remediation action items
 */
import type { ToolRegistrar } from '../../types/tools.js';
import { z } from 'zod';
import { securedHandler } from '../../utils/tool-handler.js';
import { formatAbendInfo, formatAnalysisFull, formatStructuredResponse, renderTable, textResult, } from '../../utils/formatters.js';
import { lookupAbend } from '../../utils/abend-codes.js';
import { buildRootCauseReport } from './shared.js';
const inputShape = {
    jobId: z.string().min(1).describe('JES job id of the failed job to analyze, e.g. "JOB01234".'),
    lookbackHours: z
        .number()
        .int()
        .positive()
        .max(720)
        .optional()
        .describe('Hours of history for correlation. Defaults to 72 (3 days), max 720 (30 days).'),
};
export const registerAnalyzeRootCauseTool: ToolRegistrar = (server, ctx) => {
    server.tool('analyze_root_cause', 'Deep AI-assisted root-cause analysis: full failure details, abend reference, similar-incident correlation, correlated abends, health score, and prioritized action items.', inputShape, securedHandler(ctx, 'analyze_root_cause', async ({ jobId, lookbackHours }) => {
        const window = lookbackHours ?? 72;
        const report = await buildRootCauseReport(ctx, jobId, window);
        // --- Section: Full failure analysis (summary + evidence + remediation) ---
        const analysisFull = formatAnalysisFull(report.analysis, { includeEvidence: true });
        // --- Section: Abend reference (only when a known code exists) ---
        const abendInfo = report.analysis.abendCode
            ? lookupAbend(report.analysis.abendCode)
            : undefined;
        const abendSection = abendInfo
            ? formatAbendInfo(abendInfo)
            : report.analysis.abendCode
                ? `No reference entry available for ${report.analysis.abendCode}.`
                : 'No abend code detected.';
        // --- Section: Similar incidents ---
        const similarBody = report.similarIncidents.length > 0
            ? report.similarIncidents.map((line) => `  • ${line}`).join('\n')
            : '  No similar incidents in the look-back window.';
        // --- Section: Correlated abends ---
        const abendBody = report.correlatedAbends.length > 0
            ? renderTable(['Abend Code', 'Count', 'Description'], report.correlatedAbends.map((entry) => {
                const info = lookupAbend(entry.code);
                return [entry.code, String(entry.count), info?.title ?? '(no reference entry)'];
            }))
            : '  No correlated abends in the look-back window.';
        // --- Section: Action items ---
        const actionsBody = report.actionItems
            .map((item, index) => `${index + 1}. ${item}`)
            .join('\n');
        ctx.logger.debug({ jobId, confidence: report.confidence, healthScore: report.healthScore }, 'analyze_root_cause');
        return textResult(formatStructuredResponse(`Root Cause Analysis — ${report.analysis.job.jobName} (${report.analysis.job.jobId})`, [
            {
                heading: `Summary (confidence: ${report.confidence} | health score: ${report.healthScore}/100)`,
                body: report.summary,
            },
            { heading: 'Failure analysis', body: analysisFull },
            { heading: `Abend reference (${report.analysis.abendCode ?? 'N/A'})`, body: abendSection },
            { heading: `Similar incidents (${window}h look-back)`, body: similarBody },
            { heading: 'Correlated abends', body: abendBody },
            { heading: 'Recommended actions', body: actionsBody },
        ]));
    }));
};
