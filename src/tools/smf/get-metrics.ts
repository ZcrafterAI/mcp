/**
 * `get_smf_metrics` — expose SMF/RMF performance metrics.
 */
import type { ToolRegistrar } from '../../types/tools.js';
import { z } from 'zod';
import { ConfigError } from '../../utils/errors.js';
import { securedHandler } from '../../utils/tool-handler.js';
import { formatStructuredResponse, renderTable, textResult } from '../../utils/formatters.js';
import { fetchSmfMetrics } from './shared.js';
const inputShape = {
    category: z
        .string()
        .optional()
        .describe('Filter metrics by category: "cpu", "io", "memory", "performance", "counter", or a custom keyword matching metric names.'),
};
export const registerSmfMetricsTool: ToolRegistrar = (server, ctx) => {
    server.tool('get_smf_metrics', 'Retrieve SMF/RMF performance metrics from z/OSMF RMF and/or a configured SMF summary dataset. Supports category filtering.', inputShape, securedHandler(ctx, 'get_smf_metrics', async ({ category }) => {
        const { rmfMetricsEnabled, smfSummaryDataset } = ctx.config.enterprise;
        if (!rmfMetricsEnabled && !smfSummaryDataset) {
            throw new ConfigError('SMF metrics require RMF_METRICS_ENABLED=true and/or SMF_SUMMARY_DATASET to be configured.');
        }
        const metrics = await fetchSmfMetrics(ctx, category);
        // Build source provenance note
        const sources = [];
        if (rmfMetricsEnabled)
            sources.push('z/OSMF RMF');
        if (smfSummaryDataset)
            sources.push(`dataset:${smfSummaryDataset}`);
        const sourceNote = `Sources: ${sources.join(', ')}`;
        const categoryNote = category ? `  |  Filter: category="${category}"` : '';
        if (metrics.length === 0) {
            return textResult(`No SMF/RMF metrics matched${category ? ` category "${category}"` : ''}.\n${sourceNote}\n\nVerify RMF is enabled on z/OSMF or configure SMF_SUMMARY_DATASET.`);
        }
        const table = renderTable(['Category', 'Metric', 'Value'], metrics.map((metric) => [
            metric.category ?? '—',
            metric.name,
            metric.unit ? `${metric.value} ${metric.unit}` : metric.value,
        ]));
        ctx.logger.debug({ count: metrics.length, category }, 'get_smf_metrics');
        return textResult(formatStructuredResponse('SMF / RMF Metrics', [
            { heading: 'Performance snapshot', body: `${sourceNote}${categoryNote}\n\n${table}` },
        ]));
    }));
};
