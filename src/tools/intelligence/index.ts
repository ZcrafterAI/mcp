/**
 * Intelligence / AI-assisted diagnostics tools registration.
 */
import type { ToolRegistrar } from '../../types/tools.js';
import { registerAnalyzeRootCauseTool } from './analyze-root-cause.js';
import { registerPredictFailuresTool } from './predict-failures.js';
export const registerIntelligenceTools: ToolRegistrar = (server, ctx) => {
    registerAnalyzeRootCauseTool(server, ctx);
    registerPredictFailuresTool(server, ctx);
    ctx.logger.debug('Registered intelligence tools');
};
