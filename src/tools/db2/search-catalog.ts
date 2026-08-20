/**
 * `search_db2_catalog` — search Db2 catalog tables/views via SQL over REST.
 */
import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { renderTable, textResult } from '../../utils/formatters.js';
import { searchDb2Catalog } from './shared.js';
const inputShape = {
    pattern: z
        .string()
        .min(1)
        .describe('Table/view name pattern with wildcards (*, ?), e.g. "PAY*".'),
    schema: z
        .string()
        .optional()
        .describe('Optional schema/creator filter (exact match), e.g. "PAYROLL".'),
    type: z
        .string()
        .optional()
        .describe(
            'Object type filter: "TABLE", "VIEW", "ALIAS", "MATERIALIZED QUERY TABLE". Case-insensitive.',
        ),
    maxResults: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Maximum number of catalog objects to return (default 50, max 200).'),
};

export const searchDb2CatalogTool = defineTool({
    name: 'search_db2_catalog',
    description:
        'Search the Db2 catalog for tables, views, or aliases matching a name pattern. Includes row count, creation date, and remarks.',
    input: inputShape,
    async run({ pattern, schema, type, maxResults }, ctx) {
        const entries = await searchDb2Catalog(ctx, pattern, schema, type, maxResults);
        if (entries.length === 0) {
            const filters = [
                schema ? `schema=${schema.toUpperCase()}` : null,
                type ? `type=${type.toUpperCase()}` : null,
            ]
                .filter(Boolean)
                .join(', ');
            return textResult(
                `No Db2 catalog objects matched pattern "${pattern}"${filters ? ` (${filters})` : ''}.`,
            );
        }
        const rows = entries.map((entry) => [
            entry.schema,
            entry.name,
            entry.type,
            entry.rowCount ?? '—',
            entry.created ?? '—',
            entry.remarks ?? '—',
        ]);
        const filterParts = [
            schema ? `schema=${schema.toUpperCase()}` : null,
            type ? `type=${type.toUpperCase()}` : null,
        ].filter(Boolean);
        const filterLine = filterParts.length > 0 ? ` [${filterParts.join(', ')}]` : '';
        ctx.logger.debug({ pattern, count: entries.length, schema, type }, 'search_db2_catalog');
        return textResult(
            `Db2 Catalog${filterLine} — ${entries.length} matches\n\n` +
                renderTable(['Schema', 'Name', 'Type', 'Rows', 'Created', 'Remarks'], rows),
        );
    },
});
