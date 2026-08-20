/**
 * AI-assisted diagnostics and predictive failure analysis.
 *
 * These tools enrich job failure data with correlation, historical patterns,
 * and risk scoring — producing structured output optimized for LLM reasoning.
 * No external AI API is called; the MCP client agent interprets the report.
 */
import type { FailureRisk, RootCauseReport } from '../../types/zos.js';
import type { FailedJobSummary } from '../operations/shared.js';
import type { ToolContext } from '../../types/tools.js';
import { lookupAbend } from '../../parsers/abend-codes.js';
import { analyzeJobFailure } from '../jobs/shared.js';
import { aggregateAbends, findFailedJobs } from '../operations/shared.js';
// ---------------------------------------------------------------------------
// Root-cause report
// ---------------------------------------------------------------------------
/**
 * Compute a 0-100 health score for the environment given the recent failure
 * context.  100 = no correlated failures, 0 = systemic / many failures.
 */
function computeHealthScore(
    similarIncidentCount: number,
    correlatedAbendCount: number,
    confidence: RootCauseReport['confidence'],
): number {
    let score = 100;
    // Each similar incident reduces score
    score -= Math.min(similarIncidentCount * 8, 40);
    // Correlated abends indicate a systemic issue
    score -= Math.min(correlatedAbendCount * 5, 30);
    // Low confidence means less signal — reward with a partial score floor
    if (confidence === 'LOW') score = Math.max(score, 60);
    if (confidence === 'MEDIUM') score = Math.max(score, 30);
    return Math.max(0, Math.round(score));
}
/** Build an extended root-cause report for a failed job. */
export async function buildRootCauseReport(
    ctx: ToolContext,
    jobId: string,
    lookbackHours: number = 72,
): Promise<RootCauseReport> {
    const analysis = await analyzeJobFailure(ctx, jobId);
    const recentFailures = await findFailedJobs(ctx, lookbackHours, '*');
    const sameJob = recentFailures.filter(
        (f) => f.job.jobName === analysis.job.jobName && f.job.jobId !== analysis.job.jobId,
    );
    const sameAbend = recentFailures.filter(
        (f) => f.abendCode && f.abendCode === analysis.abendCode,
    );
    const similarIncidents = sameJob
        .slice(0, 5)
        .map(
            (f) =>
                `${f.job.jobName} (${f.job.jobId}) — ${f.abendCode ?? f.job.returnCode ?? 'failed'}`,
        );
    const correlatedAbends = aggregateAbends(recentFailures)
        .slice(0, 5)
        .map((entry) => ({ code: entry.code, count: entry.count }));
    const actionItems = [analysis.suggestedFix];
    const abendInfo = analysis.abendCode ? lookupAbend(analysis.abendCode) : undefined;
    if (abendInfo) {
        for (const cause of abendInfo.commonCauses.slice(0, 2)) {
            actionItems.push(`Check: ${cause}`);
        }
    }
    if (sameJob.length >= 2) {
        actionItems.push(
            `Recurring failure: ${analysis.job.jobName} failed ${sameJob.length + 1} times in ${lookbackHours}h — investigate environment or input data drift.`,
        );
    }
    if (sameAbend.length >= 3) {
        actionItems.push(
            `Systemic abend ${analysis.abendCode} seen ${sameAbend.length} times recently — may indicate a shared dependency or infrastructure issue.`,
        );
    }
    // JCL-error branch
    if ((analysis.job.returnCode ?? '').toUpperCase().includes('JCL ERROR')) {
        actionItems.push(
            'JCL error detected — review the JESMSGLG spool DD for the specific syntax or allocation message.',
        );
    }
    let confidence: RootCauseReport['confidence'] = 'LOW';
    if (analysis.abendCode && analysis.failedStep && analysis.evidence.length > 0) {
        confidence = 'HIGH';
    } else if (analysis.abendCode || analysis.failedStep) {
        confidence = 'MEDIUM';
    }
    const summary = [
        analysis.abendCode ? `Abend ${analysis.abendCode}` : 'Failure detected',
        analysis.failedStep ? `in step ${analysis.failedStep}` : '',
        abendInfo ? `— ${abendInfo.title}` : '',
        sameJob.length > 0 ? `(${sameJob.length} similar incident(s) in ${lookbackHours}h)` : '',
    ]
        .filter(Boolean)
        .join(' ');
    const healthScore = computeHealthScore(sameJob.length, correlatedAbends.length, confidence);
    return {
        analysis,
        confidence,
        healthScore,
        similarIncidents,
        correlatedAbends,
        actionItems: [...new Set(actionItems)],
        summary,
    };
}
// ---------------------------------------------------------------------------
// Predictive failure analysis
// ---------------------------------------------------------------------------
/**
 * Detect trend direction for a job's failures.
 * Splits the time-ordered list into three equal thirds and compares the
 * oldest-third count to the newest-third count (more accurate than a simple
 * half-split when there are many samples).
 */
