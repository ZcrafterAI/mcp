/**
 * Job tools registration.
 *
 * Aggregates every `jobs/*` tool behind a single registrar and re-exports the
 * shared job helpers consumed by the operations tools.
 */
import type { ToolRegistrar } from '../../types/tools.js';
import { registerListJobsTool } from './list-jobs.js';
import { registerGetJobStatusTool } from './get-job-status.js';
import { registerGetJobOutputTool } from './get-job-output.js';
import { registerSubmitJclTool } from './submit-jcl.js';
import { registerAnalyzeFailureTool } from './analyze-failure.js';
import { registerGetJobJclTool } from './get-job-jcl.js';
export const registerJobTools: ToolRegistrar = (server, ctx) => {
    registerListJobsTool(server, ctx);
    registerGetJobStatusTool(server, ctx);
    registerGetJobOutputTool(server, ctx);
    registerSubmitJclTool(server, ctx);
    registerAnalyzeFailureTool(server, ctx);
    registerGetJobJclTool(server, ctx);
    ctx.logger.debug('Registered job tools');
};
export * from './shared.js';
