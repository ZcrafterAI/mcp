/**
 * `read_uss_file` — read a USS file.
 */
import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { formatContentHeader, textResult, truncateLines } from '../../utils/formatters.js';
import { normalizePath, readUssFile } from './shared.js';
const inputShape = {
    path: z.string().min(1).describe('Absolute USS file path, e.g. "/u/payroll/run.log".'),
    maxLines: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Maximum lines to return (caps at server configuration maximum).'),
    searchText: z
        .string()
        .optional()
        .describe(
            'Return only lines containing this text (case-insensitive). Applied before line capping.',
        ),
};

export const readUssFileTool = defineTool({
    name: 'read_uss_file',
    description:
        'Read the contents of a USS file. Supports custom line limits and text grep filtering.',
    input: inputShape,
    resources: ({ path }) => ({ ussPath: path }),
    async run({ path, maxLines, searchText }, ctx) {
        const normalizedPath = normalizePath(path);
        let raw = await readUssFile(ctx, normalizedPath);
        // Apply searchText grep before truncation
        let grepNote = '';
        if (searchText) {
            const lower = searchText.toLowerCase();
            const allLines = raw.split(/\r?\n/);
            const matched = allLines.filter((line) => line.toLowerCase().includes(lower));
            raw = matched.join('\n');
            grepNote = `\n[grep: "${searchText}" — ${matched.length} of ${allLines.length} lines matched]`;
        }
        const cap = Math.min(
            maxLines ?? ctx.config.limits.maxDatasetReadLines,
            ctx.config.limits.maxDatasetReadLines,
        );
        const { text, truncated, totalLines } = truncateLines(raw, cap);
        ctx.logger.debug(
            { path: normalizedPath, totalLines, truncated, searchText },
            'read_uss_file',
        );
        const header = formatContentHeader(normalizedPath, truncated, totalLines, cap);
        return textResult(header + grepNote + (grepNote ? '\n' : '') + text);
    },
});