function detectTrend(failures: FailedJobSummary[]): FailureRisk['trend'] {
    const count = failures.length;
    if (count < 3) return 'STABLE';
    const third = Math.ceil(count / 3);
    const oldCount = failures.slice(0, third).length;
    const newCount = failures.slice(count - third).length;
    // Use a 20 % delta threshold to avoid noise flipping the label
    const delta = newCount - oldCount;
    const threshold = Math.max(1, Math.round(oldCount * 0.2));
    if (delta >= threshold) return 'INCREASING';
    if (delta <= -threshold) return 'DECREASING';
    return 'STABLE';
}
/**
 * Recency-weighted risk score (0-100).
 *
 * Each failure contributes a weight based on how recently it occurred
 * relative to the look-back window.  Failures in the last quarter of the
 * window are worth 3×, last half 2×, remainder 1×.  Having a known abend
 * code adds a flat +10.
 */
function recencyWeightedScore(failures: FailedJobSummary[], windowMs: number): number {
    const now = Date.now();
    const quarterMs = windowMs / 4;
    const halfMs = windowMs / 2;
    let weighted = 0;
    for (const f of failures) {
        const age = f.endedAt != null ? now - f.endedAt : windowMs; // treat unknown as oldest
        if (age <= quarterMs) weighted += 3;
        else if (age <= halfMs) weighted += 2;
        else weighted += 1;
    }
    const abendBonus = failures.some((f) => f.abendCode) ? 10 : 0;
    return Math.min(100, Math.round(weighted * 8 + abendBonus));
}
/** Score batch jobs for predicted failure risk based on recent history. */
export async function predictBatchFailures(
    ctx: ToolContext,
    hours: number = 168,
    minFailures: number = 1,
): Promise<FailureRisk[]> {
    const failures = await findFailedJobs(ctx, hours, '*');
    const byJob = new Map<string, FailedJobSummary[]>();
    for (const summary of failures) {
        const list = byJob.get(summary.job.jobName) ?? [];
        list.push(summary);
        byJob.set(summary.job.jobName, list);
    }
    const windowMs = hours * 60 * 60 * 1000;
    const risks: FailureRisk[] = [];
    for (const [jobName, jobFailures] of byJob.entries()) {
        const count = jobFailures.length;
        if (count < minFailures) continue;
        const abendCounts = aggregateAbends(jobFailures);
        const topAbend = abendCounts[0]?.code ?? null;
        const topAbendInfo = topAbend ? lookupAbend(topAbend) : undefined;
        const riskScore = recencyWeightedScore(jobFailures, windowMs);
        let riskLevel: FailureRisk['riskLevel'] = 'LOW';
        if (riskScore >= 75) riskLevel = 'CRITICAL';
        else if (riskScore >= 50) riskLevel = 'HIGH';
        else if (riskScore >= 25) riskLevel = 'MEDIUM';
        const trend = detectTrend(jobFailures);
        // Timestamp of most recent failure
        const lastOccurrence = jobFailures.reduce<number | null>((best, f) => {
            if (f.endedAt == null) return best;
            return best == null || f.endedAt > best ? f.endedAt : best;
        }, null);
        let recommendation = 'Monitor during next scheduled run.';
        if (riskLevel === 'CRITICAL') {
            recommendation = `URGENT: ${jobName} is at critical risk (${count} failures in ${hours}h, top abend ${topAbend ?? 'unknown'}). Investigate before next run.`;
        } else if (riskLevel === 'HIGH') {
            recommendation = `Investigate ${jobName} before next run; top abend ${topAbend ?? 'unknown'} occurred ${count} times in ${hours}h.`;
        } else if (trend === 'INCREASING') {
            recommendation = `Failure rate for ${jobName} is increasing — review recent changes and input volumes.`;
        }
        risks.push({
            jobName,
            riskScore,
            riskLevel,
            failureCount: count,
            topAbend,
            topAbendDescription: topAbendInfo?.title ?? null,
            lastOccurrence,
            trend,
            recommendation,
        });
    }
    return risks.sort((a, b) => b.riskScore - a.riskScore).slice(0, 25);
}
