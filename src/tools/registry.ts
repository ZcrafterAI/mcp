/**
 * The catalog of everything this server exposes.
 *
 * This is the one place that knows which tools exist. Adding a capability
 * means writing the tool file, listing it in its group's `index.ts`, and — for
 * a brand-new category — adding one entry below. Nothing else needs to change.
 */
import type { Tool } from './define-tool.js';
import { jobTools } from './jobs/index.js';
import { datasetTools } from './datasets/index.js';
import { ussTools } from './uss/index.js';
import { operationsTools } from './operations/index.js';
import { cicsTools } from './cics/index.js';
import { db2Tools } from './db2/index.js';
import { smfTools } from './smf/index.js';
import { securityTools } from './security/index.js';
import { analysisTools } from './analysis/index.js';

/** One category of related tools. */
export interface ToolGroup {
    /** Short machine id, used in logs. */
    id: string;
    /** Plain-language name for the category. */
    title: string;
    /** One sentence on what this category is for. */
    summary: string;
    /**
     * Environment variables that must be set before these tools can do
     * anything. The tools still register without them and return a clear
     * "not configured" message, so an agent can discover what is missing.
     */
    requires?: string[];
    tools: Tool[];
}

/** Every tool group, in the order they are registered. */
export const TOOL_GROUPS: ToolGroup[] = [
    {
        id: 'jobs',
        title: 'Batch jobs',
        summary: 'Submit work and follow it through the queue — status, output, and why it failed.',
        tools: jobTools,
    },
    {
        id: 'datasets',
        title: 'Datasets',
        summary:
            "Find and read the mainframe's files: sequential datasets, libraries, and members.",
        tools: datasetTools,
    },
    {
        id: 'uss',
        title: 'Unix files',
        summary: 'Browse and read the Unix side of z/OS (USS).',
        tools: ussTools,
    },
    {
        id: 'operations',
        title: 'Day-to-day operations',
        summary: 'What broke, how often, and whether the system is healthy right now.',
        tools: operationsTools,
    },
    {
        id: 'analysis',
        title: 'Deeper analysis',
        summary:
            'Root-cause reports across several failures, and which jobs look likely to fail next.',
        tools: analysisTools,
    },
    {
        id: 'cics',
        title: 'CICS regions',
        summary: 'Inspect the transaction system that runs interactive workloads.',
        requires: ['CMCI_CONTEXT'],
        tools: cicsTools,
    },
    {
        id: 'db2',
        title: 'Db2 databases',
        summary: 'Look up the tables and views that exist in Db2.',
        requires: ['DB2_LOCATION'],
        tools: db2Tools,
    },
    {
        id: 'smf',
        title: 'Performance metrics',
        summary: "Read the system's own performance records (SMF/RMF).",
        requires: ['SMF_SUMMARY_DATASET or z/OSMF RMF'],
        tools: smfTools,
    },
    {
        id: 'security',
        title: 'Security and audit',
        summary: "Review RACF audit records and check which of this server's guardrails are on.",
        requires: ['RACF_AUDIT_USS_PATH or RACF_AUDIT_DATASET (for the audit query)'],
        tools: securityTools,
    },
];

/** Every tool across every group, flattened. */
export function allTools(): Tool[] {
    return TOOL_GROUPS.flatMap((group) => group.tools);
}
