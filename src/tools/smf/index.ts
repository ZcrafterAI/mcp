/**
 * Performance metrics.
 *
 * Read the system's own performance records (SMF/RMF).
 */
import type { Tool } from '../define-tool.js';
import { getSmfMetricsTool } from './get-metrics.js';

export const smfTools: Tool[] = [getSmfMetricsTool];
