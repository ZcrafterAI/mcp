/**
 * `predict_batch_failures` — predictive batch failure risk scoring.
 *
 * Uses a recency-weighted algorithm to score batch jobs based on their failure
 * history. Jobs with more recent failures are scored higher than those with
 * older failures of the same total count.
 */
import type { ToolRegistrar } from '../../types/tools.js';
import { z } from 'zod';
import { securedHandler } from '../../utils/tool-handler.js';
import { formatStructuredResponse, renderTable, textResult } from '../../utils/formatters.js';
import { predictBatchFailures } from './shared.js';
const inputShape = {
    hours: z
        .number()
        .int()
        .positive()
        .max(720)
        .optional()
        .describe('Historical look-back window in hours. Defaults to 168 (7 days), max 720 (30 days).'),
    minFailures: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Minimum number of failures a job must have in the window to appear in the report. Defaults to 1.'),
};
export const registerPredictFailuresTool: ToolRegistrar = (server, ctx) => {
    server.tool('predict_batch_failures', 'Predict batch failure risk by scoring job names with recurring failures using a recency-weighted algorithm. Returns risk levels (LOW/MEDIUM/HIGH/CRITICAL), failure trends, and top abend codes.', inputShape, securedHandler(ctx, 'predict_batch_failures', async ({ hours, minFailures }) => {
        const window = hours ?? 168;
        const threshold = minFailures ?? 1;
        const risks = await predictBatchFailures(ctx, window, threshold);
        if (risks.length === 0) {
            return textResult(`Predictive Batch Failure Analysis — Last ${window} Hours\n\nNo recurring batch failures detected (min failures threshold: ${threshold}).`);
        }
        const critical = risks.filter((r) => r.riskLevel === 'CRITICAL');
        const high = risks.filter((r) => r.riskLevel === 'HIGH');
        const medium = risks.filter((r) => r.riskLevel === 'MEDIUM');
        const overview = renderTable(['Metric', 'Value'], [
            ['Jobs analyzed', String(risks.length)],
            ['Critical risk', String(critical.length)],
            ['High risk', String(high.length)],
            ['Medium risk', String(medium.length)],
            ['Look-back window', `${window} hours`],
            ['Min failures threshold', String(threshold)],
        ]);
        const riskTable = renderTable(['Job Name', 'Risk', 'Score', 'Failures', 'Top Abend', 'Abend Description', 'Trend'], risks.map((risk) => [
            risk.jobName,
            risk.riskLevel,
            String(risk.riskScore),
            String(risk.failureCount),
            risk.topAbend ?? '—',
            risk.topAbendDescription ?? '—',
            risk.trend,
        ]));
        const urgentRisks = risks.filter((r) => r.riskLevel === 'CRITICAL' || r.riskLevel === 'HIGH');
        const recommendations = urgentRisks
            .slice(0, 5)
            .map((r) => `• ${r.jobName} [${r.riskLevel}]: ${r.recommendation}`)
            .join('\n');
        const increasingTrend = risks
            .filter((r) => r.trend === 'INCREASING')
            .map((r) => `  ${r.jobName} (${r.riskLevel}, score ${r.riskScore})`)
            .join('\n');
        const trendBody = increasingTrend.length > 0
            ? `Jobs with INCREASING failure trend:\n${increasingTrend}`
            : 'No jobs show an increasing failure trend in this window.';
        ctx.logger.debug({ window, jobs: risks.length, critical: critical.length, high: high.length }, 'predict_batch_failures');
        return textResult(formatStructuredResponse('Predictive Batch Failure Analysis', [
            { heading: 'Overview', body: overview },
            { heading: 'Risk ranking', body: riskTable },
            {
                heading: 'Priority recommendations',
                body: recommendations || 'No high-risk or critical jobs require immediate action.',
            },
            { heading: 'Trend analysis', body: trendBody },
        ]));
    }));
};
