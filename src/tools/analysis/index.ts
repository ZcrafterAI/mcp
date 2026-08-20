/**
 * Deeper analysis.
 *
 * Correlate several failures at once: root-cause reports and which batch jobs
 * look most likely to fail next.
 */
import type { Tool } from '../define-tool.js';
import { analyzeRootCauseTool } from './analyze-root-cause.js';
import { predictBatchFailuresTool } from './predict-failures.js';

export const analysisTools: Tool[] = [analyzeRootCauseTool, predictBatchFailuresTool];
