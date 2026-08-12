/**
 * `read_dataset` — read a sequential dataset or PDS member.
 */
import type { ToolRegistrar } from '../../types/tools.js';
import { z } from 'zod';
import { formatContentHeader, textResult, truncateLines } from '../../utils/formatters.js';
import { assertDatasetAllowed } from '../../utils/security.js';
import { securedHandler } from '../../utils/tool-handler.js';
import { assertValidMemberName, normalizeDatasetName, readDataset } from './shared.js';
const inputShape = {
    dsn: z.string().min(1).describe('Dataset name, e.g. "SYS1.PROCLIB".'),
    member: z
        .string()
        .optional()
        .describe('PDS member name (1–8 chars). Omit for a sequential dataset.'),
    maxLines: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Maximum lines to return (caps at server configuration maximum).'),
    encoding: z
        .enum(['utf8', 'ibm1047'])
        .optional()
        .describe('Text encoding hint. Use "ibm1047" for EBCDIC datasets that the Zowe SDK may not auto-convert.'),
};
export const registerReadDatasetTool: ToolRegistrar = (server, ctx) => {
    server.tool('read_dataset', 'Read the content of a sequential dataset or a PDS member (output is line-capped). Supports custom line limits and EBCDIC encoding hints.', inputShape, securedHandler(ctx, 'read_dataset', async ({ dsn, member, maxLines, encoding }) => {
        const normalizedDsn = normalizeDatasetName(dsn);
        // Validate member name if provided
        if (member) {
            assertValidMemberName(member);
        }
        assertDatasetAllowed(ctx.config, normalizedDsn);
        const raw = await readDataset(ctx, normalizedDsn, member?.toUpperCase(), encoding);
        const cap = Math.min(maxLines ?? ctx.config.limits.maxDatasetReadLines, ctx.config.limits.maxDatasetReadLines);
        const { text, truncated, totalLines } = truncateLines(raw, cap);
        ctx.logger.debug({ dsn: normalizedDsn, member, totalLines, truncated, cap }, 'read_dataset');
        const label = member ? `${normalizedDsn}(${member.toUpperCase()})` : normalizedDsn;
        const encodingNote = encoding === 'ibm1047' ? ' [encoding: ibm1047 → utf8]' : '';
        const header = formatContentHeader(`${label}${encodingNote}`, truncated, totalLines, cap);
        return textResult(header + text);
    }, ({ dsn }) => ({ dataset: dsn })));
};
