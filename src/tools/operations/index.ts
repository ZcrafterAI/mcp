/**
 * Day-to-day operations.
 *
 * The questions an operator asks: what broke, how often, and is the system
 * healthy right now.
 */
import type { Tool } from '../define-tool.js';
import { findFailedJobsTool } from './failed-jobs.js';
import { summarizeAbendsTool } from './abend-summary.js';
import { systemHealthSummaryTool } from './system-health.js';
import { investigateIncidentTool } from './investigate.js';
import { lookupAbendCodeTool } from './lookup-abend.js';
import { verifyZosmfConnectionTool } from './verify-connection.js';
import { compareJobsTool } from './compare-jobs.js';
import { getUserJobsSummaryTool } from './user-jobs-summary.js';

export const operationsTools: Tool[] = [
    findFailedJobsTool,
    summarizeAbendsTool,
    systemHealthSummaryTool,
    investigateIncidentTool,
    lookupAbendCodeTool,
    verifyZosmfConnectionTool,
    compareJobsTool,
    getUserJobsSummaryTool,
];
