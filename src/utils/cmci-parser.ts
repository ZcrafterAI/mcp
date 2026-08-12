
/**
 * Minimal CMCI XML response parser.
 *
 * CMCI returns XML result sets with `<col name="...">value</col>` rows.
 * This parser extracts rows into plain objects for formatting.
 */
export interface CmciRecord {
    [field: string]: string;
}

/**
 * Minimal CMCI XML response parser.
 *
 * CMCI returns XML result sets with `<col name="...">value</col>` rows.
 * This parser extracts rows into plain objects for formatting.
 */
/** Parse CMCI XML into an array of row objects. */
export function parseCmciXml(xml: string): CmciRecord[] {
    const rows: CmciRecord[] = [];
    const rowBlocks = xml.match(/<row[^>]*>[\s\S]*?<\/row>/gi) ?? [];
    for (const block of rowBlocks) {
        const record: CmciRecord = {};
        const cols = block.matchAll(/<col\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/col>/gi);
        for (const match of cols) {
            record[match[1].toLowerCase()] = decodeXmlEntities(match[2].trim());
        }
        if (Object.keys(record).length > 0)
            rows.push(record);
    }
    return rows;
}
function decodeXmlEntities(value: string): string {
    return value
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");
}
