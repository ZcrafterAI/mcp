/**
 * Map values concurrently while keeping result order and limiting pressure on
 * z/OSMF. A rejection stops the operation and is propagated to the caller.
 */
export async function mapConcurrent<T, R>(
    values: readonly T[],
    concurrency: number,
    mapper: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
    if (values.length === 0) return [];

    const workerCount = Math.min(Math.max(1, Math.floor(concurrency)), values.length);
    const results = new Array<R>(values.length);
    let nextIndex = 0;

    async function worker(): Promise<void> {
        while (nextIndex < values.length) {
            const index = nextIndex;
            nextIndex += 1;
            results[index] = await mapper(values[index], index);
        }
    }

    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    return results;
}

const retryableReadStatuses = new Set([429, 500, 502, 503, 504]);

const nonRetryableReadTerms = [
    'unauthorized',
    'forbidden',
    'validation',
    'invalid',
    'not found',
    'not_found',
    'authentication',
    'permission denied',
    'bad request',
];

const retryableReadTerms = [
    'timeout',
    'timed out',
    'econnreset',
    'connection reset',
    'socket hang up',
    'temporarily unavailable',
    'service unavailable',
    'bad gateway',
    'gateway timeout',
];

export interface ReadRetryOptions {
    delayMs?: number;
    sleep?: (delayMs: number) => Promise<void>;
}

function errorText(error: unknown): string {
    if (error instanceof Error) {
        return error.message.toLowerCase();
    }

    return String(error).toLowerCase();
}

function errorStatus(error: unknown): number | undefined {
    if (typeof error === 'object' && error !== null) {
        const candidate = error as {
            status?: unknown;
            statusCode?: unknown;
            response?: { status?: unknown };
        };

        for (const status of [candidate.status, candidate.statusCode, candidate.response?.status]) {
            if (typeof status === 'number') {
                return status;
            }
        }
    }

    const match = errorText(error).match(/\b(?:http(?:\(s\))?\s*(?:status\s*)?)?(\d{3})\b/);
    return match ? Number(match[1]) : undefined;
}

export function isRetryableReadError(error: unknown): boolean {
    const text = errorText(error);

    if (nonRetryableReadTerms.some((term) => text.includes(term))) {
        return false;
    }

    const status = errorStatus(error);
    if (status !== undefined) {
        return retryableReadStatuses.has(status);
    }

    return retryableReadTerms.some((term) => text.includes(term));
}

function sleep(delayMs: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, delayMs));
}

/**
 * Retry one safe read after a temporary upstream failure.
 *
 * Never use this helper for a write, delete, submit, or authentication
 * operation: callers must pass only idempotent reads.
 */
export async function retryReadOnly<T>(
    operation: () => Promise<T>,
    options: ReadRetryOptions = {},
): Promise<T> {
    try {
        return await operation();
    } catch (error) {
        if (!isRetryableReadError(error)) {
            throw error;
        }

        await (options.sleep ?? sleep)(options.delayMs ?? 125);
        return operation();
    }
}
