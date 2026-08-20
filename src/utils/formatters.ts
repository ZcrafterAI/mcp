/**
 * Response formatters that turn normalized z/OS objects into compact,
 * AI-friendly text. Box-drawing tables and numbered sections give agents
 * predictable structure to parse across every tool.
 */
import type {
    AbendCodeInfo,
    Dataset,
    Job,
    JobFailureAnalysis,
    Member,
    SpoolFile,
    UssEntry,
} from '../types/zos.js';
import type { TextToolResult } from '../types/tools.js';
import { isFailedJob } from './job-status.js';

/** A titled block inside a structured tool response. */
export interface StructuredSection {
    heading: string;
    body: string;
}

/** Build a standard (non-error) MCP text result. */
export function textResult(text: string): TextToolResult {
    return { content: [{ type: 'text', text }] };
}
/**
 * Render a multi-section response with a title banner and numbered sections.
 * Used by operational/diagnostic tools so agents get a consistent layout.
 */
export function formatStructuredResponse(title: string, sections: StructuredSection[]): string {
    const bannerWidth = Math.min(Math.max(title.length, 40), 64);
    const lines = [title, '═'.repeat(bannerWidth), ''];
    sections.forEach(({ heading, body }, index) => {
        lines.push(`${index + 1}. ${heading.toUpperCase()}`, body, '');
    });
    return lines.join('\n').trimEnd();
}
/**
 * Render a simple box-drawing table.
 *
 * @param headers - Column headers.
 * @param rows - Row cells (each row must match the header length).
 */
