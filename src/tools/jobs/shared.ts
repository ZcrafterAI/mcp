/**
 * Shared job helpers.
 *
 * Normalizers (SDK -> domain types) and reusable fetch/analysis routines that
 * are consumed by the individual job tools AND by the operations tools (which
 * build higher-level workflows on top of job data).
 */
import type { IJob, IJobFile } from '@zowe/zos-jobs-for-zowe-sdk';
import type { Job, JobFailureAnalysis, JobStatus, SpoolFile } from '../../types/zos.js';
import type { ToolContext } from '../../types/tools.js';
import { GetJobs } from '@zowe/zos-jobs-for-zowe-sdk';
import { NotFoundError, ValidationError, normalizeError } from '../../utils/errors.js';
import { extractAbendCode, lookupAbend } from '../../parsers/abend-codes.js';
import { truncateLines } from '../../utils/formatters.js';
import { mapConcurrent, retryReadOnly } from '../../utils/async.js';
import { isFailedJob } from '../../utils/job-status.js';

export { isFailedJob };
/** DD names most likely to contain the failure narrative, in priority order. */
const DIAGNOSTIC_DDS = ['JESYSMSG', 'JESMSGLG', 'SYSOUT', 'SYSPRINT'];
/** Convert a raw SDK status into our normalized {@link JobStatus}. */
function normalizeStatus(status?: string): JobStatus {
    switch ((status ?? '').toUpperCase()) {
        case 'INPUT':
            return 'INPUT';
        case 'ACTIVE':
            return 'ACTIVE';
        case 'OUTPUT':
            return 'OUTPUT';
        default:
            return 'UNKNOWN';
    }
}
/** Normalize a Zowe `IJob` into our {@link Job} domain type. */
export function normalizeJob(job: IJob): Job {
    return {
        jobName: job.jobname,
        jobId: job.jobid,
        owner: job.owner,
        status: normalizeStatus(job.status),
        returnCode: job.retcode ?? null,
        class: job.class,
        subsystem: job.subsystem,
        phase: job['phase-name'],
    };
}
/** Normalize a Zowe `IJobFile` into our {@link SpoolFile} domain type. */
export function normalizeSpoolFile(file: IJobFile): SpoolFile {
    return {
        id: file.id,
        ddName: file.ddname,
        stepName: file.stepname ?? undefined,
        procStep: file.procstep ?? undefined,
        recordCount: file['record-count'] ?? undefined,
    };
}
/**
 * Normalise a JES job id: trim whitespace and convert to uppercase.
 * e.g. `job01234` → `JOB01234`.
 */
export function normalizeJobId(jobId: string): string {
    return jobId.trim().toUpperCase();
}
/**
 * Validate that a string looks like a JES job id (JOBnnnnn, STCnnnnn, TSUnnnnn).
 * Throws {@link ValidationError} if the format is unrecognised.
 */
