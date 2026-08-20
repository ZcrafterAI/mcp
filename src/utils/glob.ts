/**
 * Wildcard matching for mainframe names.
 *
 * Mainframe tooling uses `*` for "any characters" and `?` for "one character"
 * — not full regular expressions. These helpers translate that into something
 * JavaScript can match, escaping everything else so a stray `.` in a dataset
 * name cannot behave like a regex wildcard.
 */

/** Turn a `*`/`?` wildcard pattern into an anchored regular expression. */
export function globToRegExp(glob: string, options?: { caseInsensitive?: boolean }): RegExp {
    const normalized = options?.caseInsensitive ? glob.toUpperCase() : glob;
    const escaped = normalized
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
    return new RegExp(`^${escaped}$`, options?.caseInsensitive ? 'i' : '');
}

/** True when a dataset name fragment already carries a wildcard. */
function hasWildcard(value: string): boolean {
    return value.includes('*') || value.includes('%');
}

/**
 * Build a catalog search pattern from a high-level qualifier and an optional
 * lower-qualifier pattern.
 *
 *   ('SYS1')             -> 'SYS1.*'
 *   ('SYS1', 'PROC*')    -> 'SYS1.PROC*'
 *   ('PROD.*.LOAD')      -> 'PROD.*.LOAD'   (already a pattern, left alone)
 */
export function buildDatasetPattern(hlq: string, pattern?: string): string {
    const qualifier = hlq.trim().toUpperCase();

    if (!pattern?.trim()) {
        return hasWildcard(qualifier) ? qualifier : `${qualifier}.*`;
    }

    // A qualifier that already spans several levels, or already carries a "*",
    // is a complete pattern on its own — appending "*" to it would narrow it.
    if (qualifier.includes('*') || (qualifier.includes('.') && pattern.trim() === '*')) {
        return qualifier;
    }

    return `${qualifier}.${pattern.trim().toUpperCase()}`;
}
