/**
 * SMF tools registration.
 */
import type { ToolRegistrar } from '../../types/tools.js';
import { registerSmfMetricsTool } from './get-metrics.js';
export const registerSmfTools: ToolRegistrar = (server, ctx) => {
    registerSmfMetricsTool(server, ctx);
    ctx.logger.debug('Registered SMF tools');
};
