/**
 * `list_uss_directory` — list the contents of a USS directory.
 */
import type { ToolRegistrar } from '../../types/tools.js';
import { z } from 'zod';
import { formatUssListing, textResult } from '../../utils/formatters.js';
import { securedHandler } from '../../utils/tool-handler.js';
import { listUssDirectory, normalizePath, sortUssEntries } from './shared.js';
const inputShape = {
    path: z
        .string()
        .min(1)
        .describe('Absolute USS directory path, e.g. "/u/payroll".'),
    type: z
        .enum(['file', 'directory', 'symlink', 'other'])
        .optional()
        .describe('Filter results to only entries of this type.'),
    sortBy: z
        .enum(['name', 'size', 'modified', 'type'])
        .optional()
        .describe('Sort order: "name" (default, alpha), "size" (largest first), "modified" (newest first), "type" (dirs first).'),
    maxResults: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Maximum number of entries to return after filtering and sorting.'),
};
export const registerListDirectoryTool: ToolRegistrar = (server, ctx) => {
    server.tool('list_uss_directory', 'List the contents of a USS (Unix System Services) directory. Supports type filter, sort order, and result capping.', inputShape, securedHandler(ctx, 'list_uss_directory', async ({ path, type, sortBy, maxResults }) => {
        const normalizedPath = normalizePath(path);
        let entries = await listUssDirectory(ctx, normalizedPath);
        // Apply type filter
        if (type) {
            entries = entries.filter((e) => e.type === type);
        }
        // Apply sort (default: name)
        entries = sortUssEntries(entries, sortBy ?? 'name');
        const totalFiltered = entries.length;
        // Apply result cap
        if (maxResults != null && entries.length > maxResults) {
            entries = entries.slice(0, maxResults);
        }
        ctx.logger.debug({ path: normalizedPath, type, sortBy, total: totalFiltered, returned: entries.length }, 'list_uss_directory');
        return textResult(formatUssListing(normalizedPath, entries, {
            totalCount: maxResults != null && entries.length < totalFiltered ? totalFiltered : undefined,
        }));
    }, ({ path }) => ({ ussPath: path })));
};
