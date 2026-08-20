import assert from 'node:assert/strict';
import test from 'node:test';
import {
    allAbendCodes,
    extractAbendCode,
    lookupAbend,
    normalizeAbendCode,
    searchAbendCodes,
} from '../dist/parsers/abend-codes.js';
import { parseCmciXml } from '../dist/parsers/cmci.js';
import { filterAuditEntries, parseRacfAuditLine } from '../dist/parsers/racf.js';
import { parseRmfJson, parseSmfSummaryText } from '../dist/parsers/smf.js';

test('normalizes, finds, searches, and extracts abend codes', () => {
    assert.equal(normalizeAbendCode(' 806 '), 'S806');
    assert.equal(normalizeAbendCode('u4038'), 'U4038');
    assert.equal(normalizeAbendCode('n/a'), 'N/A');
    assert.equal(lookupAbend('0c7')?.code, 'S0C7');
    assert.equal(lookupAbend('unknown'), undefined);
    assert.ok(allAbendCodes().length > 10);
    assert.deepEqual(
        searchAbendCodes(),
        [...allAbendCodes()].sort((a, b) => a.code.localeCompare(b.code)),
    );
    assert.ok(searchAbendCodes('storage').length > 0);
    assert.deepEqual(searchAbendCodes('definitely-not-an-abend'), []);

    assert.equal(extractAbendCode('STEP ABEND=S806'), 'S806');
    assert.equal(extractAbendCode('SYSTEM COMPLETION CODE=0C7'), 'S0C7');
    assert.equal(extractAbendCode('USER COMPLETION CODE=4038'), 'U4038');
    assert.equal(extractAbendCode('ended with S322'), 'S322');
    assert.equal(extractAbendCode('completed normally'), null);
});

test('parses CMCI rows and XML entities', () => {
    const xml = `
      <response>
        <row><col name="APPLID">CICSPRD1</col><col name="STATUS">ENABLED &amp; OPEN</col></row>
        <row><col name="DESC">&lt;ready&gt; &quot;now&quot; &apos;yes&apos;</col></row>
        <row></row>
      </response>`;
    assert.deepEqual(parseCmciXml(xml), [
        { applid: 'CICSPRD1', status: 'ENABLED & OPEN' },
        { desc: `<ready> "now" 'yes'` },
    ]);
    assert.deepEqual(parseCmciXml('<response/>'), []);
});

test('parses RACF audit formats and applies combined filters', () => {
    const syslog = parseRacfAuditLine(
        'Mar 12 14:30:01 LPAR1 RACF: user PAYUSR resource PROD.PAYROLL access READ result SUCCESS class DATASET',
    );
    assert.equal(syslog.user, 'PAYUSR');
    assert.equal(syslog.accessType, 'READ');
    assert.equal(syslog.class, 'DATASET');

    const irr = parseRacfAuditLine(
        '2026-08-20T12:00:00 USER= ADMIN RESOURCE= SYS1.PROCLIB CLASS= DATASET ACCESS= UPDATE RC= 8',
    );
    assert.equal(irr.user, 'ADMIN');
    assert.equal(irr.resource, 'SYS1.PROCLIB');
    assert.equal(irr.result, '8');

    const generic = parseRacfAuditLine(
        '2026-08-20 13:00:00 user: DEV1 resource: DEV.DATA access: READ result: OK class: DATASET',
    );
    assert.equal(generic.event, 'READ');
    assert.equal(parseRacfAuditLine('   ').raw, '   ');

    const filtered = filterAuditEntries([syslog, irr, generic], {
        user: 'pay',
        resource: 'prod',
        event: 'read',
        result: 'success',
        class: 'dataset',
    });
    assert.deepEqual(filtered, [syslog]);
    assert.deepEqual(filterAuditEntries([syslog], { hours: 1 }), []);
    assert.deepEqual(filterAuditEntries([{ ...syslog, timestamp: 'not-a-date' }], { hours: 1 }), [
        { ...syslog, timestamp: 'not-a-date' },
    ]);
});

test('normalizes nested RMF JSON and summary text', () => {
    const metrics = parseRmfJson({
        system: { cpuUtil: 72, memoryPages: 100, label: 'ignored' },
        channels: [{ ioRate: '12.5' }],
        nothing: null,
    });
    assert.deepEqual(
        metrics.map(({ name, value, category }) => ({ name, value, category })),
        [
            { name: 'system.cpuUtil', value: '72', category: 'cpu' },
            { name: 'system.memoryPages', value: '100', category: 'memory' },
            { name: 'channels[0].ioRate', value: '12.5', category: 'io' },
        ],
    );
    assert.deepEqual(parseRmfJson(null), []);

    assert.deepEqual(parseSmfSummaryText('CPU_BUSY=75\nIO_RATE: 12\nplain record\n'), [
        { name: 'CPU_BUSY', value: '75', category: 'cpu' },
        { name: 'IO_RATE', value: '12', category: 'io' },
        { name: 'record', value: 'plain record' },
    ]);
});
