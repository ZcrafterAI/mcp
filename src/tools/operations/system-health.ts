/**
 * `system_health_summary` — high-level operational health snapshot.
 *
 * Improvements over the original:
 *   - `lookbackHours` parameter to optionally scope to recent failures only
 *   - CRITICAL tier at ≥ 5 failures (was already there) + percentage health
 *   - Abend description column in the top-abend table
 *   - Per-owner failure breakdown when multiple owners have failures
 *   - Overall status emits as HEALTHY / DEGRADED / CRITICAL
 */
import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { GetJobs } from '@zowe/zos-jobs-for-zowe-sdk';
import { formatStructuredResponse, renderTable, textResult } from '../../utils/formatters.js';
import { isFailedJob, normalizeJob } from '../jobs/shared.js';
import { aggregateAbends, findFailedJobs } from './shared.js';
import { extractAbendCode, lookupAbend } from '../../parsers/abend-codes.js';
const inputShape = {
    lookbackHours: z
        .number()
        .int()
        .positive()
        .max(720)
        .optional()
        .describe(
            'Scope the failed-job analysis to jobs that ended within this many hours. ' +
                'When omitted, all OUTPUT-status jobs with failure return codes are counted ' +
                '(no time filter). Set this to e.g. 24 to see only failures in the last day.',
        ),
};

export const systemHealthSummaryTool = defineTool({
    name: 'system_health_summary',
    description:
        'Produce a high-level operational health snapshot: overall status (HEALTHY/DEGRADED/CRITICAL), active and queued jobs, recent failure count, top abend codes with descriptions, and per-owner failure breakdown.',
    input: inputShape,
    async run({ lookbackHours }, ctx) {
        // Always fetch the live job queue for counts
        const raws = await GetJobs.getJobsByOwnerAndPrefix(ctx.session, '*', '*');
        const jobs = raws.map(normalizeJob);
        const active = jobs.filter((job) => job.status === 'ACTIVE');
        const inputQ = jobs.filter((job) => job.status === 'INPUT');
        // For failure analysis, use time-windowed query when lookbackHours is provided
        let failedSummaries;
        let windowLabel;
        if (lookbackHours != null) {
            failedSummaries = await findFailedJobs(ctx, lookbackHours, '*');
            windowLabel = `${lookbackHours}h window`;
        } else {
            // Fallback: scan the current job queue for failure indicators
            const failed = jobs.filter(isFailedJob);
            failedSummaries = failed.map((job) => ({
                job,
                abendCode: extractAbendCode(job.returnCode ?? ''),
                endedAt: null,
            }));
            windowLabel = 'all visible jobs';
        }
        const topAbends = aggregateAbends(failedSummaries).slice(0, 5);
        // Health thresholds
        const failedCount = failedSummaries.length;
        let status = 'HEALTHY';
        if (failedCount >= 5) status = 'CRITICAL';
        else if (failedCount > 0) status = 'DEGRADED';
        // Approximate health % (100 = no failures, down by 10 per failure, floor 0)
        const healthPct = Math.max(0, 100 - failedCount * 10);
        const overview = renderTable(
            ['Metric', 'Value'],
            [
                ['Overall status', `${status} (health: ${healthPct}%)`],
                ['Scope', windowLabel],
                ['Total jobs visible', String(jobs.length)],
                ['Active (running)', String(active.length)],
                ['Queued (INPUT)', String(inputQ.length)],
                ['Failed', String(failedCount)],
            ],
        );
        const abendBody =
            topAbends.length === 0
                ? 'No failed jobs with recognizable abend codes.'
                : renderTable(
                      ['Abend Code', 'Count', 'Description', 'Affected Jobs'],
                      topAbends.map((entry) => {
                          const info = lookupAbend(entry.code);
                          const jobList =
                              entry.jobs.slice(0, 3).join(', ') +
                              (entry.jobs.length > 3 ? ` +${entry.jobs.length - 3} more` : '');
                          return [
                              entry.code,
                              String(entry.count),
                              info?.title ?? '(no reference entry)',
                              jobList,
                          ];
                      }),
                  );
        // Per-owner failure breakdown (top 5 owners)
        const ownerCounts = new Map<string, number>();
        for (const { job } of failedSummaries) {
            ownerCounts.set(job.owner, (ownerCounts.get(job.owner) ?? 0) + 1);
        }
        const ownerRows = [...ownerCounts.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([owner, count]) => [owner, String(count)]);
        const ownerBody =
            ownerRows.length === 0
                ? 'No owners with failed jobs.'
                : renderTable(['Owner', 'Failed Jobs'], ownerRows);
        ctx.logger.debug({ status, failed: failedCount, lookbackHours }, 'system_health_summary');
        return textResult(
            formatStructuredResponse('System Health Summary', [
                { heading: 'Overview', body: overview },
                { heading: 'Top abend codes', body: abendBody },
                { heading: 'Failures by owner', body: ownerBody },
            ]),
        );
    },
});
