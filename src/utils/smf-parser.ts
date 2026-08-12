
/**
 * SMF / RMF metric normalizers.
 */
export interface SmfMetric {
    name: string;
    value: string;
    unit?: string;
    /** Broad category inferred from the metric name, e.g. "cpu", "io", "memory". */
    category?: string;
}

/**
 * SMF / RMF metric normalizers.
 */
/** Infer a metric category from its name. */
function inferCategory(name: string): string | undefined {
    const lower = name.toLowerCase();
    // Order matters: check memory patterns before util to avoid cpu match on memUtil
    if (/mem|real|virtual|page|swap|storage/.test(lower))
        return 'memory';
    if (/cpu|busy|util|dispatch|mips/.test(lower))
        return 'cpu';
    if (/io|read|write|excp|channel/.test(lower))
        return 'io';
    if (/rate|resp|time|sec|ms|latency/.test(lower))
        return 'performance';
    if (/count|num|total|fail|error|abend/.test(lower))
        return 'counter';
    return undefined;
}
/** Extract key/value metrics from z/OSMF RMF JSON (shape varies by endpoint). */
export function parseRmfJson(payload: unknown): SmfMetric[] {
    const metrics: SmfMetric[] = [];
    function walk(node: unknown, prefix = '') {
        if (node == null || typeof node !== 'object')
            return;
        if (Array.isArray(node)) {
            node.forEach((item, index) => walk(item, `${prefix}[${index}]`));
            return;
        }
        for (const [key, value] of Object.entries(node)) {
            const path = prefix ? `${prefix}.${key}` : key;
            if (typeof value === 'number' || typeof value === 'string') {
                if (/cpu|mvs|busy|util|rate|count|time|sec|ms|pct|percent|io|mem|page|excp/i.test(key)) {
                    metrics.push({ name: path, value: String(value), category: inferCategory(key) });
                }
            }
            else {
                walk(value, path);
            }
        }
    }
    walk(payload);
    return metrics.slice(0, 50);
}
/** Parse SMF summary dataset text into metrics (one metric per non-empty line). */
export function parseSmfSummaryText(text: string): SmfMetric[] {
    return text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 100)
        .map((line) => {
        const kv = line.match(/^([^:=\s]+)\s*[:=]\s*(.+)$/);
        if (kv) {
            const name = kv[1].trim();
            return { name, value: kv[2].trim(), category: inferCategory(name) };
        }
        return { name: 'record', value: line };
    });
}
