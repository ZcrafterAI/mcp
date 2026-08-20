import assert from 'node:assert/strict';
import test from 'node:test';
import {
    ConfigError,
    MainframeMcpError,
    NotFoundError,
    ValidationError,
    normalizeError,
    toToolErrorResult,
} from '../dist/utils/errors.js';
import {
    formatAbendCatalog,
    formatAbendInfo,
    formatAnalysisFull,
    formatContentHeader,
    formatDatasetInfo,
    formatDatasetList,
    formatFailureAnalysis,
    formatJobList,
    formatJobStatus,
    formatMemberList,
    formatSpoolFiles,
    formatStructuredResponse,
    formatUssListing,
    renderTable,
    textResult,
    truncateLines,
} from '../dist/utils/formatters.js';
import { buildDatasetPattern, globToRegExp } from '../dist/utils/glob.js';
import { isFailedJob } from '../dist/utils/job-status.js';
import { asText, listItems } from '../dist/zowe/response.js';
import {
    requireCmciContext,
    requireDb2Config,
    requireRacfAuditSource,
} from '../dist/zowe/requirements.js';
import { configSchema } from '../dist/config/schema.js';

const job = (returnCode = 'CC 0000') => ({
    jobName: 'PAYJOB',
    jobId: 'JOB00001',
    owner: 'DEV1',
    status: 'OUTPUT',
    returnCode,
});

function config(enterprise = {}) {
    return configSchema.parse({
        zosmf: { host: 'mainframe.example', user: 'USER1', password: 'secret' },
        mcp: {},
        limits: {},
        security: {},
        enterprise,
    });
}

test('glob and dataset patterns are escaped, anchored, and case-aware', () => {
    assert.equal(globToRegExp('SYS1.*').test('SYS1.PROCLIB'), true);
    assert.equal(globToRegExp('SYS1.?').test('SYS1.A'), true);
    assert.equal(globToRegExp('A.B').test('AxB'), false);
    assert.equal(globToRegExp('prod.*', { caseInsensitive: true }).test('PROD.DATA'), true);
    assert.equal(buildDatasetPattern('sys1'), 'SYS1.*');
    assert.equal(buildDatasetPattern('sys1', 'proc*'), 'SYS1.PROC*');
    assert.equal(buildDatasetPattern('prod.*.load', '*'), 'PROD.*.LOAD');
    assert.equal(buildDatasetPattern('sys1.proclib', '*'), 'SYS1.PROCLIB');
});

test('job failure classification handles pending, success, CC, abend, and cancellation', () => {
    assert.equal(isFailedJob(job(null)), false);
    assert.equal(isFailedJob(job('CC 0000')), false);
    assert.equal(isFailedJob(job('CC 0004')), false);
    assert.equal(isFailedJob(job('CC 0008')), true);
    assert.equal(isFailedJob(job('ABEND S0C7')), true);
    assert.equal(isFailedJob(job('JCL ERROR')), true);
    assert.equal(isFailedJob(job('CANCELLED')), true);
    assert.equal(isFailedJob(job('UNKNOWN')), false);
});

test('response helpers preserve arrays and render unknown values safely', () => {
    const items = [{ name: 'A' }];
    assert.equal(listItems({ apiResponse: { items } }), items);
    assert.deepEqual(listItems({}), []);
    assert.equal(asText(null), '—');
    assert.equal(asText(undefined, 'missing'), 'missing');
    assert.equal(asText('text'), 'text');
    assert.equal(asText(12), '12');
    assert.equal(asText(false), 'false');
    assert.equal(asText(3n), '3');
    assert.equal(asText({ ok: true }), '{"ok":true}');
});

test('configuration requirement guards return settings or actionable errors', () => {
    assert.deepEqual(requireDb2Config(config({ db2Location: 'DB2A' })), { location: 'DB2A' });
    assert.throws(() => requireDb2Config(config()), ConfigError);
    assert.equal(requireCmciContext(config({ cmciContext: 'PLEX1' })), 'PLEX1');
    assert.equal(requireCmciContext(config(), 'REGION1'), 'REGION1');
    assert.throws(() => requireCmciContext(config()), ConfigError);
    assert.deepEqual(requireRacfAuditSource(config({ racfAuditUssPath: '/audit' })), {
        ussPath: '/audit',
        dataset: undefined,
    });
    assert.throws(() => requireRacfAuditSource(config()), ConfigError);
});

