/**
 * `security_posture_summary` — report enterprise security configuration.
 */
import { defineTool } from '../define-tool.js';
import { formatStructuredResponse, renderTable, textResult } from '../../utils/formatters.js';
import { WRITE_TOOLS } from '../../policy/rules.js';
function flag(enabled: unknown): string {
    return enabled ? '✓ ENABLED' : '✗ disabled';
}
function flagInverse(disabled: unknown): string {
    return disabled ? '✓ ENABLED (read-only)' : '✗ disabled (writes allowed)';
}

const inputShape = {};

export const securityPostureSummaryTool = defineTool({
    name: 'security_posture_summary',
    description:
        'Report the server security posture: terms acknowledgement, read-only mode, tool allowlists, TLS, audit logging, resource boundaries, and tiered security recommendations.',
    input: inputShape,
    run(_args, ctx) {
        const { security, zosmf, enterprise } = ctx.config;
        const allowedTools =
            security.allowedTools
                ?.split(',')
                .map((t) => t.trim())
                .filter(Boolean) ?? [];
        const blockedTools =
            security.blockedTools
                ?.split(',')
                .map((t) => t.trim())
                .filter(Boolean) ?? [];
        const datasetPatterns =
            security.allowedDatasetPatterns
                ?.split(',')
                .map((t) => t.trim())
                .filter(Boolean) ?? [];
        const ussPaths =
            security.allowedUssPaths
                ?.split(',')
                .map((t) => t.trim())
                .filter(Boolean) ?? [];
        // --- Section 1: Compliance controls ---
        const complianceRows = [
            ['Audit logging', flag(security.auditLogging)],
            ['Read-only mode', flagInverse(security.readOnly)],
            ['TLS verification', flag(zosmf.rejectUnauthorized)],
            ['Token auth (no password)', flag(Boolean(zosmf.token))],
        ];
        // --- Section 2: Access controls ---
        const toolAllowlistStatus =
            allowedTools.length > 0
                ? allowedTools.length <= 5
                    ? `${allowedTools.length} tool(s): ${allowedTools.join(', ')}`
                    : `${allowedTools.length} tools configured`
                : '✗ all tools permitted (no allowlist)';
        const toolBlocklistStatus =
            blockedTools.length > 0
                ? blockedTools.length <= 5
                    ? blockedTools.join(', ')
                    : `${blockedTools.length} tools blocked`
                : 'none';
        const accessRows = [
            ['Tool allowlist', toolAllowlistStatus],
            ['Tool blocklist', toolBlocklistStatus],
            [
                'Dataset boundaries',
                datasetPatterns.length > 0
                    ? `${datasetPatterns.length} pattern(s): ${datasetPatterns.slice(0, 3).join(', ')}${datasetPatterns.length > 3 ? ' …' : ''}`
                    : '✗ unrestricted',
            ],
            [
                'USS path boundaries',
                ussPaths.length > 0
                    ? `${ussPaths.length} path(s): ${ussPaths.slice(0, 3).join(', ')}${ussPaths.length > 3 ? ' …' : ''}`
                    : '✗ unrestricted',
            ],
            ['Max JCL bytes', String(security.maxJclBytes)],
            [
                'RACF audit source',
                enterprise.racfAuditUssPath ?? enterprise.racfAuditDataset ?? '✗ not configured',
            ],
        ];
        // --- Section 3: Write-tool registry ---
        const writeTool = [...WRITE_TOOLS];
        const writeToolsBlocked = writeTool.filter(
            (t) => security.readOnly || blockedTools.includes(t),
        );
        const writeToolRows = writeTool.map((t) => [
            t,
            security.readOnly
                ? '✗ blocked (read-only)'
                : blockedTools.includes(t)
                  ? '✗ blocked (blocklist)'
                  : '✓ permitted',
        ]);
        // --- Section 4: Tiered recommendations ---
        const critical = [];
        const warnings = [];
        const info = [];
        if (!zosmf.rejectUnauthorized) {
            critical.push(
                'TLS verification is disabled — man-in-the-middle attacks possible. Set ZOSMF_REJECT_UNAUTHORIZED=true.',
            );
        }
        if (!security.auditLogging) {
            critical.push(
                'Audit logging is disabled — no compliance trail. Set SECURITY_AUDIT_LOGGING=true.',
            );
        }
        if (!security.readOnly) {
            warnings.push(
                'Server allows write operations. Consider SECURITY_READ_ONLY=true for AI agents in production.',
            );
        }
        if (datasetPatterns.length === 0) {
            warnings.push(
                'Dataset access is unrestricted. Set SECURITY_ALLOWED_DATASET_PATTERNS (e.g. USERDEV.*) to confine reads.',
            );
        }
        if (ussPaths.length === 0) {
            warnings.push(
                'USS path access is unrestricted. Set SECURITY_ALLOWED_USS_PATHS (e.g. /u/appuser) to confine reads.',
            );
        }
        if (allowedTools.length === 0) {
            warnings.push(
                'No tool allowlist — all tools are accessible. Set SECURITY_ALLOWED_TOOLS for least-privilege access.',
            );
        }
        if (!zosmf.token) {
            info.push(
                'Using password auth. Token-based auth (ZOSMF_TOKEN) avoids credential exposure on disk.',
            );
        }
        if (!enterprise.racfAuditUssPath && !enterprise.racfAuditDataset) {
            info.push(
                'RACF audit source not configured. Set RACF_AUDIT_USS_PATH or RACF_AUDIT_DATASET for audit correlation.',
            );
        }
        if (blockedTools.length === 0 && allowedTools.length === 0) {
            info.push('Neither SECURITY_ALLOWED_TOOLS nor SECURITY_BLOCKED_TOOLS is configured.');
        }
        const recLines = [];
        for (const msg of critical) recLines.push(`  [CRITICAL] ${msg}`);
        for (const msg of warnings) recLines.push(`  [WARNING]  ${msg}`);
        for (const msg of info) recLines.push(`  [INFO]     ${msg}`);
        const recBody =
            recLines.length > 0
                ? recLines.join('\n')
                : '  All recommended enterprise controls appear to be configured correctly.';
        ctx.logger.debug(
            {
                readOnly: security.readOnly,
                auditLogging: security.auditLogging,
                allowedTools: allowedTools.length,
                blockedTools: blockedTools.length,
                writeToolsBlocked: writeToolsBlocked.length,
            },
            'security_posture_summary',
        );
        return textResult(
            formatStructuredResponse('Security Posture Summary', [
                {
                    heading: 'Compliance controls',
                    body: renderTable(['Control', 'Status'], complianceRows),
                },
                {
                    heading: 'Access controls',
                    body: renderTable(['Control', 'Value'], accessRows),
                },
                {
                    heading: `Write-tool registry (${writeToolsBlocked.length}/${writeTool.length} blocked)`,
                    body: renderTable(['Tool', 'Status'], writeToolRows),
                },
                {
                    heading: 'Tiered recommendations',
                    body: recBody,
                },
            ]),
        );
    },
});
