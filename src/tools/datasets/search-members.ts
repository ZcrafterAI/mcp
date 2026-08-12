/**
 * `search_members` — search for members in a PDS by name pattern.
 */
import type { ToolRegistrar } from '../../types/tools.js';
import { z } from 'zod';
import { formatMemberList, textResult } from '../../utils/formatters.js';
import { globToRegExp } from '../../utils/glob.js';
import { assertDatasetAllowed } from '../../utils/security.js';
import { securedHandler } from '../../utils/tool-handler.js';
import { listMembers, listMembersWithStats, normalizeDatasetName } from './shared.js';
const inputShape = {
    dsn: z.string().min(1).describe('PDS dataset name, e.g. "SYS1.PROCLIB".'),
    pattern: z
        .string()
        .optional()
        .describe('Member name pattern with "*"/"?" wildcards, e.g. "IKJ*". Omit to list all.'),
    includeStats: z
        .boolean()
        .optional()
        .describe('Fetch extended member statistics: last-modifier userid, record count, and changed time.'),
    maxResults: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Maximum number of members to return after filtering.'),
    sortBy: z
        .enum(['name', 'modified', 'size'])
        .optional()
        .describe('Sort order for results: "name" (default), "modified" (newest first), or "size" (largest first).'),
};
export const registerSearchMembersTool: ToolRegistrar = (server, ctx) => {
    server.tool('search_members', 'Search for members in a PDS, optionally filtered by wildcard pattern. Supports extended stats, result capping, and sorting.', inputShape, securedHandler(ctx, 'search_members', async ({ dsn, pattern, includeStats, maxResults, sortBy }) => {
        const normalizedDsn = normalizeDatasetName(dsn);
        assertDatasetAllowed(ctx.config, normalizedDsn);
        // Fetch with or without extended attributes
        let members = includeStats
            ? await listMembersWithStats(ctx, normalizedDsn)
            : await listMembers(ctx, normalizedDsn);
        // Filter by name pattern
        if (pattern) {
            const re = globToRegExp(pattern, { caseInsensitive: true });
            members = members.filter((m) => re.test(m.name));
        }
        // Sort
        const sort = sortBy ?? 'name';
        members = members.slice().sort((a, b) => {
            if (sort === 'modified') {
                // Newest first: undefined dates go to bottom
                const da = a.modified ?? '';
                const db = b.modified ?? '';
                return db.localeCompare(da);
            }
            if (sort === 'size') {
                // Largest first: undefined sizes go to bottom
                return (b.size ?? -1) - (a.size ?? -1);
            }
            // Default: alphabetical by name
            return a.name.localeCompare(b.name);
        });
        const totalFiltered = members.length;
        // Apply result cap
        if (maxResults != null && members.length > maxResults) {
            members = members.slice(0, maxResults);
        }
        ctx.logger.debug({ dsn: normalizedDsn, pattern, includeStats, totalFiltered, returned: members.length, sortBy: sort }, 'search_members');
        const result = formatMemberList(normalizedDsn, members, pattern);
        const suffix = maxResults != null && members.length < totalFiltered
            ? `\n\n[Showing first ${members.length} of ${totalFiltered} filtered members.]`
            : '';
        return textResult(result + suffix);
    }, ({ dsn }) => ({ dataset: dsn })));
};