export function assertValidJobId(jobId: string): void {
    const upper = normalizeJobId(jobId);
    // JES assigns ids with a 2–3-letter type prefix (JOB/STC/TSU) followed by 1–5 digits.
    if (!/^(?:JOB|STC|TSU)[0-9]{1,5}$/.test(upper)) {
        throw new ValidationError(
            `Invalid JES job id "${jobId}". Expected format: JOBnnnnn, STCnnnnn, or TSUnnnnn (e.g. JOB01234).`,
            { jobId },
        );
    }
}
/** Fetch a single raw job by JES id, mapping a miss to a {@link NotFoundError}. */
export async function fetchRawJob(ctx: ToolContext, jobId: string): Promise<IJob> {
    try {
        const job = await retryReadOnly(() => GetJobs.getJob(ctx.session, jobId));
        if (!job) throw new NotFoundError(`No job found with id ${jobId}.`, { jobId });
        return job;
    } catch (err) {
        if (err instanceof NotFoundError) throw err;
        const normalized = normalizeError(err);
        // Zowe returns a 4xx for unknown job ids; treat as not-found.
        if (/not\s*found|no jobs|404/i.test(normalized.message)) {
            throw new NotFoundError(`No job found with id ${jobId}.`, { jobId });
        }
        throw normalized;
    }
}
/** Fetch and normalize a single job by id. */
export async function fetchJob(ctx: ToolContext, jobId: string): Promise<Job> {
    return normalizeJob(await fetchRawJob(ctx, jobId));
}
/** List jobs by owner/prefix and normalize them. */
export async function listJobs(
    ctx: ToolContext,
    owner: string,
    prefix: string,
    options: { maxJobs?: number; activeOnly?: boolean } = {},
): Promise<Job[]> {
    const jobs = await retryReadOnly(() =>
        GetJobs.getJobsByParameters(ctx.session, {
            owner,
            prefix,
            maxJobs: options.maxJobs,
            status: options.activeOnly ? 'ACTIVE' : undefined,
        }),
    );
    return jobs.map(normalizeJob);
}
/** When JES returns multiple spool files for the same DD, keep the newest (highest id). */
export function latestSpoolFilesByDd(files: SpoolFile[]): SpoolFile[] {
    const latest = new Map<string, SpoolFile>();
    for (const file of files) {
        const key = file.ddName.toUpperCase();
        const current = latest.get(key);
        if (!current || file.id > current.id) {
            latest.set(key, file);
        }
    }
    return [...latest.values()];
}
/** Retrieve the normalized spool inventory of a job (one entry per DD, newest id). */
export async function fetchSpoolFiles(
    ctx: ToolContext,
    jobName: string,
    jobId: string,
): Promise<SpoolFile[]> {
    const files = await retryReadOnly(() => GetJobs.getSpoolFiles(ctx.session, jobName, jobId));
    return latestSpoolFilesByDd(files.map(normalizeSpoolFile));
}
/** Download the text content of a single spool file. */
export async function fetchSpoolContent(
    ctx: ToolContext,
    jobName: string,
    jobId: string,
    spoolId: number,
): Promise<string> {
    return retryReadOnly(() => GetJobs.getSpoolContentById(ctx.session, jobName, jobId, spoolId));
}
/** Try to pull the most diagnostic spool text for a job (capped by config). */
export async function fetchDiagnosticSpool(
    ctx: ToolContext,
    jobName: string,
    jobId: string,
    forceDd?: string,
): Promise<{ ddName: string; text: string }[]> {
    const files = await fetchSpoolFiles(ctx, jobName, jobId);
    let ordered;
    if (forceDd) {
        const upper = forceDd.toUpperCase();
        const match = files.find((f) => f.ddName.toUpperCase() === upper);
        ordered = match ? [match] : [];
    } else {
        ordered = files
            .filter((file) => DIAGNOSTIC_DDS.includes(file.ddName.toUpperCase()))
            .sort(
                (a, b) =>
                    DIAGNOSTIC_DDS.indexOf(a.ddName.toUpperCase()) -
                    DIAGNOSTIC_DDS.indexOf(b.ddName.toUpperCase()),
            )
            .slice(0, ctx.config.limits.maxJesSpoolFiles);
    }
    return mapConcurrent(ordered, ctx.config.limits.maxConcurrentRequests, async (file) => {
        const text = await fetchSpoolContent(ctx, jobName, jobId, file.id);
        return { ddName: file.ddName, text };
    });
}
/** Max lines of spool text to scan when inferring a failing step quickly. */
const QUICK_STEP_SCAN_LINES = 250;
/**
 * Fetch a single diagnostic spool DD and infer the failing step without a full
 * analysis pass. Used by list-style tools to avoid downloading every DD.
 */
export async function fetchQuickFailureStep(
    ctx: ToolContext,
    jobName: string,
    jobId: string,
): Promise<string | null> {
    const files = await fetchSpoolFiles(ctx, jobName, jobId);
    const diagnostic = files
        .filter((file) => DIAGNOSTIC_DDS.includes(file.ddName.toUpperCase()))
        .sort(
            (a, b) =>
                DIAGNOSTIC_DDS.indexOf(a.ddName.toUpperCase()) -
                DIAGNOSTIC_DDS.indexOf(b.ddName.toUpperCase()),
        )[0];
    if (!diagnostic) return null;
    const raw = await fetchSpoolContent(ctx, jobName, jobId, diagnostic.id);
    const { text } = truncateLines(raw, QUICK_STEP_SCAN_LINES);
    return findFailedStep(text);
}
/** Heuristically find the failing step name from spool messages. */
export function findFailedStep(text: string): string | null {
    // IEF450I jobname stepname procstep - ABEND ...
    const ief450 = text.match(/IEF450I\s+\S+\s+(\S+)(?:\s+(\S+))?\s+-\s+ABEND/i);
    if (ief450) return ief450[1];
    // Generic "STEP WAS EXECUTED" / completion lines
    const stepCc = text.match(/IEF142I\s+\S+\s+(\S+)\s+.*COND CODE\s+(\d+)/i);
    if (stepCc && Number(stepCc[2]) >= 8) return stepCc[1];
    return null;
}
/**
 * Heuristically find the step name where an operator cancellation occurred.
 * Detects IEF473I messages emitted when a job is cancelled.
 */
