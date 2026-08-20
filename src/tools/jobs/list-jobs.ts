/**
 * `list_jobs` — list jobs filtered by owner, prefix, or status.
 */
import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { ValidationError } from '../../utils/errors.js';
import { formatJobList, textResult } from '../../utils/formatters.js';
import { listJobs } from './shared.js';
const inputShape = {
    owner: z
        .string()
        .optional()
        .describe('Owner (user id) filter (max 8 chars). Use "*" for all. Defaults to "*".'),
    prefix: z
        .string()
        .optional()
        .describe('Job name prefix filter, wildcards allowed (e.g. "PAY*"). Defaults to "*".'),
    status: z
        .enum(['INPUT', 'ACTIVE', 'OUTPUT'])
        .optional()
        .describe('Optional lifecycle status filter applied after retrieval.'),
    returnCode: z
        .string()
        .optional()
        .describe(
            'Optional return-code prefix filter (case-insensitive), e.g. "ABEND", "JCL ERROR", "CC 00".',
        ),
    maxResults: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
            'Maximum number of jobs to return (default: server configured maxJobListResults).',
        ),
};

export const listJobsTool = defineTool({
    name: 'list_jobs',
    description:
        'List z/OS batch jobs filtered by owner, name prefix, status, or return code. Supports result capping.',
    input: inputShape,
    async run({ owner, prefix, status, returnCode, maxResults }, ctx) {
        const normalizedOwner = (owner ?? '*').trim().toUpperCase();
        const normalizedPrefix = (prefix ?? '*').trim().toUpperCase();
        // Validate owner and prefix lengths (non-wildcard values)
        if (normalizedOwner !== '*' && normalizedOwner.length > 8) {
            throw new ValidationError(
                `Owner filter "${normalizedOwner}" exceeds 8 characters (z/OS user id limit).`,
                { owner: normalizedOwner },
            );
        }
        if (normalizedPrefix !== '*' && normalizedPrefix.replace(/\*/g, '').length > 8) {
            throw new ValidationError(
                `Prefix filter "${normalizedPrefix}" is too long. Job name prefixes are max 8 characters.`,
                { prefix: normalizedPrefix },
            );
        }
        const limit = maxResults ?? ctx.config.limits.maxJobListResults;
        // z/OSMF can apply ACTIVE and max-jobs itself. Do that only when no
        // remaining client-side filter could otherwise change which rows make
        // the final result.
        const canCapAtServer = !returnCode && (!status || status === 'ACTIVE');
        let jobs = await listJobs(ctx, normalizedOwner, normalizedPrefix, {
            maxJobs: canCapAtServer ? limit : undefined,
            activeOnly: status === 'ACTIVE',
        });
        if (status) {
            jobs = jobs.filter((job) => job.status === status);
        }
        if (returnCode) {
            const upper = returnCode.toUpperCase();
            jobs = jobs.filter((job) => (job.returnCode ?? '').toUpperCase().includes(upper));
        }
        const filteredTotal = jobs.length;
        const capped = jobs.slice(0, limit);
        ctx.logger.debug(
            {
                count: capped.length,
                total: filteredTotal,
                owner: normalizedOwner,
                prefix: normalizedPrefix,
                status,
                returnCode,
            },
            'list_jobs',
        );
        return textResult(
            formatJobList(capped, filteredTotal, {
                owner: normalizedOwner,
                prefix: normalizedPrefix,
                status,
                returnCode,
            }),
        );
    },
});
