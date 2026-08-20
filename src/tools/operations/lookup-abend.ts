/**
 * `lookup_abend_code` — query the built-in abend code reference table.
 *
 * Agents can look up a specific code (S0C7, S806, S222, …) or browse/search
 * the full catalog without hitting z/OSMF.
 *
 * Improvements over the original:
 *   - `category` filter to restrict search to system or user abend codes
 *   - Suggestions list is sorted by code and includes the explanation excerpt
 *   - Browse response includes all fields (previously only code / title)
 */
import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { lookupAbend, searchAbendCodes } from '../../parsers/abend-codes.js';
import {
    formatAbendCatalog,
    formatAbendInfo,
    formatStructuredResponse,
    textResult,
} from '../../utils/formatters.js';
const inputShape = {
    code: z
        .string()
        .optional()
        .describe(
            'Abend code to look up, e.g. "S806", "0C7", "S0C7", or "U0100". ' +
                'Omit to list or search the full catalog.',
        ),
    search: z
        .string()
        .optional()
        .describe(
            'Filter the catalog by code, title, explanation, or common-cause text (case-insensitive).',
        ),
    category: z
        .enum(['system', 'user'])
        .optional()
        .describe(
            'Restrict results to "system" (Sxxx) or "user" (Uxxxx) codes. ' +
                'Omit to include both categories.',
        ),
};

export const lookupAbendCodeTool = defineTool({
    name: 'lookup_abend_code',
    description:
        'Look up z/OS abend codes (S0C7, S806, S0C4, S322, S0CB, U4038, etc.) with explanations, common causes, and remediation steps. Supports catalog search and category filter.',
    input: inputShape,
    run({ code, search, category }, ctx) {
        if (code) {
            const info = lookupAbend(code);
            if (!info) {
                // Suggest similar codes from the catalog
                const suggestions = searchAbendCodes(code)
                    .filter((e) => !category || e.category === category)
                    .slice(0, 5);
                const hint =
                    suggestions.length > 0
                        ? `\n\nDid you mean:\n${suggestions.map((entry) => `  ${entry.code} — ${entry.title}`).join('\n')}`
                        : '';
                return textResult(`No reference entry for abend code "${code.trim()}".${hint}`);
            }
            if (category && info.category !== category) {
                return textResult(
                    `Abend code "${info.code}" is a ${info.category} code, not a ${category} code.`,
                );
            }
            ctx.logger.debug({ code: info.code }, 'lookup_abend_code');
            return textResult(
                formatStructuredResponse(`Abend Reference — ${info.code}`, [
                    { heading: 'Details', body: formatAbendInfo(info) },
                ]),
            );
        }
        let catalog = searchAbendCodes(search);
        if (category) {
            catalog = catalog.filter((e) => e.category === category);
        }
        ctx.logger.debug(
            { search, category, count: catalog.length },
            'mainframe_lookup_abend_code',
        );
        return textResult(formatAbendCatalog(catalog));
    },
});
