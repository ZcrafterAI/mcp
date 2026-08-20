/**
 * Did a job fail?
 *
 * JES does not answer this with a boolean — it hands back a string such as
 * `CC 0000`, `JCL ERROR`, or `ABEND S806`. This is the one place that decides
 * what those strings mean, so the tools and the output formatters can never
 * disagree about whether a job succeeded.
 */
import type { Job } from '../types/zos.js';

/** Return-code text that always means failure. */
const FAILURE_TEXT = /ABEND|JCL ERROR|SEC ERROR|CANCEL/;

/** A completion code at or above this is conventionally treated as a failure. */
const FAILING_CONDITION_CODE = 8;

/**
 * True when a job's return code indicates failure. A job still running has no
 * return code yet and is not counted as failed.
 */
export function isFailedJob(job: Job): boolean {
    const returnCode = (job.returnCode ?? '').toUpperCase();
    if (!returnCode) return false;
    if (FAILURE_TEXT.test(returnCode)) return true;

    const conditionCode = returnCode.match(/CC\s+(\d+)/);
    return conditionCode ? Number(conditionCode[1]) >= FAILING_CONDITION_CODE : false;
}
