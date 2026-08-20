/**
 * `list_uss_directory` — list the contents of a USS directory.
 */
import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { formatUssListing, textResult } from '../../utils/formatters.js';
import { listUssDirectory, normalizePath, sortUssEntries } from './shared.js';
const inputShape = {
    path: z.string().min(1).describe('Absolute USS directory path, e.g. "/u/payroll".'),
    type: z
        .enum(['file', 'directory', 'symlink', 'other'])
        .optional()
        .describe('Filter results to only entries of this type.'),
    sortBy: z
        .enum(['name', 'size', 'modified', 'type'])
        .optional()
        .describe(
            'Sort order: "name" (default, alpha), "size" (largest first), "modified" (newest first), "type" (dirs first).',
        ),
    maxResults: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Maximum number of entries to return after filtering and sorting.'),
};

export const listUssDirectoryTool = defineTool({
    name: 'list_uss_directory',
    description:
        'List the contents of a USS (Unix System Services) directory. Supports type filter, sort order, and result capping.',
    input: inputShape,
    resources: ({ path }) => ({ ussPath: path }),
    async run({ path, type, sortBy, maxResults }, ctx) {
        const normalizedPath = normalizePath(path);
        let entries = await listUssDirectory(ctx, normalizedPath);
        if (type) {
            entries = entries.filter((e) => e.type === type);
        }
        entries = sortUssEntries(entries, sortBy ?? 'name');
        const totalFiltered = entries.length;
        if (maxResults != null && entries.length > maxResults) {
            entries = entries.slice(0, maxResults);
        }
        ctx.logger.debug(
            { path: normalizedPath, type, sortBy, total: totalFiltered, returned: entries.length },
            'list_uss_directory',
        );
        return textResult(
            formatUssListing(normalizedPath, entries, {
                totalCount:
                    maxResults != null && entries.length < totalFiltered
                        ? totalFiltered
                        : undefined,
            }),
        );
    },
});
