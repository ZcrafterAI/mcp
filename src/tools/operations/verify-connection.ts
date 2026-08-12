/**
 * `verify_zosmf_connection` — verify z/OSMF connectivity and auth.
 */
import type { ToolRegistrar } from '../../types/tools.js';
import { GetJobs } from '@zowe/zos-jobs-for-zowe-sdk';
import { getJson } from '../../zowe/rest-client.js';
import { formatStructuredResponse, textResult } from '../../utils/formatters.js';
import { securedHandler } from '../../utils/tool-handler.js';
import { describeConnection } from '../../zowe/profiles.js';
export const registerVerifyConnectionTool: ToolRegistrar = (server, ctx) => {
    server.tool('verify_zosmf_connection', 'Verify z/OSMF connectivity, authentication, and basic API availability.', {}, securedHandler(ctx, 'verify_zosmf_connection', async () => {
        const owner = ctx.config.zosmf.user ?? '*';
        const jobs = await GetJobs.getJobsByOwnerAndPrefix(ctx.session, owner, '*');
        let zosmfVersion = 'unknown';
        try {
            const info = await getJson<{ zosmf_version?: string; version?: string }>(ctx.session, '/info');
            zosmfVersion = info.zosmf_version ?? info.version ?? 'unknown';
        }
        catch {
            // /info may be restricted on some systems; connectivity still proven by job list.
        }
        const connection = describeConnection(ctx.config);
        const body = [
            `Host:          ${connection.host}`,
            `Port:          ${connection.port}`,
            `Auth:          ${connection.auth}`,
            `TLS verify:    ${connection.rejectUnauthorized}`,
            `z/OSMF API:    reachable`,
            `z/OSMF ver:    ${zosmfVersion}`,
            `Jobs visible:  ${jobs.length}`,
        ].join('\n');
        ctx.logger.debug({ jobs: jobs.length }, 'verify_zosmf_connection');
        return textResult(formatStructuredResponse('z/OSMF Connection Check', [
            { heading: 'Status — OK', body },
        ]));
    }));
};
