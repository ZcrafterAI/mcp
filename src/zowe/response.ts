/**
 * Reading Zowe SDK responses safely.
 *
 * The SDK returns list results as `{ apiResponse: any }`. Rather than let that
 * `any` spread through the tools, every list call goes through here and comes
 * back as a typed array — empty when the field is missing.
 */

/** The envelope shape every z/OSMF list call answers with. */
interface ListEnvelope<T> {
    apiResponse?: { items?: T[] } | undefined;
}

/** Pull the `items` array out of a list response, or an empty array. */
export function listItems<T>(response: ListEnvelope<T>): T[] {
    return response.apiResponse?.items ?? [];
}

/**
 * Render a value of unknown type as display text. Db2 and CMCI hand back rows
 * whose column types are not known ahead of time; anything that is not a
 * primitive becomes JSON rather than "[object Object]".
 */
export function asText(value: unknown, fallback = '—'): string {
    if (value == null) return fallback;
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
        return String(value);
    }
    return JSON.stringify(value);
}
