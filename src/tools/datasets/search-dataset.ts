/**
 * `search_dataset` — search for datasets by pattern.
 */
import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { ValidationError } from '../../utils/errors.js';
import { formatDatasetList, textResult } from '../../utils/formatters.js';
import { assertDatasetAllowed } from '../../policy/rules.js';
import { listDatasets } from './shared.js';
const inputShape = {
    pattern: z
        .string()
        .min(1)
        .describe(
            'Dataset name pattern with wildcards, e.g. "PROD.**.LOADLIB". Must contain at least one "." or "*".',
        ),
    dsorg: z
        .enum(['PO', 'PS', 'DA'])
        .optional()
        .describe(
            'Filter by dataset organisation: PO (PDS/PDSE), PS (sequential), DA (direct access).',
        ),
    maxResults: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
            'Maximum number of datasets to return (default: all matched up to server limit).',
        ),
};

export const searchDatasetTool = defineTool({
    name: 'search_dataset',
    description:
        'Search the catalog for datasets matching a wildcard pattern. Supports DSORG filter and result capping.',
    input: inputShape,
    resources: ({ pattern }) => ({ dataset: pattern.split('.')[0] ?? pattern }),
    async run({ pattern, dsorg, maxResults }, ctx) {
        const normalizedPattern = pattern.trim().toUpperCase();
        // Require at least one '.' or '*' to prevent accidental whole-catalog dumps
        if (!normalizedPattern.includes('.') && !normalizedPattern.includes('*')) {
            throw new ValidationError(
                'Search pattern must contain at least one "." or "*" to avoid a full-catalog scan.',
                { pattern },
            );
        }
        const firstQualifier = normalizedPattern.split('.')[0] ?? normalizedPattern;
        assertDatasetAllowed(ctx.config, firstQualifier);
        let datasets = await listDatasets(ctx, normalizedPattern);
        if (dsorg) {
            datasets = datasets.filter((ds) => (ds.dsorg ?? '').toUpperCase().startsWith(dsorg));
        }
        const totalMatched = datasets.length;
        if (maxResults != null && datasets.length > maxResults) {
            datasets = datasets.slice(0, maxResults);
        }
        ctx.logger.debug(
            { pattern: normalizedPattern, dsorg, totalMatched, returned: datasets.length },
            'search_dataset',
        );
        return textResult(formatDatasetList(datasets, { maxResults, totalMatched }));
    },
});
