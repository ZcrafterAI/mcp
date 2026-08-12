/**
 * `read_uss_file` — read a USS file.
 */
import type { ToolRegistrar } from '../../types/tools.js';
import { z } from 'zod';
import { formatContentHeader, textResult, truncateLines } from '../../utils/formatters.js';
import { securedHandler } from '../../utils/tool-handler.js';
import { normalizePath, readUssFile } from './shared.js';
const inputShape = {
    path: z
        .string()
        .min(1)
        .describe('Absolute USS file path, e.g. "/u/payroll/run.log".'),
    maxLines: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Maximum lines to return (caps at server configuration maximum).'),
    searchText: z
        .string()
        .optional()
        .describe('Return only lines containing this text (case-insensitive). Applied before line capping.'),
};
export const registerReadFileTool: ToolRegistrar = (server, ctx) => {
    server.tool('read_uss_file', 'Read the contents of a USS file. Supports custom line limits and text grep filtering.', inputShape, securedHandler(ctx, 'read_uss_file', async ({ path, maxLines, searchText }) => {
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
        const cap = Math.min(maxLines ?? ctx.config.limits.maxDatasetReadLines, ctx.config.limits.maxDatasetReadLines);
        const { text, truncated, totalLines } = truncateLines(raw, cap);
        ctx.logger.debug({ path: normalizedPath, totalLines, truncated, searchText }, 'read_uss_file');
        const header = formatContentHeader(normalizedPath, truncated, totalLines, cap);
        return textResult(header + grepNote + (grepNote ? '\n' : '') + text);
    }, ({ path }) => ({ ussPath: path })));
};
