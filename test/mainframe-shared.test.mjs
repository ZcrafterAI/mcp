import assert from 'node:assert/strict';
import test from 'node:test';
import pino from 'pino';
import { RestClient } from '@zowe/imperative';
import { Get as FileGet, List as FileList } from '@zowe/zos-files-for-zowe-sdk';
import { GetJobs } from '@zowe/zos-jobs-for-zowe-sdk';
import { configSchema } from '../dist/config/schema.js';
import { NotFoundError, ValidationError } from '../dist/utils/errors.js';
import {
    assertValidMemberName,
    getDatasetInfo,
    listDatasets,
    listMembers,
    listMembersWithStats,
    normalizeDataset,
    normalizeMember,
    readDataset,
} from '../dist/tools/datasets/shared.js';
import {
    analyzeJobFailure,
    analyzeJobFailureFromText,
    collectEvidence,
    fetchDiagnosticSpool,
    fetchJob,
    fetchQuickFailureStep,
    fetchRawJob,
    fetchSpoolContent,
    fetchSpoolFiles,
    findCancelledStep,
    findFailedProgram,
    findFailedStep,
    latestSpoolFilesByDd,
    listJobs,
    normalizeJob,
    normalizeSpoolFile,
} from '../dist/tools/jobs/shared.js';
import {
    listUssDirectory,
    normalizePath,
    normalizeUssEntry,
    readUssFile,
    sortUssEntries,
    validateAbsolutePath,
} from '../dist/tools/uss/shared.js';
import {
    assertValidApplid,
    normalizeApplid,
    normalizeCicsStatus,
} from '../dist/tools/cics/shared.js';
import { sanitizeSqlLiteral } from '../dist/tools/db2/shared.js';
import { getCicsRegion, listCicsRegions, listCicsTransactions } from '../dist/tools/cics/shared.js';
import { executeDb2Sql, listDb2Subsystems, searchDb2Catalog } from '../dist/tools/db2/shared.js';
import { fetchSmfMetrics } from '../dist/tools/smf/shared.js';
import { loadRacfAuditRecords, queryRacfAudit } from '../dist/tools/security/shared.js';
import { buildRootCauseReport, predictBatchFailures } from '../dist/tools/analysis/shared.js';

function ctx(overrides = {}) {
    const config = configSchema.parse({
        zosmf: { host: 'mainframe.example', user: 'USER1', password: 'secret' },
        mcp: {},
        limits: {},
        enterprise: {},
        security: {},
        ...overrides,
    });
    return { config, logger: pino({ level: 'silent' }), session: {} };
}

const rawJob = (overrides = {}) => ({
    jobname: 'PAYJOB',
    jobid: 'JOB00001',
    owner: 'DEV1',
    status: 'OUTPUT',
    retcode: 'ABEND S0C7',
    class: 'A',
    subsystem: 'JES2',
    'phase-name': 'OUTPUT',
    ...overrides,
});

test('dataset helpers normalize SDK shapes and perform read-only calls', async (t) => {
    t.mock.method(FileList, 'dataSet', async () => ({
        apiResponse: {
            items: [
                {
                    dsname: 'DEV.PDS',
                    dsorg: 'PO-E',
                    dsntype: 'LIBRARY',
                    recfm: 'FB',
                    lrecl: '80',
                    blksize: 800,
                    vol: 'VOL1',
                },
                { dsname: '', migr: 'NO' },
            ],
        },
    }));
    t.mock.method(FileList, 'allMembers', async (_session, _dsn, options) => ({
        apiResponse: {
            items: [
                {
                    member: options.attributes ? 'FULL' : 'BASIC',
                    m4date: '2026-08-20',
                    vers: 2,
                    id: 'DEV1',
                    size: '12',
                },
                { member: '' },
            ],
        },
    }));
    t.mock.method(FileGet, 'dataSet', async () => Buffer.from('HELLO'));

    assert.deepEqual(normalizeDataset({ dsname: 'MIGR', vol: 'MIGRAT', lrecl: '80' }), {
        name: 'MIGR',
        dsorg: undefined,
        recfm: undefined,
        lrecl: 80,
        blksize: undefined,
        volume: undefined,
        migrated: true,
        pdse: undefined,
    });
    assert.equal(
        normalizeMember({ member: 'PAY', c4date: '2026-01-01', changed: '12:00', vers: 1 })
            .modified,
        '2026-01-01',
    );
    assert.doesNotThrow(() => assertValidMemberName('@GOOD1'));
    assert.throws(() => assertValidMemberName('TOO-LONG!'), ValidationError);

    const datasets = await listDatasets(ctx(), 'DEV.*');
    assert.equal(datasets.length, 1);
    assert.equal(datasets[0].pdse, true);
    assert.equal((await listMembers(ctx(), 'DEV.PDS'))[0].name, 'BASIC');
    assert.equal((await listMembersWithStats(ctx(), 'DEV.PDS'))[0].user, 'DEV1');
    assert.equal(await readDataset(ctx(), 'DEV.PDS', 'PAY'), 'HELLO');
    assert.equal((await getDatasetInfo(ctx(), 'DEV.PDS')).name, 'DEV.PDS');
});

