/**
 * Raw REST calls.
 *
 * A thin layer over the Zowe SDK's HTTP client for the endpoints that have no
 * dedicated SDK (CICS CMCI and Db2 REST), plus the z/OSMF paths the SDK does
 * not cover. Its one added value is turning transport failures into
 * {@link ConnectionError}, so callers get "cannot reach the host" rather than
 * a raw socket error.
 */
import type { Session } from '@zowe/imperative';
import { RestClient } from '@zowe/imperative';
import { ConnectionError, normalizeError } from '../utils/errors.js';
import { retryReadOnly } from '../utils/async.js';

/** Network-level failures worth reporting as a connection problem. */
const TRANSPORT_FAILURE = /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|certificate/i;

function asConnectionError(err: unknown, resource: string): Error {
    const normalized = normalizeError(err);
    if (TRANSPORT_FAILURE.test(normalized.message)) {
        return new ConnectionError(`REST call failed for ${resource}: ${normalized.message}`);
    }
    return normalized;
}

/** GET a JSON body. */
export async function getJson<T extends object>(session: Session, resource: string): Promise<T> {
    try {
        return await retryReadOnly(() => RestClient.getExpectJSON<T>(session, resource));
    } catch (err) {
        throw asConnectionError(err, resource);
    }
}

/** GET a plain-text body (CMCI answers in XML, which arrives as text). */
export async function getText(session: Session, resource: string): Promise<string> {
    try {
        return await retryReadOnly(() => RestClient.getExpectString(session, resource));
    } catch (err) {
        throw asConnectionError(err, resource);
    }
}

/** POST a JSON body and read a JSON reply. */
export async function postJson<T extends object>(
    session: Session,
    resource: string,
    body: unknown,
): Promise<T> {
    try {
        return await RestClient.postExpectJSON<T>(session, resource, [], body);
    } catch (err) {
        throw asConnectionError(err, resource);
    }
}
