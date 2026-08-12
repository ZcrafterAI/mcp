/**
 * Security / RACF tools registration.
 */
import type { ToolRegistrar } from '../../types/tools.js';
import { registerQueryRacfAuditTool } from './query-racf-audit.js';
import { registerSecurityPostureTool } from './security-posture.js';
export const registerSecurityTools: ToolRegistrar = (server, ctx) => {
    registerQueryRacfAuditTool(server, ctx);
    registerSecurityPostureTool(server, ctx);
    ctx.logger.debug('Registered security tools');
};