test('dataset helpers map empty reads and missing catalog entries to not-found', async (t) => {
    t.mock.method(FileGet, 'dataSet', async () => null);
    await assert.rejects(readDataset(ctx(), 'DEV.EMPTY'), NotFoundError);

    t.mock.method(FileList, 'dataSet', async () => ({ apiResponse: { items: [] } }));
    await assert.rejects(getDatasetInfo(ctx(), 'DEV.MISSING'), NotFoundError);
});

test('job helpers normalize, fetch, list, deduplicate, and analyze spool data', async (t) => {
    t.mock.method(GetJobs, 'getJob', async () => rawJob());
    const getJobs = t.mock.method(GetJobs, 'getJobsByParameters', async () => [
        rawJob(),
        rawJob({ jobid: 'JOB00002', status: 'ACTIVE', retcode: undefined }),
    ]);
    t.mock.method(GetJobs, 'getSpoolFiles', async () => [
        { id: 1, ddname: 'JESMSGLG', stepname: 'OLD' },
        { id: 3, ddname: 'jesmsglg', stepname: 'STEP10', 'record-count': 5 },
        { id: 2, ddname: 'SYSOUT' },
        { id: 4, ddname: 'IGNORED' },
    ]);
    t.mock.method(GetJobs, 'getSpoolContentById', async (_s, _n, _i, id) =>
        id === 3
            ? 'IEF450I PAYJOB STEP10 PROC - ABEND S0C7\nMODULE PAYROLL NOT FOUND'
            : 'SYSOUT text',
    );

    assert.equal(normalizeJob(rawJob()).status, 'OUTPUT');
    assert.equal(normalizeJob(rawJob({ status: 'mystery' })).status, 'UNKNOWN');
    assert.equal(normalizeSpoolFile({ id: 1, ddname: 'JESMSGLG' }).ddName, 'JESMSGLG');
    assert.equal((await fetchRawJob(ctx(), 'JOB00001')).jobname, 'PAYJOB');
    assert.equal((await fetchJob(ctx(), 'JOB00001')).jobId, 'JOB00001');
    assert.equal((await listJobs(ctx(), 'DEV1', '*')).length, 2);
    await listJobs(ctx(), 'DEV1', 'PAY*', { maxJobs: 25, activeOnly: true });
    assert.deepEqual(getJobs.mock.calls.at(-1).arguments[1], {
        owner: 'DEV1',
        prefix: 'PAY*',
        maxJobs: 25,
        status: 'ACTIVE',
    });
    assert.deepEqual(
        latestSpoolFilesByDd([
            { id: 1, ddName: 'SYSOUT' },
            { id: 2, ddName: 'sysout' },
        ]),
        [{ id: 2, ddName: 'sysout' }],
    );
    assert.equal((await fetchSpoolFiles(ctx(), 'PAYJOB', 'JOB00001')).length, 3);
    assert.match(await fetchSpoolContent(ctx(), 'PAYJOB', 'JOB00001', 3), /S0C7/);
    assert.equal((await fetchDiagnosticSpool(ctx(), 'PAYJOB', 'JOB00001')).length, 2);
    assert.equal((await fetchDiagnosticSpool(ctx(), 'PAYJOB', 'JOB00001', 'JESMSGLG')).length, 1);
    assert.deepEqual(await fetchDiagnosticSpool(ctx(), 'PAYJOB', 'JOB00001', 'NOPE'), []);
    assert.equal(await fetchQuickFailureStep(ctx(), 'PAYJOB', 'JOB00001'), 'STEP10');
    assert.equal((await analyzeJobFailure(ctx(), 'JOB00001')).abendCode, 'S0C7');
});

