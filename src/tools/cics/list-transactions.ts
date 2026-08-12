/**
 * `list_cics_transactions` — list transactions in a CICS region.
 */
import type { ToolRegistrar } from '../../types/tools.js';
import { z } from 'zod';
import { securedHandler } from '../../utils/tool-handler.js';
import { renderTable, textResult } from '../../utils/formatters.js';
import { assertValidApplid, listCicsTransactions, normalizeApplid } from './shared.js';
const inputShape = {
    region: z
        .string()
        .min(1)
        .describe('CICS region APPLID to query transactions for (max 8 chars).'),
    context: z
        .string()
        .optional()
        .describe('CMCI context. Defaults to CMCI_CONTEXT env var.'),
    tranPrefix: z
        .string()
        .optional()
        .describe('Filter to transactions starting with this prefix (e.g. "PAY"). Case-insensitive.'),
    status: z
        .string()
        .optional()
        .describe('Filter by transaction status, e.g. "ACTIVE", "INACTIVE".'),
    maxResults: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Maximum number of transactions to return after filtering.'),
};
export const registerListCicsTransactionsTool: ToolRegistrar = (server, ctx) => {
    server.tool('list_cics_transactions', 'List CICS transaction definitions installed in a region via CMCI. Supports prefix/status filters and result capping.', inputShape, securedHandler(ctx, 'list_cics_transactions', async ({ region, context, tranPrefix, status, maxResults }) => {
        assertValidApplid(region);
        const applid = normalizeApplid(region);
        let transactions = await listCicsTransactions(ctx, applid, context, tranPrefix, status);
        const total = transactions.length;
        if (maxResults != null && transactions.length > maxResults) {
            transactions = transactions.slice(0, maxResults);
        }
        if (transactions.length === 0) {
            const filters = [
                tranPrefix ? `prefix="${tranPrefix.toUpperCase()}"` : null,
                status ? `status="${status.toUpperCase()}"` : null,
            ].filter(Boolean).join(', ');
            return textResult(`No transactions found for region ${applid}${filters ? ` (${filters})` : ''}.`);
        }
        const rows = transactions.map((txn) => [
            txn.tranid,
            txn.program,
            txn.status ?? '—',
            txn.taskcount ?? '—',
            txn.priority ?? '—',
            txn.profile ?? '—',
        ]);
        const capNote = transactions.length < total ? ` (showing ${transactions.length} of ${total})` : '';
        const filterParts = [
            tranPrefix ? `prefix=${tranPrefix.toUpperCase()}` : null,
            status ? `status=${status.toUpperCase()}` : null,
        ].filter(Boolean);
        const filterLine = filterParts.length > 0 ? ` [${filterParts.join(', ')}]` : '';
        ctx.logger.debug({ region: applid, count: transactions.length, total, tranPrefix, status }, 'list_cics_transactions');
        return textResult(`CICS Transactions — ${applid}${filterLine} — ${transactions.length} found${capNote}\n\n` +
            renderTable(['Tran ID', 'Program', 'Status', 'Tasks', 'Priority', 'Profile'], rows));
    }));
};