test('errors retain codes, normalize Zowe details, and render MCP results', () => {
    const typed = new NotFoundError('missing', { id: 7 });
    assert.equal(normalizeError(typed), typed);
    const imperative = Object.assign(new Error('wrapper'), {
        mDetails: { msg: 'specific failure' },
    });
    assert.equal(normalizeError(imperative).message, 'specific failure');
    assert.equal(normalizeError('plain failure').code, 'UNEXPECTED_ERROR');
    assert.equal(normalizeError(new Error('invalid credentials')).code, 'CONNECTION_ERROR');
    assert.equal(normalizeError(new Error('certificate rejected')).code, 'CONNECTION_ERROR');

    const result = toToolErrorResult(typed);
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /NOT_FOUND/);
    assert.match(result.content[0].text, /id: 7/);
    assert.equal(new MainframeMcpError('bad').code, 'MAINFRAME_ERROR');
    assert.equal(new ValidationError('bad input').code, 'VALIDATION_ERROR');
});

test('base formatting primitives handle empty and populated content', () => {
    assert.deepEqual(textResult('hello'), { content: [{ type: 'text', text: 'hello' }] });
    assert.match(formatStructuredResponse('Title', [{ heading: 'One', body: 'Body' }]), /1\. ONE/);
    assert.match(renderTable(['A'], []), /A/);
    assert.match(renderTable(['A'], [['value']]), /value/);
    assert.deepEqual(truncateLines('a\nb', 3), { text: 'a\nb', truncated: false, totalLines: 2 });
    assert.equal(truncateLines('a\nb\nc', 2).truncated, true);
    assert.match(formatContentHeader('DATA', true, 10, 2), /Showing first 2 of 10/);
    assert.doesNotMatch(formatContentHeader('DATA', false, 1, 2), /Showing/);
});

test('job, dataset, member, and spool formatters cover empty and detailed states', () => {
    assert.match(formatJobList([]), /No jobs/);
    assert.match(formatJobList([job()], 2, { owner: 'DEV1', status: 'OUTPUT' }), /filters:/);
    assert.match(
        formatJobStatus({ ...job('CC 0008'), class: 'A', subsystem: 'JES2', phase: 'PHASE' }),
        /Failed:\s+Yes/,
    );
    assert.match(formatJobStatus(job(null)), /pending/);
    assert.match(formatSpoolFiles('PAYJOB', 'JOB00001', []), /No spool/);
    assert.match(
        formatSpoolFiles('PAYJOB', 'JOB00001', [{ id: 1, ddName: 'JESMSGLG' }]),
        /JESMSGLG/,
    );

    const datasets = [{ name: 'DEV.DATA', dsorg: 'PS', recfm: 'FB', lrecl: 80, migrated: false }];
    assert.match(formatDatasetList([]), /No datasets/);
    assert.match(
        formatDatasetList(datasets, { maxResults: 1, totalMatched: 2 }),
        /Showing first 1 of 2/,
    );
    assert.match(formatMemberList('DEV.PDS', []), /No members/);
    assert.match(formatMemberList('DEV.PDS', [], 'PAY*'), /PAY\*/);
    assert.match(formatMemberList('DEV.PDS', [{ name: 'PAY', modified: '2026-01-01' }]), /PAY/);
    assert.match(formatMemberList('DEV.PDS', [{ name: 'PAY', user: 'DEV1', size: 10 }]), /DEV1/);
    assert.match(
        formatDatasetInfo({ ...datasets[0], pdse: true }, { total: 0, recent: [] }),
        /PDSE/,
    );
    assert.match(
        formatDatasetInfo(datasets[0], { total: 2, recent: [{ name: 'PAY' }] }),
        /most-recently/,
    );
});

test('USS and failure-analysis formatters expose relevant context', () => {
    assert.match(formatUssListing('/u/dev', []), /empty/);
    assert.match(
        formatUssListing(
            '/u/dev',
            [
                { name: 'src', type: 'directory' },
                { name: 'latest', type: 'symlink', target: 'src' },
            ],
            { totalCount: 3 },
        ),
        /showing 2 of 3/,
    );

    const analysis = {
        job: job('ABEND S0C7'),
        abendCode: 'S0C7',
        failedStep: 'STEP10',
        cancelledStep: null,
        failedProgram: 'PAYROLL',
        reason: 'Data exception',
        evidence: ['IGZ0006S'],
        suggestedFix: 'Validate numeric input.',
    };
    assert.match(formatFailureAnalysis(analysis), /PAYROLL/);
    assert.match(formatAnalysisFull(analysis), /EVIDENCE/);
    assert.doesNotMatch(formatAnalysisFull(analysis, { includeEvidence: false }), /EVIDENCE/);
});

test('abend formatters handle catalog and detail displays', () => {
    const info = {
        code: 'S0C7',
        title: 'Data Exception',
        category: 'system',
        explanation: 'Invalid numeric data.',
        commonCauses: ['Bad input'],
        suggestedFix: 'Validate the input.',
    };
    assert.match(formatAbendInfo(info), /Bad input/);
    assert.equal(formatAbendCatalog([]), 'No abend codes matched the search.');
    assert.match(formatAbendCatalog([info]), /S0C7/);
});
