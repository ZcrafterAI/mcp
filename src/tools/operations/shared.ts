/**
 * Shared operations helpers.
 *
 * Higher-level workflows composed from the job tools: finding failed jobs in a
 * window, aggregating abends, and assembling incident bundles.
 */
import type { Job } from '../../types/zos.js';
import type { ToolContext } from '../../types/tools.js';
import { GetJobs } from '@zowe/zos-jobs-for-zowe-sdk';
import { extractAbendCode } from '../../utils/abend-codes.js';
import { isFailedJob, normalizeJob } from '../jobs/shared.js';

/** A failed job enriched with the abend code parsed from its return code. */
export interface FailedJobSummary {
    job: Job;
    abendCode: string | null;
    endedAt: number | null;
}

/** Parse the `exec-ended` timestamp from a raw job, if present. */
function execEndedMillis(raw: { 'exec-ended'?: string }): number | null {
    const value = raw['exec-ended'];
    if (!value)
        return null;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
}
/**
 * Find failed jobs in the output queue within the last `hours`.
 *
 * Only jobs with an `exec-ended` timestamp inside the window are returned so
 * stale OUTPUT entries without timing metadata are not misreported as recent.
 */
export async function findFailedJobs(ctx: ToolContext, hours: number, owner: string = '*'): Promise<FailedJobSummary[]> {
    const raws = await GetJobs.getJobsByOwnerAndPrefix(ctx.session, owner, '*');
    const cutoff = Date.now() - hours * 60 * 60 * 1000;
    const maxResults = ctx.config.limits.maxFailedJobResults;
    const summaries = [];
    for (const raw of raws) {
        const job = normalizeJob(raw);
        if (job.status !== 'OUTPUT' || !isFailedJob(job))
            continue;
        const ended = execEndedMillis(raw);
        if (ended == null || ended < cutoff)
            continue;
        summaries.push({
            job,
            abendCode: extractAbendCode(job.returnCode ?? ''),
            endedAt: ended,
        });
    }
    return summaries.sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0)).slice(0, maxResults);
}
/** Aggregate failed jobs by abend code. */
export function aggregateAbends(summaries: FailedJobSummary[]): { code: string; count: number; jobs: string[]; }[] {
    const buckets = new Map();
    for (const summary of summaries) {
        const code = summary.abendCode ?? (summary.job.returnCode ?? 'UNKNOWN');
        const list = buckets.get(code) ?? [];
        list.push(`${summary.job.jobName} (${summary.job.jobId})`);
        buckets.set(code, list);
    }
    return [...buckets.entries()]
        .map(([code, jobs]) => ({ code, count: jobs.length, jobs }))
        .sort((a, b) => b.count - a.count);
}
