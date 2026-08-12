/**
 * `search_db2_catalog` — search Db2 catalog tables/views via SQL over REST.
 */
import type { ToolRegistrar } from '../../types/tools.js';
import { z } from 'zod';
import { securedHandler } from '../../utils/tool-handler.js';
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
        .describe('Object type filter: "TABLE", "VIEW", "ALIAS", "MATERIALIZED QUERY TABLE". Case-insensitive.'),
    maxResults: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Maximum number of catalog objects to return (default 50, max 200).'),
};
export const registerSearchDb2CatalogTool: ToolRegistrar = (server, ctx) => {
    server.tool('search_db2_catalog', 'Search the Db2 catalog for tables, views, or aliases matching a name pattern. Includes row count, creation date, and remarks.', inputShape, securedHandler(ctx, 'search_db2_catalog', async ({ pattern, schema, type, maxResults }) => {
        const entries = await searchDb2Catalog(ctx, pattern, schema, type, maxResults);
        if (entries.length === 0) {
            const filters = [
                schema ? `schema=${schema.toUpperCase()}` : null,
                type ? `type=${type.toUpperCase()}` : null,
            ].filter(Boolean).join(', ');
            return textResult(`No Db2 catalog objects matched pattern "${pattern}"${filters ? ` (${filters})` : ''}.`);
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
        return textResult(`Db2 Catalog${filterLine} — ${entries.length} matches\n\n` +
            renderTable(['Schema', 'Name', 'Type', 'Rows', 'Created', 'Remarks'], rows));
    }));
};