test('job fetch maps misses and unexpected SDK errors correctly', async (t) => {
    const getJob = t.mock.method(GetJobs, 'getJob', async () => undefined);
    await assert.rejects(fetchRawJob(ctx(), 'JOB99999'), NotFoundError);
    getJob.mock.mockImplementation(async () => {
        throw new Error('HTTP 404 not found');
    });
    await assert.rejects(fetchRawJob(ctx(), 'JOB99999'), NotFoundError);
    getJob.mock.mockImplementation(async () => {
        throw new Error('unexpected SDK failure');
    });
    await assert.rejects(fetchRawJob(ctx(), 'JOB99999'), /unexpected SDK failure/);
});

test('failure heuristics cover abend, condition code, cancellation, programs, and fallbacks', () => {
    assert.equal(findFailedStep('IEF450I JOB STEP1 PROC - ABEND S806'), 'STEP1');
    assert.equal(findFailedStep('IEF142I JOB STEP2 WAS EXECUTED COND CODE 0012'), 'STEP2');
    assert.equal(findFailedStep('IEF142I JOB STEP2 WAS EXECUTED COND CODE 0000'), null);
    assert.equal(findCancelledStep('IEF473I JOB STEP3 PROC CANCELLED'), 'STEP3');
    assert.equal(findCancelledStep('STEP STEP4 WAS CANCELLED'), 'STEP4');
    assert.equal(findFailedProgram('MODULE PAYPROG NOT FOUND'), 'PAYPROG');
    assert.equal(findFailedProgram('IEF285I PAYLOAD NOT FOUND'), 'PAYLOAD');
    assert.equal(findFailedProgram('CSV003I FAILED TO LOAD MOD1'), 'MOD1');
    assert.equal(findFailedProgram('nothing useful'), null);
    assert.equal(collectEvidence('ABEND S0C7\nABEND S0C7\nnoise', 'S0C7').length, 1);

    const base = normalizeJob(rawJob());
    assert.match(
        analyzeJobFailureFromText(base, [{ ddName: 'JES', text: 'ABEND S0C7' }]).reason,
        /Data Exception/,
    );
    assert.match(
        analyzeJobFailureFromText({ ...base, returnCode: 'ABEND U9999' }, []).reason,
        /No reference/,
    );
    assert.match(
        analyzeJobFailureFromText({ ...base, returnCode: 'CANCELLED' }, [
            { ddName: 'JES', text: 'STEP STEP4 CANCELLED' },
        ]).reason,
        /cancelled/,
    );
    assert.match(
        analyzeJobFailureFromText({ ...base, returnCode: 'JCL ERROR' }, []).reason,
        /unsuccessfully/,
    );
    assert.match(
        analyzeJobFailureFromText({ ...base, returnCode: 'CC 0000' }, []).reason,
        /completed normally/,
    );
});

