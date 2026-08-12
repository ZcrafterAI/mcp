/**
 * `search_uss_files` — search for files in a USS path by name pattern.
 */
import type { ToolRegistrar } from '../../types/tools.js';
import { z } from 'zod';
import { formatUssListing, textResult } from '../../utils/formatters.js';
import { globToRegExp } from '../../utils/glob.js';
import { securedHandler } from '../../utils/tool-handler.js';
import { listUssDirectory, normalizePath, sortUssEntries } from './shared.js';
const inputShape = {
    path: z
        .string()
        .min(1)
        .describe('Absolute USS directory path to search within.'),
    pattern: z
        .string()
        .min(1)
        .describe('File/directory name pattern with "*"/"?" wildcards, e.g. "*.log" or "pay*".'),
    type: z
        .enum(['file', 'directory', 'symlink', 'other'])
        .optional()
        .describe('Restrict matches to entries of this type only.'),
    sortBy: z
        .enum(['name', 'size', 'modified', 'type'])
        .optional()
        .describe('Sort matched results: "name" (default), "size" (largest first), "modified" (newest first), "type" (dirs first).'),
    maxResults: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Maximum number of matched entries to return.'),
};
export const registerSearchFilesTool: ToolRegistrar = (server, ctx) => {
    server.tool('search_uss_files', 'Search for files/directories in a USS directory matching a wildcard name pattern. Supports type filter, sort, and result capping.', inputShape, securedHandler(ctx, 'search_uss_files', async ({ path, pattern, type, sortBy, maxResults }) => {
        const normalizedPath = normalizePath(path);
        const entries = await listUssDirectory(ctx, normalizedPath);
        // Apply name pattern filter
        const regex = globToRegExp(pattern, { caseInsensitive: true });
        let matched = entries.filter((entry) => regex.test(entry.name));
        // Apply type filter
        if (type) {
            matched = matched.filter((e) => e.type === type);
        }
        // Apply sort
        matched = sortUssEntries(matched, sortBy ?? 'name');
        const totalMatched = matched.length;
        // Apply result cap
        if (maxResults != null && matched.length > maxResults) {
            matched = matched.slice(0, maxResults);
        }
        ctx.logger.debug({ path: normalizedPath, pattern, type, totalMatched, returned: matched.length }, 'search_uss_files');
        if (matched.length === 0) {
            const typeNote = type ? ` of type "${type}"` : '';
            return textResult(`No entries${typeNote} in ${normalizedPath} matched pattern "${pattern}".`);
        }
        return textResult(formatUssListing(normalizedPath, matched, {
            totalCount: maxResults != null && matched.length < totalMatched ? totalMatched : undefined,
        }));
    }, ({ path }) => ({ ussPath: path })));
};
