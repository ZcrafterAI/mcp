/**
 * CICS regions.
 *
 * Look at CICS — the transaction system that runs interactive workloads.
 */
import type { Tool } from '../define-tool.js';
import { listCicsRegionsTool } from './list-regions.js';
import { getCicsRegionStatusTool } from './region-status.js';
import { listCicsTransactionsTool } from './list-transactions.js';

export const cicsTools: Tool[] = [
    listCicsRegionsTool,
    getCicsRegionStatusTool,
    listCicsTransactionsTool,
];