test('USS helpers validate paths, normalize entries, sort, list, and read', async (t) => {
    assert.equal(normalizePath('/u/dev/'), '/u/dev');
    assert.equal(normalizePath('/'), '/');
    assert.throws(() => validateAbsolutePath(''), ValidationError);
    assert.throws(() => validateAbsolutePath('relative'), ValidationError);
    assert.throws(() => validateAbsolutePath('/u/dev/../secret'), ValidationError);
    assert.doesNotThrow(() => validateAbsolutePath('/u/dev/file'));
    assert.equal(normalizeUssEntry({ name: 'dir', mode: 'drwx', id: 3 }).type, 'directory');
    assert.equal(
        normalizeUssEntry({ name: 'link', mode: 'lrwx', linkTarget: 'file' }).target,
        'file',
    );
    assert.equal(normalizeUssEntry({ name: 'odd', mode: '?' }).type, 'other');

    const entries = [
        { name: 'b', type: 'file', size: 2, modified: '2025' },
        { name: 'A', type: 'directory', size: 1, modified: '2026' },
    ];
    assert.equal(sortUssEntries(entries, 'name')[0].name, 'A');
    assert.equal(sortUssEntries(entries, 'size')[0].name, 'b');
    assert.equal(sortUssEntries(entries, 'modified')[0].name, 'A');
    assert.equal(sortUssEntries(entries, 'type')[0].type, 'directory');

    t.mock.method(FileList, 'fileList', async () => ({
        apiResponse: {
            items: [
                { name: '.', mode: 'drwx' },
                { name: '..', mode: 'drwx' },
                { name: 'file', mode: '-rw-', size: 5 },
            ],
        },
    }));
    t.mock.method(FileGet, 'USSFile', async () => Buffer.from('USS DATA'));
    assert.deepEqual(
        (await listUssDirectory(ctx(), '/u/dev')).map((e) => e.name),
        ['file'],
    );
    assert.equal(await readUssFile(ctx(), '/u/dev/file'), 'USS DATA');
});

test('CICS and Db2 input helpers reject unsafe values and normalize status', () => {
    assert.equal(normalizeApplid(' cics1 '), 'CICS1');
    assert.doesNotThrow(() => assertValidApplid('CICS@1'));
    assert.throws(() => assertValidApplid(''), ValidationError);
    assert.throws(() => assertValidApplid('TOO-LONG-ID'), ValidationError);
    assert.equal(normalizeCicsStatus('enabled'), 'ACTIVE');
    assert.equal(normalizeCicsStatus('disabled'), 'INACTIVE');
    assert.equal(normalizeCicsStatus(undefined), 'UNKNOWN');
    assert.equal(sanitizeSqlLiteral("O'HARE; DROP--comment\n/*x*/"), "O''HARE DROP");
    assert.equal(sanitizeSqlLiteral('x'.repeat(100)).length, 64);
});

test('CICS read workflows map and filter mocked CMCI responses', async (t) => {
    t.mock.method(RestClient, 'getExpectString', async (_session, resource) => {
        if (resource.includes('CICSTransaction')) {
            return '<row><col name="TRANID">PAY1</col><col name="PROGRAM">PAYPGM</col><col name="STATUS">ENABLED</col><col name="TASKCOUNT">2</col></row><row><col name="TRANID">OTHER</col><col name="STATUS">DISABLED</col></row>';
        }
        if (resource.includes('MISSING')) return '<response></response>';
        return '<row><col name="APPLID">CICS1</col><col name="STATUS">ENABLED</col><col name="JOBNAME">CICSJOB</col></row><row><col name="APPLID">CICS2</col><col name="STATUS">DISABLED</col></row>';
    });
    const cicsCtx = ctx({ enterprise: { cmciContext: 'PLEX1' } });
    assert.deepEqual(
        (await listCicsRegions(cicsCtx, undefined, 'active')).map((r) => r.applid),
        ['CICS1'],
    );
    assert.equal((await getCicsRegion(cicsCtx, 'cics1')).jobname, 'CICSJOB');
    assert.equal((await getCicsRegion(cicsCtx, 'missing')).status, 'NOT FOUND');
    const transactions = await listCicsTransactions(cicsCtx, 'CICS1', undefined, 'pay', 'active');
    assert.deepEqual(
        transactions.map((item) => item.tranid),
        ['PAY1'],
    );
    assert.equal(transactions[0].program, 'PAYPGM');
});

