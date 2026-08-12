/**
 * `summarize_abends` — aggregate abend codes across recent jobs.
 */
import type { ToolRegistrar } from '../../types/tools.js';
import { z } from 'zod';
import { securedHandler } from '../../utils/tool-handler.js';
import { formatStructuredResponse, renderTable, textResult } from '../../utils/formatters.js';
import { lookupAbend } from '../../utils/abend-codes.js';
import { aggregateAbends, findFailedJobs } from './shared.js';
const inputShape = {
    hours: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Look-back window in hours. Defaults to 24.'),
    owner: z.string().optional().describe('Owner filter. Defaults to "*" (all owners).'),
};
export const registerAbendSummaryTool: ToolRegistrar = (server, ctx) => {
    server.tool('summarize_abends', 'Aggregate abend codes across recent failed jobs, with counts and a short description.', inputShape, securedHandler(ctx, 'mainframe_summarize_abends', async ({ hours, owner }) => {
        const window = hours ?? 24;
        const failures = await findFailedJobs(ctx, window, owner ?? '*');
        const aggregated = aggregateAbends(failures);
        if (aggregated.length === 0) {
            return textResult(`Abend Summary — Last ${window} Hours (no failures found)`);
        }
        const rows = aggregated.map((entry) => {
            const info = lookupAbend(entry.code);
            return [entry.code, String(entry.count), info?.title ?? '(no reference entry)'];
        });
        ctx.logger.debug({ window, codes: aggregated.length }, 'summarize_abends');
        return textResult(formatStructuredResponse(`Abend Summary — Last ${window} Hours`, [
            {
                heading: `${failures.length} failed job(s), ${aggregated.length} distinct code(s)`,
                body: renderTable(['Abend Code', 'Count', 'Description'], rows),
            },
        ]));
    }));
};
