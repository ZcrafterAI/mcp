/**
 * `list_datasets` — list datasets matching an HLQ pattern.
 */
import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { ValidationError } from '../../utils/errors.js';
import { formatDatasetList, textResult } from '../../utils/formatters.js';
import { buildDatasetPattern } from '../../utils/glob.js';
import { assertDatasetAllowed } from '../../policy/rules.js';
import { listDatasets, normalizeDatasetName } from './shared.js';
const inputShape = {
    hlq: z.string().min(1).describe('High-level qualifier, e.g. "SYS1".'),
    pattern: z
        .string()
        .optional()
        .describe('Optional lower-qualifier pattern appended to the HLQ, e.g. "PROC*".'),
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

export const listDatasetsTool = defineTool({
    name: 'list_datasets',
    description:
        'List catalog datasets matching a high-level qualifier (and optional pattern). Supports filtering by DSORG and capping result count.',
    input: inputShape,
    resources: ({ hlq }) => ({ dataset: hlq }),
    async run({ hlq, pattern, dsorg, maxResults }, ctx) {
        const normalizedHlq = normalizeDatasetName(hlq);
        // Validate HLQ: each node ≤ 8 alphanumeric/national chars, no spaces
        const hlqNodes = normalizedHlq.replace(/[*%]/g, 'X').split('.');
        for (const node of hlqNodes) {
            if (node.length === 0 || node.length > 8) {
                throw new ValidationError(
                    `HLQ node "${node}" is invalid. Each qualifier node must be 1–8 characters.`,
                    { hlq },
                );
            }
        }
        assertDatasetAllowed(ctx.config, normalizedHlq);
        const search = buildDatasetPattern(normalizedHlq, pattern);
        let datasets = await listDatasets(ctx, search);
        if (dsorg) {
            datasets = datasets.filter((ds) => (ds.dsorg ?? '').toUpperCase().startsWith(dsorg));
        }
        const totalMatched = datasets.length;
        if (maxResults != null && datasets.length > maxResults) {
            datasets = datasets.slice(0, maxResults);
        }
        ctx.logger.debug(
            { search, dsorg, totalMatched, returned: datasets.length },
            'list_datasets',
        );
        return textResult(formatDatasetList(datasets, { maxResults, totalMatched }));
    },
});
