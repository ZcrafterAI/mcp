/**
 * Shared SMF / RMF metric helpers.
 */
import type { SmfMetric } from '../../utils/smf-parser.js';
import type { ToolContext } from '../../types/tools.js';
import { parseRmfJson, parseSmfSummaryText } from '../../utils/smf-parser.js';
import { getJson } from '../../zowe/rest-client.js';
import { readDataset } from '../datasets/shared.js';
import { truncateLines } from '../../utils/formatters.js';
/** Fetch SMF/RMF metrics from z/OSMF RMF and/or a configured summary dataset. */
export async function fetchSmfMetrics(ctx: ToolContext, categoryFilter?: string): Promise<SmfMetric[]> {
    const metrics = [];
    const { enterprise } = ctx.config;
    if (enterprise.rmfMetricsEnabled) {
        try {
            const rmf = await getJson(ctx.session, '/rmf/mvs/GPO/');
            metrics.push(...parseRmfJson(rmf));
        }
        catch {
            // RMF may not be installed or authorized — continue to dataset fallback.
        }
    }
    if (enterprise.smfSummaryDataset) {
        const raw = await readDataset(ctx, enterprise.smfSummaryDataset);
        const { text } = truncateLines(raw, ctx.config.limits.maxDatasetReadLines);
        metrics.push(...parseSmfSummaryText(text));
    }
    // Apply category filter (case-insensitive substring match on category or name)
    if (categoryFilter) {
        const lower = categoryFilter.toLowerCase();
        return metrics.filter((m) => (m.category ?? '').toLowerCase().includes(lower) ||
            m.name.toLowerCase().includes(lower));
    }
    return metrics;
}
