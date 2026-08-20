/**
 * `query_racf_audit` — search RACF audit records from a configured log source.
 */
import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { formatStructuredResponse, renderTable, textResult } from '../../utils/formatters.js';
import { queryRacfAudit } from './shared.js';
const inputShape = {
    user: z.string().optional().describe('Filter by user id (substring match, case-insensitive).'),
    resource: z
        .string()
        .optional()
        .describe('Filter by resource name (substring match, case-insensitive).'),
    event: z
        .string()
        .optional()
        .describe('Filter by event/access type, e.g. "READ", "UPDATE", "DELETE". Substring match.'),
    result: z
        .string()
        .optional()
        .describe('Filter by result/outcome, e.g. "SUCCESS", "FAIL", "0". Substring match.'),
    class: z
        .string()
        .optional()
        .describe('Filter by RACF resource class, e.g. "DATASET", "FACILITY", "PROGRAM".'),
    hours: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Look-back window in hours (best-effort when timestamps are present).'),
    maxResults: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Maximum number of audit records to return (default 100, capped server-side).'),
};

export const queryRacfAuditTool = defineTool({
    name: 'query_racf_audit',
    description:
        'Query RACF security audit records from a configured USS path or dataset. Supports user, resource, event, result, class, and time-window filters.',
    input: inputShape,
    async run({ user, resource, event, result, class: cls, hours, maxResults }, ctx) {
        const limit = maxResults ?? 100;
        const entries = await queryRacfAudit(
            ctx,
            { user, resource, hours, event, result, class: cls },
            limit,
        );
        if (entries.length === 0) {
            return textResult('No RACF audit records matched the given filters.');
        }
        const rows = entries.map((entry) => [
            entry.timestamp ?? '—',
            entry.user ?? '—',
            entry.class ?? '—',
            entry.event ?? '—',
            entry.resource ?? '—',
            entry.result ?? '—',
        ]);
        const filterParts = [
            user ? `user=${user}` : null,
            resource ? `resource=${resource}` : null,
            event ? `event=${event.toUpperCase()}` : null,
            result ? `result=${result.toUpperCase()}` : null,
            cls ? `class=${cls.toUpperCase()}` : null,
            hours ? `hours=${hours}` : null,
        ].filter((part): part is string => Boolean(part));
        const filterLine = filterParts.length > 0 ? ` [${filterParts.join(', ')}]` : '';
        ctx.logger.debug(
            { count: entries.length, ...Object.fromEntries(filterParts.map((f) => f.split('='))) },
            'query_racf_audit',
        );
        return textResult(
            formatStructuredResponse('RACF Audit Query', [
                {
                    heading: `Records — ${entries.length} matched${filterLine}`,
                    body: renderTable(
                        ['Timestamp', 'User', 'Class', 'Event', 'Resource', 'Result'],
                        rows,
                    ),
                },
            ]),
        );
    },
});
