/**
 * Batch jobs.
 *
 * Submit JCL, then follow a job through the queue: status, spool output, and
 * why it failed.
 */
import type { Tool } from '../define-tool.js';
import { listJobsTool } from './list-jobs.js';
import { getJobStatusTool } from './get-job-status.js';
import { getJobOutputTool } from './get-job-output.js';
import { submitJclTool } from './submit-jcl.js';
import { analyzeJobFailureTool } from './analyze-failure.js';
import { getJobJclTool } from './get-job-jcl.js';

export const jobTools: Tool[] = [
    listJobsTool,
    getJobStatusTool,
    getJobOutputTool,
    submitJclTool,
    analyzeJobFailureTool,
    getJobJclTool,
];