export function renderTable(headers: string[], rows: string[][]): string {
    const widths = headers.map((header, i) =>
        Math.max(header.length, ...rows.map((row) => (row[i] ?? '').length)),
    );
    const pad = (value: string, width: number) => value.padEnd(width, ' ');
    const line = (left: string, mid: string, right: string) =>
        left + widths.map((w) => '─'.repeat(w + 2)).join(mid) + right;
    const renderRow = (cells: string[]) =>
        '│ ' + cells.map((cell, i) => pad(cell ?? '', widths[i])).join(' │ ') + ' │';
    if (rows.length === 0) {
        return [line('┌', '┬', '┐'), renderRow(headers), line('└', '┴', '┘')].join('\n');
    }
    return [
        line('┌', '┬', '┐'),
        renderRow(headers),
        line('├', '┼', '┤'),
        ...rows.map(renderRow),
        line('└', '┴', '┘'),
    ].join('\n');
}
/** Truncate text to a maximum number of lines, adding a clear notice. */
export function truncateLines(
    text: string,
    maxLines: number,
): { text: string; truncated: boolean; totalLines: number } {
    const lines = text.split(/\r?\n/);
    if (lines.length <= maxLines) {
        return { text: lines.join('\n'), truncated: false, totalLines: lines.length };
    }
    const kept = lines.slice(0, maxLines).join('\n');
    return {
        text: `${kept}\n... [truncated ${lines.length - maxLines} of ${lines.length} lines]`,
        truncated: true,
        totalLines: lines.length,
    };
}
/** Build a content header with an optional truncation notice for read tools. */
export function formatContentHeader(
    label: string,
    truncated: boolean,
    totalLines: number,
    maxLines: number,
): string {
    const rule = '─'.repeat(Math.min(label.length, 48));
    const notice = truncated ? `\n[Showing first ${maxLines} of ${totalLines} lines]` : '';
    return `${label}\n${rule}${notice}\n`;
}
/** Format a list of jobs as a table with optional filter summary. */
export function formatJobList(
    jobs: Job[],
    totalCount?: number,
    opts?: {
        owner?: string;
        prefix?: string;
        status?: string;
        returnCode?: string;
    },
): string {
    if (jobs.length === 0) return 'No jobs matched the given filters.';
    const rows = jobs.map((job) => [
        job.jobName,
        job.jobId,
        job.owner,
        job.status,
        job.returnCode ?? '—',
    ]);
    const shown = jobs.length;
    const total = totalCount ?? shown;
    let header = `Jobs (${shown} shown`;
    header += total > shown ? ` of ${total} matched)` : ')';
    // Emit active filter summary
    const filters = [];
    if (opts?.owner && opts.owner !== '*') filters.push(`owner=${opts.owner}`);
    if (opts?.prefix && opts.prefix !== '*') filters.push(`prefix=${opts.prefix}`);
    if (opts?.status) filters.push(`status=${opts.status}`);
    if (opts?.returnCode) filters.push(`returnCode~"${opts.returnCode}"`);
    if (filters.length > 0) header += `  [filters: ${filters.join(', ')}]`;
    header += '\n\n';
    let body = header + renderTable(['Job Name', 'Job ID', 'Owner', 'Status', 'Return Code'], rows);
    if (total > shown) {
        body += `\n\n[Showing first ${shown} of ${total} jobs. Narrow owner, prefix, or status filters.]`;
    }
    return body;
}
/** Format a single job's status as an aligned key/value block. */
export function formatJobStatus(job: Job): string {
    const failed = isFailedJob(job);
    const failedMark = job.returnCode == null ? '' : failed ? '  ✗' : '  ✓';
    const lines = [
        `Job:          ${job.jobName} (${job.jobId})`,
        `Owner:        ${job.owner}`,
        `Status:       ${job.status}`,
        `Return Code:  ${job.returnCode ?? '(running)'}${failedMark}`,
        `Failed:       ${job.returnCode == null ? '(pending)' : failed ? 'Yes' : 'No'}`,
    ];
    if (job.class) lines.push(`Class:        ${job.class}`);
    if (job.subsystem) lines.push(`Subsystem:    ${job.subsystem}`);
    if (job.phase) lines.push(`Phase:        ${job.phase}`);
    return lines.join('\n');
}
/** Format the spool (DD) file inventory of a job. */
export function formatSpoolFiles(jobName: string, jobId: string, files: SpoolFile[]): string {
    if (files.length === 0) return `No spool files found for ${jobName} (${jobId}).`;
    const rows = files.map((file) => [
        String(file.id),
        file.ddName,
        file.stepName ?? '—',
        file.procStep ?? '—',
        file.recordCount != null ? String(file.recordCount) : '—',
    ]);
    const header = `Spool files for ${jobName} (${jobId})\n\n`;
    return header + renderTable(['ID', 'DD Name', 'Step', 'ProcStep', 'Records'], rows);
}
/** Format a dataset list. */
export function formatDatasetList(
    datasets: Dataset[],
    opts?: {
        maxResults?: number;
        totalMatched?: number;
    },
): string {
    if (datasets.length === 0) return 'No datasets matched the given pattern.';
    const shown = datasets.length;
    const total = opts?.totalMatched ?? shown;
    const capped = opts?.maxResults != null && shown < total;
    const rows = datasets.map((ds) => [
        ds.name,
        ds.dsorg ?? '—',
        ds.recfm ?? '—',
        ds.lrecl != null ? String(ds.lrecl) : '—',
        ds.blksize != null ? String(ds.blksize) : '—',
        ds.migrated ? 'MIGRATED' : (ds.volume ?? '—'),
    ]);
    let header = `Datasets (${shown} shown`;
    header += total > shown ? ` of ${total} matched)\n\n` : ')\n\n';
    let body = header + renderTable(['Name', 'DSORG', 'RECFM', 'LRECL', 'BLKSIZE', 'Volume'], rows);
    if (capped) {
        body += `\n\n[Showing first ${shown} of ${total} datasets. Use a narrower pattern or dsorg filter to reduce results.]`;
    }
    return body;
}
/** Format a PDS member list. */
export function formatMemberList(dsn: string, members: Member[], pattern?: string): string {
    if (members.length === 0) {
        return pattern
            ? `No members in ${dsn} matched pattern "${pattern}".`
            : `No members found in ${dsn}.`;
    }
    // Detect whether any member carries extended stats
    const hasStats = members.some((m) => m.user != null || m.size != null);
    const header = `Members of ${dsn} (${members.length} found)\n\n`;
    if (hasStats) {
        const rows = members.map((m) => [
            m.name,
            m.modified ?? '—',
            m.changedTime ?? '—',
            m.user ?? '—',
            m.size != null ? String(m.size) : '—',
        ]);
        return header + renderTable(['Member', 'Modified', 'Time', 'User', 'Size'], rows);
    }
    const rows = members.map((m) => [m.name, m.modified ?? '—']);
    return header + renderTable(['Member', 'Modified'], rows);
}
/** Format a full dataset info response (attributes + optional member section). */
export function formatDatasetInfo(
    info: Dataset,
    members?: {
        total: number;
        recent: Member[];
    },
): string {
    const dsType = info.pdse
        ? 'PDSE (Library)'
        : info.dsorg === 'PO'
          ? 'PDS'
          : info.dsorg === 'PS'
            ? 'Sequential'
            : info.dsorg === 'DA'
              ? 'Direct Access'
              : (info.dsorg ?? '—');
    const attrRows = [
        ['Name', info.name],
        ['Type', dsType],
        ['DSORG', info.dsorg ?? '—'],
        ['RECFM', info.recfm ?? '—'],
        ['LRECL', info.lrecl != null ? String(info.lrecl) : '—'],
        ['BLKSIZE', info.blksize != null ? String(info.blksize) : '—'],
        ['Volume', info.migrated ? 'MIGRATED' : (info.volume ?? '—')],
    ];
    const attrTable = renderTable(['Attribute', 'Value'], attrRows);
    const sections = [{ heading: 'Attributes', body: attrTable }];
    if (members != null) {
        const memberHeader = `Total members: ${members.total}`;
        if (members.recent.length === 0) {
            sections.push({ heading: 'Members', body: memberHeader });
        } else {
            const rows = members.recent.map((m) => [m.name, m.modified ?? '—', m.user ?? '—']);
            const table = renderTable(['Member', 'Modified', 'User'], rows);
            const note =
                members.total > members.recent.length
                    ? `\n[Showing ${members.recent.length} most-recently-modified of ${members.total} total]`
                    : '';
            sections.push({ heading: 'Members', body: `${memberHeader}\n\n${table}${note}` });
        }
    }
    return formatStructuredResponse(`Dataset Info — ${info.name}`, sections);
}
/** Format a USS directory listing with permissions, ownership, size, modified date, and type counts. */
export function formatUssListing(
    path: string,
    entries: UssEntry[],
    opts?: {
        totalCount?: number;
    },
): string {
    if (entries.length === 0) return `Directory ${path} is empty.`;
    const rows = entries.map((entry) => {
        const nameCell =
            entry.type === 'symlink' && entry.target
                ? `${entry.name} -> ${entry.target}`
                : entry.name;
        return [
            entry.mode ?? '—',
            entry.user ?? '—',
            entry.group ?? '—',
            entry.size != null ? String(entry.size) : '—',
            entry.modified ?? '—',
            entry.type,
            nameCell,
        ];
    });
    // Build type-count summary
    const counts: Record<string, number> = {};
    for (const e of entries) counts[e.type] = (counts[e.type] ?? 0) + 1;
    const summary = ['file', 'directory', 'symlink', 'other']
        .filter((t) => counts[t])
        .map(
            (t) =>
                `${counts[t]} ${t}${counts[t] > 1 ? (t === 'directory' ? 'ies' : 's') : t === 'directory' ? 'y' : ''}`,
        )
        .join(', ');
    const total = opts?.totalCount ?? entries.length;
    const shown = entries.length;
    const countLine =
        shown < total
            ? `USS listing of ${path} (showing ${shown} of ${total} entries — ${summary})\n\n`
            : `USS listing of ${path} (${shown} entries — ${summary})\n\n`;
    return (
        countLine + renderTable(['Mode', 'User', 'Group', 'Size', 'Modified', 'Type', 'Name'], rows)
    );
}
/** Format a failed-job analysis bundle (compact single-section). */
export function formatFailureAnalysis(analysis: JobFailureAnalysis): string {
    const { job } = analysis;
    const stepInfo = analysis.failedStep ?? analysis.cancelledStep ?? '(unknown)';
    const lines = [
        `Job:       ${job.jobName} (${job.jobId})`,
        `Status:    ${job.returnCode ?? job.status}`,
        `Step:      ${stepInfo}${analysis.failedProgram ? ` — ${analysis.failedProgram}` : ''}`,
        analysis.cancelledStep ? `Cancelled: Yes (step ${analysis.cancelledStep})` : null,
        `Reason:    ${analysis.reason}`,
    ].filter((l) => l != null);
    if (analysis.evidence.length > 0) {
        lines.push(`Spool:     ${analysis.evidence[0]}`);
        for (const extra of analysis.evidence.slice(1)) {
            lines.push(`           ${extra}`);
        }
    }
    lines.push(`Fix:       ${analysis.suggestedFix}`);
    return lines.join('\n');
}
/**
 * Rich 3-section failure analysis formatter for AI agent consumption.
 * Produces Summary / Evidence / Remediation sections.
 */
