/**
 * Shared USS (Unix System Services) helpers: normalizers and fetch routines.
 */
import type { UssEntry } from '../../types/zos.js';
import type { ToolContext } from '../../types/tools.js';
import { Get, List } from '@zowe/zos-files-for-zowe-sdk';
import { NotFoundError, ValidationError } from '../../utils/errors.js';
import { listItems } from '../../zowe/response.js';
import { assertUssPathAllowed } from '../../policy/rules.js';

/** Raw USS directory entry as returned by the z/OSMF files API. */
interface RawUssItem {
    name?: string;
    mode?: string;
    size?: number;
    user?: string;
    group?: string;
    mtime?: string;
    target?: string;
    linkTarget?: string;
    id?: number;
}

/** Map a Unix mode string's leading char to an entry type. */
function typeFromMode(mode?: string): UssEntry['type'] {
    switch ((mode ?? '').charAt(0)) {
        case 'd':
            return 'directory';
        case 'l':
            return 'symlink';
        case '-':
            return 'file';
        default:
            return 'other';
    }
}
/** Normalize a raw USS list item into our {@link UssEntry} domain type. */
export function normalizeUssEntry(raw: RawUssItem): UssEntry {
    return {
        name: raw.name ?? '',
        type: typeFromMode(raw.mode),
        size: raw.size,
        user: raw.user,
        group: raw.group,
        mode: raw.mode,
        modified: raw.mtime,
        target: raw.target ?? raw.linkTarget,
        inode: raw.id,
    };
}
/**
 * Normalise a USS path: trim whitespace, strip a trailing slash (unless root),
 * and enforce that it begins with "/" (absolute).
 */
export function normalizePath(path: string): string {
    let p = path.trim();
    // Strip trailing slash unless it is the root "/"
    if (p.length > 1 && p.endsWith('/')) {
        p = p.slice(0, -1);
    }
    return p;
}
/**
 * Assert the path is absolute (starts with "/").
 * Throws {@link ValidationError} for relative paths or empty strings.
 */
export function validateAbsolutePath(path: string): void {
    const normalized = path.trim();
    if (!normalized) {
        throw new ValidationError('USS path must not be empty.', { path });
    }
    if (!normalized.startsWith('/')) {
        throw new ValidationError(
            `USS path "${path}" is not absolute. All USS paths must start with "/".`,
            { path },
        );
    }
    // Prevent path traversal
    if (normalized.includes('/../') || normalized.endsWith('/..')) {
        throw new ValidationError(
            `USS path "${path}" contains directory traversal sequences ("..").`,
            { path },
        );
    }
}
/** Sort USS entries by the given key. Returns a new sorted array. */
export function sortUssEntries(
    entries: UssEntry[],
    sortBy: 'name' | 'size' | 'modified' | 'type',
): UssEntry[] {
    return entries.slice().sort((a, b) => {
        if (sortBy === 'size') {
            // Largest first; entries without a size go to bottom
            return (b.size ?? -1) - (a.size ?? -1);
        }
        if (sortBy === 'modified') {
            // Newest first
            return (b.modified ?? '').localeCompare(a.modified ?? '');
        }
        if (sortBy === 'type') {
            // directories first, then files, then symlinks, then other
            const order = ['directory', 'file', 'symlink', 'other'];
            return order.indexOf(a.type) - order.indexOf(b.type);
        }
        // Default: alphabetical by name (case-insensitive)
        return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });
}
/** List a USS directory. The "." and ".." entries are filtered out. */
export async function listUssDirectory(ctx: ToolContext, path: string): Promise<UssEntry[]> {
    validateAbsolutePath(path);
    assertUssPathAllowed(ctx.config, path);
    const response = await List.fileList(ctx.session, path, {});
    return listItems<RawUssItem>(response)
        .map(normalizeUssEntry)
        .filter((entry) => entry.name && entry.name !== '.' && entry.name !== '..');
}
/** Read a USS file as UTF-8 text. */
export async function readUssFile(ctx: ToolContext, path: string): Promise<string> {
    validateAbsolutePath(path);
    assertUssPathAllowed(ctx.config, path);
    const buffer = await Get.USSFile(ctx.session, path, {});
    if (buffer == null) {
        throw new NotFoundError(`USS file ${path} could not be read or is empty.`, { path });
    }
    return buffer.toString('utf8');
}
