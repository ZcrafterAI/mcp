/**
 * Simple glob-to-regexp conversion for mainframe-style wildcards (* and ?).
 */
export function globToRegExp(glob: string, options?: {
    caseInsensitive?: boolean;
}): RegExp {
    const normalized = options?.caseInsensitive ? glob.toUpperCase() : glob;
    const escaped = normalized
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
    const flags = options?.caseInsensitive ? 'i' : '';
    return new RegExp(`^${escaped}$`, flags);
}
/** Build a catalog dataset search pattern from an HLQ and optional lower-qualifier pattern. */
export function buildDatasetPattern(hlq: string, pattern?: string): string {
    const trimmed = hlq.trim().toUpperCase();
    if (!pattern?.trim()) {
        return trimmed.includes('*') || trimmed.includes('%') ? trimmed : `${trimmed}.*`;
    }
    if (trimmed.includes('*') || trimmed.includes('.') && pattern === '*') {
        return trimmed;
    }
    const suffix = pattern.trim().toUpperCase();
    return `${trimmed}.${suffix}`;
}