export function findCancelledStep(text: string): string | null {
    // IEF473I jobname stepname [procstep] CANCELLED
    const ief473 = text.match(/IEF473I\s+\S+\s+(\S+)(?:\s+\S+)?\s+CANCEL/i);
    if (ief473) return ief473[1];
    // JCANCELLED or CANCELLED in step-level messages
    const cancelLine = text.match(/STEP\s+(\S+)\s+(?:WAS\s+)?CANCEL/i);
    if (cancelLine) return cancelLine[1];
    return null;
}
/** Heuristically find a referenced program/module name from spool messages. */
export function findFailedProgram(text: string): string | null {
    // MODULE modname NOT FOUND
    const notFound = text.match(/MODULE\s+([A-Z0-9#@$]{1,8})\s+NOT FOUND/i);
    if (notFound) return notFound[1];
    // IEF2851 program not found
    const ief285 = text.match(/IEF285I\s+([A-Z0-9#@$]{1,8})\s+NOT FOUND/i);
    if (ief285) return ief285[1];
    // CSV003I / CSV series — target the last all-caps word on the line (typically the module name)
    const csv = text.match(/CSV0\d\dI[^\n]*\bLOAD\s+([A-Z0-9#@$]{1,8})\b/i);
    if (csv) return csv[1];
    return null;
}
/**
 * Pull the spool lines most relevant to the failure as supporting evidence.
 * De-duplicates and caps at 5 lines; abend-code lines are prioritised first.
 */
export function collectEvidence(text: string, abendCode: string | null): string[] {
    const lines = text.split(/\r?\n/);
    const matches = lines.filter((line) =>
        /ABEND|IEF450I|IEF142I|IEF473I|IEC|IGZ|CSV0|S0C[0-9A-F]|COND CODE/.test(line),
    );
    if (abendCode) {
        const direct = lines.filter((line) => line.toUpperCase().includes(abendCode));
        matches.unshift(...direct);
    }
    // De-dupe while preserving order, keep it short.
    return [...new Set(matches.map((l) => l.trim()).filter(Boolean))].slice(0, 5);
}
/**
 * Pure analysis function — builds a {@link JobFailureAnalysis} from a pre-fetched
 * job record and spool texts. No I/O; fully unit-testable without mocking z/OSMF.
 */
export function analyzeJobFailureFromText(
    job: Job,
    spoolTexts: {
        ddName: string;
        text: string;
    }[],
): JobFailureAnalysis {
    const combined = spoolTexts.map((s) => s.text).join('\n');
    const abendCode = extractAbendCode(job.returnCode ?? '') ?? extractAbendCode(combined);
    const failedStep = findFailedStep(combined);
    const cancelledStep = findCancelledStep(combined);
    const failedProgram = findFailedProgram(combined);
    const evidence = collectEvidence(combined, abendCode);
    const abendInfo = abendCode ? lookupAbend(abendCode) : undefined;
    let reason;
    let suggestedFix;
    if (abendInfo) {
        reason = `${abendInfo.title} — ${abendInfo.explanation}`;
        suggestedFix = abendInfo.suggestedFix;
    } else if (abendCode) {
        reason = `Job ended with code ${abendCode}. No reference entry is available for this code.`;
        suggestedFix =
            'Review the spool output around the failing step for the specific message text.';
    } else if (cancelledStep) {
        reason = `Job was cancelled during step ${cancelledStep}.`;
        suggestedFix =
            'Check the operator log (OPERLOG) or JES message log for the cancellation reason.';
    } else if (isFailedJob(job)) {
        reason = `Job ended unsuccessfully with status "${job.returnCode ?? job.status}".`;
        suggestedFix = 'Inspect JESYSMSG/JESMSGLG for the first error or condition-code message.';
    } else {
        reason = 'No failure indicators were found; the job may have completed normally.';
        suggestedFix = 'Confirm the job actually failed before investigating further.';
    }
    return {
        job,
        abendCode,
        failedStep,
        cancelledStep,
        failedProgram,
        reason,
        evidence,
        suggestedFix,
    };
}
/**
 * Analyze a (presumed failed) job: locate the abend code, failing step/program,
 * and a remediation hint from the diagnostic spool output.
 */
export async function analyzeJobFailure(
    ctx: ToolContext,
    jobId: string,
    forceDd?: string,
): Promise<JobFailureAnalysis> {
    const job = await fetchJob(ctx, jobId);
    const spool = await fetchDiagnosticSpool(ctx, job.jobName, job.jobId, forceDd);
    return analyzeJobFailureFromText(job, spool);
}
