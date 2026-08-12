/**
 * z/OS domain types.
 *
 * These are intentionally a small, AI-friendly subset of the rich objects the
 * Zowe SDK returns. We normalize the SDK shapes into stable types so the tool
 * layer (and downstream AI agents) don't depend on SDK-internal field names.
 */
/** Lifecycle status of a job as reported by JES. */
export type JobStatus = 'INPUT' | 'ACTIVE' | 'OUTPUT' | 'UNKNOWN';
/** A normalized z/OS batch job. */
export interface Job {
    /** Job name, e.g. PAYJOB01. */
    jobName: string;
    /** JES job id, e.g. JOB01234. */
    jobId: string;
    /** Owner (user id) that submitted the job. */
    owner: string;
    /** Current lifecycle status. */
    status: JobStatus;
    /**
     * Raw return code or completion status string from JES,
     * e.g. "CC 0000", "JCL ERROR", "ABEND S806". `null` while still running.
     */
    returnCode: string | null;
    /** Job class, e.g. "A". */
    class?: string;
    /** z/OS subsystem the job ran under, e.g. "JES2". */
    subsystem?: string;
    /** Optional execution phase description. */
    phase?: string;
}
/** A single spool (DD) file produced by a job. */
export interface SpoolFile {
    /** JES spool file id (used to download a specific DD). */
    id: number;
    /** DD name, e.g. "JESMSGLG", "SYSOUT". */
    ddName: string;
    /** Step name that produced this DD, if applicable. */
    stepName?: string;
    /** Procedure step name, if applicable. */
    procStep?: string;
    /** Approximate record count. */
    recordCount?: number;
}
/** A normalized dataset (catalog) entry. */
export interface Dataset {
    /** Fully-qualified dataset name. */
    name: string;
    /** Dataset organization, e.g. "PO" (PDS), "PS" (sequential). */
    dsorg?: string;
    /** Record format, e.g. "FB", "VB". */
    recfm?: string;
    /** Logical record length. */
    lrecl?: number;
    /** Block size in bytes. */
    blksize?: number;
    /** Volume serial the dataset resides on. */
    volume?: string;
    /** True when the dataset is migrated/archived (HSM). */
    migrated?: boolean;
    /** True when the dataset is a PDSE (library) rather than a classic PDS. */
    pdse?: boolean;
}
/** A PDS member. */
export interface Member {
    /** Member name. */
    name: string;
    /** Last-modified date (YYYY/MM/DD) if available. */
    modified?: string;
    /** Last-modified time (HH:MM) if available. */
    changedTime?: string;
    /** Member version if version tracking is enabled. */
    version?: number;
    /** Userid that last modified the member (available when stats fetched). */
    user?: string;
    /** Approximate record/block count (available when stats fetched). */
    size?: number;
}
/** A USS (Unix System Services) directory entry. */
export interface UssEntry {
    /** Entry name (relative to the listed directory). */
    name: string;
    /** "file", "directory", "symlink", or "other". */
    type: 'file' | 'directory' | 'symlink' | 'other';
    /** Size in bytes for regular files. */
    size?: number;
    /** Owning user. */
    user?: string;
    /** Owning group. */
    group?: string;
    /** Permission string, e.g. "-rwxr-xr-x". */
    mode?: string;
    /** Last modified timestamp. */
    modified?: string;
    /** Symlink target path (populated for symlinks). */
    target?: string;
    /** Inode number. */
    inode?: number;
}
/** Result of analyzing a failed job. */
export interface JobFailureAnalysis {
    job: Job;
    /** Abend or error code, e.g. "S806", "S0C7", "U0100", or null if none found. */
    abendCode: string | null;
    /** Step where the failure occurred, if identifiable. */
    failedStep: string | null;
    /** Step name where a cancellation was issued, if identifiable. */
    cancelledStep?: string | null;
    /** Program/module name associated with the failure, if identifiable. */
    failedProgram: string | null;
    /** Human-readable explanation of the failure. */
    reason: string;
    /** The most relevant spool message line(s) used to reach the conclusion. */
    evidence: string[];
    /** Suggested remediation. */
    suggestedFix: string;
}
/** A single abend-code reference entry. */
export interface AbendCodeInfo {
    code: string;
    title: string;
    category: 'system' | 'user';
    explanation: string;
    commonCauses: string[];
    suggestedFix: string;
}
/** A normalized CICS region summary from CMCI. */
export interface CicsRegion {
    applid: string;
    status: string;
    cicsplex?: string;
    sysid?: string;
    jobname?: string;
    jobid?: string;
    /** MVS group identifier. */
    mvsgroupid?: string;
    /** CICS version string, e.g. "730". */
    version?: string;
    /** Time the region has been active (human-readable or ISO-format). */
    uptime?: string;
}
/** A CICS transaction definition from CMCI. */
export interface CicsTransaction {
    tranid: string;
    program: string;
    status?: string;
    /** Number of currently active tasks for this transaction. */
    taskcount?: string;
    /** Transaction priority (1–255). */
    priority?: string;
    /** Associated profile name. */
    profile?: string;
}
/** A Db2 catalog object. */
export interface Db2CatalogEntry {
    name: string;
    schema: string;
    type: string;
    /** Number of rows (CARDF from SYSIBM.SYSTABLES), if available. */
    rowCount?: string;
    /** Creation timestamp, if available. */
    created?: string;
    /** REMARKS / table comments, if available. */
    remarks?: string;
}
/** A batch failure risk assessment. */
export interface FailureRisk {
    jobName: string;
    riskScore: number;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    failureCount: number;
    topAbend: string | null;
    /** Human-readable description of the top abend, if known. */
    topAbendDescription: string | null;
    /** Unix-epoch ms of the most recent failure (null when exec-ended is unavailable). */
    lastOccurrence: number | null;
    trend: 'STABLE' | 'INCREASING' | 'DECREASING';
    recommendation: string;
}
/** Extended root-cause analysis for AI-assisted diagnostics. */
export interface RootCauseReport {
    analysis: JobFailureAnalysis;
    confidence: 'LOW' | 'MEDIUM' | 'HIGH';
    /** Normalized 0–100 health score (100 = perfectly clean, 0 = systemic failure). */
    healthScore: number;
    similarIncidents: string[];
    correlatedAbends: {
        code: string;
        count: number;
    }[];
    actionItems: string[];
    summary: string;
}
