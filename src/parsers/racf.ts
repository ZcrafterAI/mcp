/**
 * RACF / security audit log line parser (best-effort).
 *
 * Supports common syslog-style and SMF-extract audit formats. Lines that do
 * not match known patterns are returned as raw entries.
 */
export interface RacfAuditEntry {
    timestamp: string | null;
    user: string | null;
    event: string | null;
    resource: string | null;
    result: string | null;
    /** RACF resource class, e.g. "DATASET", "PROGRAM", "FACILITY". */
    class: string | null;
    /** Access type / permission tested, e.g. "READ", "UPDATE", "EXECUTE". */
    accessType: string | null;
    raw: string;
}

/**
 * RACF / security audit log line parser (best-effort).
 *
 * Supports common syslog-style and SMF-extract audit formats. Lines that do
 * not match known patterns are returned as raw entries.
 */
/** Parse a single audit log line into structured fields. */
export function parseRacfAuditLine(line: string): RacfAuditEntry {
    const trimmed = line.trim();
    if (!trimmed) {
        return {
            timestamp: null,
            user: null,
            event: null,
            resource: null,
            result: null,
            class: null,
            accessType: null,
            raw: line,
        };
    }
    // Syslog-style: "Mar 12 14:30:01 LPAR1 RACF: user PAYUSR resource DATASET access READ result SUCCESS"
    const syslog = trimmed.match(
        /^(\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+\S+\s+RACF:\s+user\s+(\S+)\s+resource\s+(\S+)\s+access\s+(\S+)\s+result\s+(\S+)/i,
    );
    if (syslog) {
        return {
            timestamp: syslog[1],
            user: syslog[2],
            event: syslog[4],
            resource: syslog[3],
            result: syslog[5],
            class: trimmed.match(/\bclass[=:\s]+(\S+)/i)?.[1] ?? null,
            accessType: syslog[4],
            raw: trimmed,
        };
    }
    // IRRADU00-style: "USER= PAYUSR  RESOURCE= SYS1.PROCLIB  CLASS= DATASET  ACCESS= READ  RC= 0"
    const irr = trimmed.match(
        /USER=\s*(\S+).*RESOURCE=\s*(\S+).*ACCESS=\s*(\S+).*(?:RC|RESULT)=\s*(\S+)/i,
    );
    if (irr) {
        const classMatch = trimmed.match(/CLASS=\s*(\S+)/i)?.[1] ?? null;
        const irrTimestamp =
            trimmed.match(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/)?.[0] ??
            trimmed.match(/^(\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})/)?.[1] ??
            null;
        return {
            timestamp: irrTimestamp,
            user: irr[1],
            event: irr[3],
            resource: irr[2],
            result: irr[4],
            class: classMatch,
            accessType: irr[3],
            raw: trimmed,
        };
    }
    // Generic keyword extraction
    const user = trimmed.match(/\buser[=:\s]+(\S+)/i)?.[1] ?? null;
    const resource = trimmed.match(/\bresource[=:\s]+(\S+)/i)?.[1] ?? null;
    const event = trimmed.match(/\baccess[=:\s]+(\S+)/i)?.[1] ?? null;
    const result = trimmed.match(/\b(?:result|rc)[=:\s]+(\S+)/i)?.[1] ?? null;
    const classField = trimmed.match(/\bclass[=:\s]+(\S+)/i)?.[1] ?? null;
    const timestamp =
        trimmed.match(/^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}/)?.[0] ??
        trimmed.match(/^(\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})/)?.[1] ??
        null;
    return {
        timestamp,
        user,
        event,
        resource,
        result,
        class: classField,
        accessType: event,
        raw: trimmed,
    };
}
/** Filter parsed audit entries by optional criteria. */
export function filterAuditEntries(
    entries: RacfAuditEntry[],
    filters: {
        user?: string;
        resource?: string;
        hours?: number;
        event?: string;
        result?: string;
        class?: string;
    },
): RacfAuditEntry[] {
    let filtered = entries;
    if (filters.user) {
        const user = filters.user.toUpperCase();
        filtered = filtered.filter((entry) => entry.user?.toUpperCase().includes(user));
    }
    if (filters.resource) {
        const resource = filters.resource.toUpperCase();
        filtered = filtered.filter((entry) => entry.resource?.toUpperCase().includes(resource));
    }
    if (filters.event) {
        const event = filters.event.toUpperCase();
        filtered = filtered.filter(
            (entry) =>
                entry.event?.toUpperCase().includes(event) ||
                entry.accessType?.toUpperCase().includes(event),
        );
    }
    if (filters.result) {
        const result = filters.result.toUpperCase();
        filtered = filtered.filter((entry) => entry.result?.toUpperCase().includes(result));
    }
    if (filters.class) {
        const cls = filters.class.toUpperCase();
        filtered = filtered.filter((entry) => entry.class?.toUpperCase().includes(cls));
    }
    // Time filtering is best-effort — only applied when timestamps parse as ISO-ish.
    if (filters.hours != null && filters.hours > 0) {
        const cutoff = Date.now() - filters.hours * 60 * 60 * 1000;
        filtered = filtered.filter((entry) => {
            if (!entry.timestamp) return true;
            const parsed = Date.parse(entry.timestamp);
            return Number.isNaN(parsed) || parsed >= cutoff;
        });
    }
    return filtered;
}
