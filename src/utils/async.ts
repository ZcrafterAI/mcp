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

const retryableReadStatuses = new Set([408, 425, 429, 500, 502, 503, 504]);

const retryableReadCodes = new Set([
    'ECONNABORTED',
    'ECONNREFUSED',
    'ECONNRESET',
    'EHOSTUNREACH',
    'ENETDOWN',
    'ENETUNREACH',
    'ENOTFOUND',
    'EPIPE',
    'ETIMEDOUT',
    'UND_ERR_CONNECT_TIMEOUT',
    'UND_ERR_HEADERS_TIMEOUT',
    'UND_ERR_SOCKET',
]);

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
    retries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    sleep?: (delayMs: number) => Promise<void>;
}

function errorText(error: unknown): string {
    if (error instanceof Error) {
        const details = (error as { mDetails?: { msg?: unknown; additionalDetails?: unknown } })
            .mDetails;
        const detailText = [details?.msg, details?.additionalDetails]
            .filter((value): value is string => typeof value === 'string')
            .join(' ');
        const cause = error.cause ? ` ${errorText(error.cause)}` : '';
        return `${error.name} ${error.message} ${detailText}${cause}`.toLowerCase();
    }

    return String(error).toLowerCase();
}

function errorCode(error: unknown): string | undefined {
    if (typeof error !== 'object' || error === null) return undefined;
    const candidate = error as {
        code?: unknown;
        cause?: unknown;
        mDetails?: { errno?: unknown; errorCode?: unknown; causeErrors?: unknown };
    };
    for (const code of [candidate.code, candidate.mDetails?.errno, candidate.mDetails?.errorCode]) {
        if (typeof code === 'string' && !/^\d{3}$/.test(code)) return code.toUpperCase();
    }
    const detailCause = candidate.mDetails?.causeErrors;
    if (detailCause) return errorCode(detailCause);
    return candidate.cause ? errorCode(candidate.cause) : undefined;
}

function errorStatus(error: unknown): number | undefined {
    if (typeof error === 'object' && error !== null) {
        const candidate = error as {
            status?: unknown;
            statusCode?: unknown;
            response?: { status?: unknown };
            mDetails?: { httpStatus?: unknown; errorCode?: unknown };
        };

        for (const status of [
            candidate.status,
            candidate.statusCode,
            candidate.response?.status,
            candidate.mDetails?.httpStatus,
            candidate.mDetails?.errorCode,
        ]) {
            if (typeof status === 'number') return status;
            if (typeof status === 'string' && /^\d{3}$/.test(status)) return Number(status);
        }
    }

    const match = errorText(error).match(/\bhttp(?:\(s\))?\s*(?:status\s*)?(\d{3})\b/);
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

    const code = errorCode(error);
    if (code !== undefined) {
        return retryableReadCodes.has(code);
    }

    return retryableReadTerms.some((term) => text.includes(term));
}

function sleep(delayMs: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, delayMs));
}

/**
 * Retry a safe read after temporary upstream failures using capped exponential
 * backoff. The default is one retry, which improves resilience without making
 * an interactive command wait through a long retry storm.
 *
 * Never use this helper for a write, delete, submit, or authentication
 * operation: callers must pass only idempotent reads.
 */
export async function retryReadOnly<T>(
    operation: () => Promise<T>,
    options: ReadRetryOptions = {},
): Promise<T> {
    const retries = Math.max(0, Math.floor(options.retries ?? 1));
    const baseDelayMs = Math.max(0, options.baseDelayMs ?? 125);
    const maxDelayMs = Math.max(baseDelayMs, options.maxDelayMs ?? 1_000);

    for (let attempt = 0; ; attempt += 1) {
        try {
            return await operation();
        } catch (error) {
            if (attempt >= retries || !isRetryableReadError(error)) {
                throw error;
            }

            const delayMs = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
            await (options.sleep ?? sleep)(delayMs);
        }
    }
}
