/**
 * `get_smf_metrics` — expose SMF/RMF performance metrics.
 */
import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { ConfigError } from '../../utils/errors.js';
import { formatStructuredResponse, renderTable, textResult } from '../../utils/formatters.js';
import { fetchSmfMetrics } from './shared.js';
const inputShape = {
    category: z
        .string()
        .optional()
        .describe(
            'Filter metrics by category: "cpu", "io", "memory", "performance", "counter", or a custom keyword matching metric names.',
        ),
};

export const getSmfMetricsTool = defineTool({
    name: 'get_smf_metrics',
    description:
        'Retrieve SMF/RMF performance metrics from z/OSMF RMF and/or a configured SMF summary dataset. Supports category filtering.',
    input: inputShape,
    async run({ category }, ctx) {
        const { rmfMetricsEnabled, smfSummaryDataset } = ctx.config.enterprise;
        if (!rmfMetricsEnabled && !smfSummaryDataset) {
            throw new ConfigError(
                'SMF metrics require RMF_METRICS_ENABLED=true and/or SMF_SUMMARY_DATASET to be configured.',
            );
        }
        const metrics = await fetchSmfMetrics(ctx, category);
        const sources = [];
        if (rmfMetricsEnabled) sources.push('z/OSMF RMF');
        if (smfSummaryDataset) sources.push(`dataset:${smfSummaryDataset}`);
        const sourceNote = `Sources: ${sources.join(', ')}`;
        const categoryNote = category ? `  |  Filter: category="${category}"` : '';
        if (metrics.length === 0) {
            return textResult(
                `No SMF/RMF metrics matched${category ? ` category "${category}"` : ''}.\n${sourceNote}\n\nVerify RMF is enabled on z/OSMF or configure SMF_SUMMARY_DATASET.`,
            );
        }
        const table = renderTable(
            ['Category', 'Metric', 'Value'],
            metrics.map((metric) => [
                metric.category ?? '—',
                metric.name,
                metric.unit ? `${metric.value} ${metric.unit}` : metric.value,
            ]),
        );
        ctx.logger.debug({ count: metrics.length, category }, 'get_smf_metrics');
        return textResult(
            formatStructuredResponse('SMF / RMF Metrics', [
                {
                    heading: 'Performance snapshot',
                    body: `${sourceNote}${categoryNote}\n\n${table}`,
                },
            ]),
        );
    },
});
