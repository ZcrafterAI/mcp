/**
 * Map values concurrently while keeping result order and limiting pressure on
 * z/OSMF. A rejection stops the operation and is propagated to the caller.
 */
export async function mapConcurrent<T, R>(
    values: readonly T[],
    concurrency: number,
    mapper: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
    if (values.length === 0)
        return [];

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
