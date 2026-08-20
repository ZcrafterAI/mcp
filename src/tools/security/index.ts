/**
 * Security and audit.
 *
 * Review RACF audit records and check which of this server's own guardrails
 * are switched on.
 */
import type { Tool } from '../define-tool.js';
import { queryRacfAuditTool } from './query-racf-audit.js';
import { securityPostureSummaryTool } from './security-posture.js';

export const securityTools: Tool[] = [queryRacfAuditTool, securityPostureSummaryTool];