export function formatAnalysisFull(
    analysis: JobFailureAnalysis,
    opts?: {
        includeEvidence?: boolean;
    },
): string {
    const { job } = analysis;
    const includeEvidence = opts?.includeEvidence !== false;
    const stepInfo = analysis.failedStep ?? analysis.cancelledStep ?? '(not identified)';
    const failed = isFailedJob(job);
    // Section 1: Summary
    const summaryLines = [
        `Job:          ${job.jobName} (${job.jobId})`,
        `Owner:        ${job.owner}`,
        `Status:       ${job.returnCode ?? job.status}${failed ? '  ✗' : '  ✓'}`,
        `Failed Step:  ${stepInfo}`,
        analysis.failedProgram ? `Program:      ${analysis.failedProgram}` : null,
        analysis.abendCode ? `Abend Code:   ${analysis.abendCode}` : null,
        analysis.cancelledStep ? `Cancelled:    Yes (step ${analysis.cancelledStep})` : null,
        `Reason:       ${analysis.reason}`,
    ].filter((l) => l != null);
    const sections = [{ heading: 'Summary', body: summaryLines.join('\n') }];
    // Section 2: Evidence
    if (includeEvidence) {
        const evidenceBody =
            analysis.evidence.length === 0
                ? '[No diagnostic evidence collected from spool output]'
                : analysis.evidence.map((line, i) => `  ${i + 1}. ${line}`).join('\n');
        sections.push({ heading: 'Evidence (from spool)', body: evidenceBody });
    }
    // Section 3: Remediation
    sections.push({ heading: 'Remediation', body: analysis.suggestedFix });
    return formatStructuredResponse(
        `Job Failure Analysis — ${job.jobName} (${job.jobId})`,
        sections,
    );
}
/** Format a single abend-code reference entry for agent consumption. */
export function formatAbendInfo(info: AbendCodeInfo): string {
    const causeLines = info.commonCauses.map((cause) => `  • ${cause}`).join('\n');
    return [
        `Code:     ${info.code}`,
        `Title:    ${info.title}`,
        `Category: ${info.category}`,
        '',
        'Explanation:',
        info.explanation,
        '',
        'Common causes:',
        causeLines,
        '',
        `Fix:      ${info.suggestedFix}`,
    ].join('\n');
}
/** Format a catalog of abend codes as a compact table. */
export function formatAbendCatalog(entries: AbendCodeInfo[]): string {
    if (entries.length === 0) return 'No abend codes matched the search.';
    const rows = entries.map((entry) => [entry.code, entry.category, entry.title]);
    const header = `Abend Code Reference (${entries.length} entries)\n\n`;
    return header + renderTable(['Code', 'Category', 'Title'], rows);
}
