/**
 * `summarize_abends` — aggregate abend codes across recent jobs.
 */
import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { formatStructuredResponse, renderTable, textResult } from '../../utils/formatters.js';
import { lookupAbend } from '../../parsers/abend-codes.js';
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
export const summarizeAbendsTool = defineTool({
    name: 'summarize_abends',
    description:
        'Aggregate abend codes across recent failed jobs, with counts and a short description.',
    input: inputShape,
    async run({ hours, owner }, ctx) {
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
        return textResult(
            formatStructuredResponse(`Abend Summary — Last ${window} Hours`, [
                {
                    heading: `${failures.length} failed job(s), ${aggregated.length} distinct code(s)`,
                    body: renderTable(['Abend Code', 'Count', 'Description'], rows),
                },
            ]),
        );
    },
});