test('Db2 workflows execute SQL, map catalog rows, and fall back safely', async (t) => {
    const post = t.mock.method(
        RestClient,
        'postExpectJSON',
        async (_session, resource, _headers, body) => {
            if (resource === '/v4/locations') return { locations: ['DB2A', 'DB2B'] };
            if (!/SYSIBM\.SYSTABLES/.test(body.sql)) return { rows: [{ NAME: 'ONE' }] };
            return {
                rows: [
                    {
                        CREATOR: 'DEV1',
                        NAME: 'PAYROLL',
                        TYPE: 'T',
                        ROWCOUNT: '42',
                        CREATED: '2026-01-01',
                        REMARKS: ' payroll table ',
                    },
                    { creator: 'DEV2', name: 'V_PAY', type: 'V', remarks: '' },
                ],
            };
        },
    );
    const db2Ctx = ctx({ enterprise: { db2Location: 'DB2A' } });
    assert.deepEqual(await listDb2Subsystems(db2Ctx), ['DB2A', 'DB2B']);
    assert.equal((await executeDb2Sql(db2Ctx, 'SELECT 1'))[0].NAME, 'ONE');
    const catalog = await searchDb2Catalog(db2Ctx, 'PAY*', 'DEV1', 'TABLE', 500);
    assert.equal(catalog[0].type, 'TABLE');
    assert.equal(catalog[0].rowCount, '42');
    assert.equal(catalog[1].remarks, undefined);

    post.mock.mockImplementation(async () => {
        throw new Error('location service unavailable');
    });
    assert.deepEqual(await listDb2Subsystems(db2Ctx), ['DB2A']);
    post.mock.mockImplementation(async () => ({ error: 'bad SQL', sqlState: '42601' }));
    await assert.rejects(executeDb2Sql(db2Ctx, 'BAD'), /42601/);
});

test('SMF and RACF helpers combine configured mocked sources and filters', async (t) => {
    t.mock.method(RestClient, 'getExpectJSON', async () => ({ cpuUtil: 80, ioRate: 4 }));
    t.mock.method(FileGet, 'dataSet', async (_session, target) => {
        if (target === 'DEV.SMF') return Buffer.from('CPU_BUSY=70\nERROR_COUNT=2');
        return Buffer.from(
            '2026-08-20T12:00:00 USER= DEV1 RESOURCE= DEV.DATA CLASS= DATASET ACCESS= READ RC= 0',
        );
    });

    const smfCtx = ctx({ enterprise: { rmfMetricsEnabled: true, smfSummaryDataset: 'DEV.SMF' } });
    const metrics = await fetchSmfMetrics(smfCtx, 'cpu');
    assert.ok(metrics.length >= 2);
    assert.ok(
        metrics.every(
            (metric) => metric.name.toLowerCase().includes('cpu') || metric.category === 'cpu',
        ),
    );

    const racfCtx = ctx({ enterprise: { racfAuditDataset: 'DEV.RACF' } });
    assert.equal((await loadRacfAuditRecords(racfCtx)).length, 1);
    assert.equal((await queryRacfAudit(racfCtx, { user: 'DEV1' }, 1))[0].user, 'DEV1');
});

test('analysis workflows correlate mocked failures and score future risk', async (t) => {
    const now = Date.now();
    const jobs = [
        rawJob({ jobid: 'JOB00001', 'exec-ended': new Date(now - 1_000).toISOString() }),
        rawJob({ jobid: 'JOB00002', 'exec-ended': new Date(now - 2_000).toISOString() }),
        rawJob({ jobid: 'JOB00003', 'exec-ended': new Date(now - 3_000).toISOString() }),
        rawJob({
            jobname: 'OTHER',
            jobid: 'JOB00004',
            retcode: 'JCL ERROR',
            'exec-ended': new Date(now - 4_000).toISOString(),
        }),
    ];
    t.mock.method(GetJobs, 'getJob', async () => jobs[0]);
    t.mock.method(GetJobs, 'getJobsByOwnerAndPrefix', async () => jobs);
    t.mock.method(GetJobs, 'getSpoolFiles', async () => [{ id: 1, ddname: 'JESYSMSG' }]);
    t.mock.method(
        GetJobs,
        'getSpoolContentById',
        async () => 'IEF450I PAYJOB STEP10 PROC - ABEND S0C7',
    );

    const report = await buildRootCauseReport(ctx(), 'JOB00001', 24);
    assert.equal(report.confidence, 'HIGH');
    assert.ok(report.similarIncidents.length >= 2);
    assert.ok(report.actionItems.some((item) => item.includes('Recurring failure')));
    assert.ok(report.actionItems.some((item) => item.includes('Systemic abend')));

    const risks = await predictBatchFailures(ctx(), 24, 1);
    assert.equal(risks[0].jobName, 'PAYJOB');
    assert.ok(risks[0].riskScore > 0);
    assert.ok(risks.some((risk) => risk.jobName === 'OTHER'));
});
