/**
 * Abend code lookup table.
 *
 * A curated set of the most common z/OS system (S...) and user (U...) abend
 * codes encountered in batch operations, with plain-language explanations and
 * remediation hints. This is reference data, not an exhaustive IBM catalog.
 */
import type { AbendCodeInfo } from '../types/zos.js';
const ABEND_TABLE: Record<string, AbendCodeInfo> = {
    S0C1: {
        code: 'S0C1',
        title: 'Operation Exception',
        category: 'system',
        explanation: 'The program tried to execute an invalid machine instruction, often after branching into data or an uninitialized area.',
        commonCauses: [
            'Calling a subprogram that was not linked or could not be loaded',
            'A subscript/pointer error transferring control to non-executable storage',
            'Mismatched load module / missing entry point',
        ],
        suggestedFix: 'Verify all called modules are linked and available in STEPLIB/JOBLIB; check for control transfers into data areas.',
    },
    S0C4: {
        code: 'S0C4',
        title: 'Protection / Addressing Exception',
        category: 'system',
        explanation: 'The program referenced storage it does not own or that is not addressable (a memory protection violation).',
        commonCauses: [
            'Reading or writing past the end of a table or array (subscript out of range)',
            'Using an uninitialized or corrupted pointer / base register',
            'Reentrancy or working-storage overlay issues',
        ],
        suggestedFix: 'Check array bounds and pointer initialization; review recent code changes around storage access.',
    },
    S0C5: {
        code: 'S0C5',
        title: 'Addressing Exception',
        category: 'system',
        explanation: 'The program used an address that falls outside the real-storage or virtual-storage limits.',
        commonCauses: [
            'Address register contains a garbage value',
            'Program attempted to access storage beyond the 16 MB or 2 GB line without proper addressing mode',
            'Base register not properly established',
        ],
        suggestedFix: 'Review base-register setup and AMODE/RMODE settings; check for uninitialized address fields.',
    },
    S0C6: {
        code: 'S0C6',
        title: 'Specification Exception',
        category: 'system',
        explanation: 'An instruction operand violated an alignment or other specification rule (e.g. a double-word operand at an odd address).',
        commonCauses: [
            'Unaligned storage reference for a type that requires alignment',
            'Incorrect use of an SSE/vector instruction',
            'Bad USING or DROP sequence in assembler code',
        ],
        suggestedFix: 'Ensure storage areas are correctly aligned; review assembler code for improper USING directives.',
    },
    S0C7: {
        code: 'S0C7',
        title: 'Data Exception',
        category: 'system',
        explanation: 'A decimal arithmetic instruction operated on a field that does not contain valid packed-decimal data.',
        commonCauses: [
            'Uninitialized numeric COBOL fields (spaces instead of zeros)',
            'Bad input data feeding a computational field',
            'Redefines / group moves placing non-numeric data into a numeric field',
        ],
        suggestedFix: 'Initialize numeric fields, validate input with NUMERIC class tests, and inspect the offending record before the failing COMPUTE/arithmetic.',
    },
    S0C8: {
        code: 'S0C8',
        title: 'Fixed-Point Overflow Exception',
        category: 'system',
        explanation: 'A fixed-point arithmetic operation produced a result that overflows the signed integer range.',
        commonCauses: [
            'Arithmetic on large values without overflow checking',
            'Accumulator variable not wide enough for the computed sum/product',
        ],
        suggestedFix: 'Use wider integer types or add overflow checks before arithmetic operations.',
    },
    S0CA: {
        code: 'S0CA',
        title: 'Decimal Overflow Exception',
        category: 'system',
        explanation: 'A packed-decimal arithmetic operation produced a result that is too large to fit in the receiving field.',
        commonCauses: [
            'Receiving PIC field is too small for the computed value',
            'Missing ROUNDED or ON SIZE ERROR phrase in COBOL',
        ],
        suggestedFix: 'Increase the size of the target PIC field or add ON SIZE ERROR handling in COBOL.',
    },
    S0CB: {
        code: 'S0CB',
        title: 'Divide Exception',
        category: 'system',
        explanation: 'A DIVIDE or decimal divide instruction attempted division by zero.',
        commonCauses: [
            'Divisor field is zero or uninitialized',
            'Missing zero-check guard before DIVIDE statement',
            'Input data record contains an unexpected zero for a ratio calculation',
        ],
        suggestedFix: 'Add a guard condition (IF divisor = ZERO ...) before every DIVIDE; validate input data for zero divisors.',
    },
    S0CF: {
        code: 'S0CF',
        title: 'Crypto/Extended-Precision Exception',
        category: 'system',
        explanation: 'An extended-precision floating-point or crypto instruction encountered an invalid operand.',
        commonCauses: [
            'Misuse of HFP/BFP floating-point instructions',
            'Incorrect operand size for a crypto service call',
        ],
        suggestedFix: 'Review the instruction reference for operand requirements; ensure correct service call parameters.',
    },
    S106: {
        code: 'S106',
        title: 'Program Fetch Error',
        category: 'system',
        explanation: 'An error occurred while loading (fetching) a program into storage.',
        commonCauses: ['I/O error reading the load library', 'Corrupted load module'],
        suggestedFix: 'Re-link the module and verify the load library is not damaged.',
    },
    S178: {
        code: 'S178',
        title: 'Bad Address in Program Call',
        category: 'system',
        explanation: 'A CALL or branch instruction passed a zero or invalid address; typically a null function pointer.',
        commonCauses: [
            'Null or uninitialized procedure pointer used in a dynamic CALL',
            'Program table entry not populated before CALL',
        ],
        suggestedFix: 'Ensure procedure or function pointer is set before use; add null-check guards for dynamic calls.',
    },
    S213: {
        code: 'S213',
        title: 'Dataset OPEN Failure (DISP=OLD/SHR)',
        category: 'system',
        explanation: 'A dataset could not be opened, frequently because it was not found on the volume.',
        commonCauses: ['Dataset not cataloged or missing', 'Wrong volume serial', 'DD statement error'],
        suggestedFix: 'Confirm the dataset exists and is cataloged; check the DD statement and volume.',
    },
    S222: {
        code: 'S222',
        title: 'Job Cancelled by Operator',
        category: 'system',
        explanation: 'The job was cancelled by an operator or by automation, not an internal program error.',
        commonCauses: ['Manual operator cancel', 'Automation killed a long-running/looping job', 'Exceeded run window'],
        suggestedFix: 'Determine why it was cancelled (runtime, loop, or operational decision); rerun after addressing the cause.',
    },
    S237: {
        code: 'S237',
        title: 'Tape/Unit I/O Error',
        category: 'system',
        explanation: 'An unrecoverable I/O error occurred on a tape or direct-access unit during dataset processing.',
        commonCauses: [
            'Physical tape drive error or bad tape',
            'DASD I/O hardware failure',
            'Volume integrity issue',
        ],
        suggestedFix: 'Check the hardware error log (LOGREC); re-mount tape or run IEHDASDR to check DASD integrity.',
    },
    S2F3: {
        code: 'S2F3',
        title: 'Enqueue / Resource Contention Deadlock',
        category: 'system',
        explanation: 'A deadly embrace (deadlock) was detected between two or more jobs competing for ENQ resources.',
        commonCauses: [
            'Two jobs each holding a resource the other needs',
            'Incorrect ENQ scope (SYSTEM vs STEP)',
            'Long-running transaction not releasing locks',
        ],
        suggestedFix: 'Review ENQ/RESERVE usage patterns; stagger conflicting jobs or reduce lock-hold durations.',
    },
    S322: {
        code: 'S322',
        title: 'Time / CPU Limit Exceeded',
        category: 'system',
        explanation: 'The step exceeded its allotted CPU or wall-clock time limit.',
        commonCauses: ['An infinite loop', 'Underestimated TIME= parameter', 'Unexpected data volume'],
        suggestedFix: 'Investigate for loops; raise TIME= on the JOB/EXEC card if the workload legitimately grew.',
    },
    S413: {
        code: 'S413',
        title: 'OPEN Error (Volume/Unit)',
        category: 'system',
        explanation: 'OPEN failed because the device or volume for the dataset was unavailable.',
        commonCauses: ['Volume not mounted', 'Unit allocation problem'],
        suggestedFix: 'Verify the volume is online and correctly allocated.',
    },
    S522: {
        code: 'S522',
        title: 'Wait Limit Exceeded',
        category: 'system',
        explanation: 'The job sat in a wait state longer than the installation limit allows.',
        commonCauses: ['Waiting on an unavailable resource', 'Operator reply never issued', 'Enqueue contention'],
        suggestedFix: 'Identify the resource being waited on (datasets, WTOR replies, locks) and resolve contention.',
    },
    S706: {
        code: 'S706',
        title: 'Invalid Load Module Format',
        category: 'system',
        explanation: 'The system could not load a module because its directory entry is corrupt or the format is unrecognized.',
        commonCauses: [
            'Load module was partially written or corrupted during link-edit',
            'Module built for a different z/OS release or AMODE than the current environment',
        ],
        suggestedFix: 'Re-link the module from source; verify AMODE and RMODE settings match the execution environment.',
    },
    S806: {
        code: 'S806',
        title: 'Module Not Found / Load Failure',
        category: 'system',
        explanation: 'The system could not locate a requested load module in any available library.',
        commonCauses: [
            'Program not compiled/linked into the expected load library',
            'STEPLIB/JOBLIB concatenation missing the library',
            'Misspelled program name on EXEC PGM=',
        ],
        suggestedFix: 'Confirm the module is linked into a library on the STEPLIB/JOBLIB concatenation and that PGM= is spelled correctly.',
    },
    S837: {
        code: 'S837',
        title: 'Out of Space on Volume',
        category: 'system',
        explanation: 'A dataset could not be extended because the volume was full or out of extents.',
        commonCauses: ['Insufficient primary/secondary space', 'Volume full', 'Max extents reached'],
        suggestedFix: 'Increase SPACE allocation or direct output to a volume with free space.',
    },
    S878: {
        code: 'S878',
        title: 'Storage Obtain Failure (Above 16 MB)',
        category: 'system',
        explanation: 'A GETMAIN or STORAGE OBTAIN request for memory above the 16 MB line failed — insufficient virtual storage.',
        commonCauses: [
            'Region size too small for the workload',
            'Memory leak — prior steps did not free working storage',
            'MEMLIMIT set too low for 64-bit storage needs',
        ],
        suggestedFix: 'Increase REGION= or MEMLIMIT= on the JOB/EXEC; investigate memory leaks with storage reports.',
    },
    S913: {
        code: 'S913',
        title: 'Security Authorization Failure',
        category: 'system',
        explanation: 'The job was denied access to a resource by the security product (RACF/ACF2/TSS).',
        commonCauses: ['Insufficient dataset/resource permissions', 'Expired or wrong user id'],
        suggestedFix: 'Request the appropriate access for the service account from your security administrator.',
    },
    S980: {
        code: 'S980',
        title: 'Virtual Storage Exhausted (Below 16 MB)',
        category: 'system',
        explanation: 'A GETMAIN below the 16 MB line failed because the 24-bit virtual address space was exhausted.',
        commonCauses: [
            'Too many open datasets or file control blocks below the line',
            'Old COBOL or assembler programs that allocate working storage below the line',
            'REGION too small',
        ],
        suggestedFix: 'Increase REGION= or convert programs to use above-the-line storage (AMODE 31/64).',
    },
    SB14: {
        code: 'SB14',
        title: 'VSAM I/O Error',
        category: 'system',
        explanation: 'A serious I/O error occurred on a VSAM cluster during access.',
        commonCauses: [
            'VSAM cluster is damaged or has a broken CI/CA',
            'Shared access violation (cluster opened exclusive by another job)',
            'Catalog connectivity problem',
        ],
        suggestedFix: 'Run IDCAMS VERIFY then REPRO to recover; check for concurrent access conflicts.',
    },
    SB37: {
        code: 'SB37',
        title: 'Out of Space (End of Volume)',
        category: 'system',
        explanation: 'A dataset ran out of space at end-of-volume with no additional volume available.',
        commonCauses: ['Secondary space exhausted', 'No candidate volumes'],
        suggestedFix: 'Increase secondary space allocation or add candidate volumes.',
    },
    SD37: {
        code: 'SD37',
        title: 'Out of Space (No Secondary)',
        category: 'system',
        explanation: 'A dataset filled its primary allocation and no secondary extent was specified.',
        commonCauses: ['Primary too small', 'SPACE secondary set to zero'],
        suggestedFix: 'Add or increase the secondary SPACE quantity.',
    },
    SE37: {
        code: 'SE37',
        title: 'Out of Space (Max Extents/Volumes)',
        category: 'system',
        explanation: 'A dataset could not extend because it reached the maximum number of extents or volumes.',
        commonCauses: ['Too many small extents', 'Volume count limit'],
        suggestedFix: 'Reorganize/compress the dataset or reallocate with larger primary space.',
    },
    U0100: {
        code: 'U0100',
        title: 'User Abend 0100 (Application-Defined)',
        category: 'user',
        explanation: 'A user (application) abend issued by the program logic. The meaning is defined by the application, not by z/OS.',
        commonCauses: ['Business-rule validation failure', 'Explicit ABEND in error handling'],
        suggestedFix: 'Consult the application documentation/source for the meaning of user code 0100.',
    },
    U0200: {
        code: 'U0200',
        title: 'User Abend 0200 (Application-Defined)',
        category: 'user',
        explanation: 'A user (application) abend with code 0200. Typically signals a configuration or initialization error in application code.',
        commonCauses: [
            'Required parameter or DD not provided',
            'Configuration dataset missing or empty',
        ],
        suggestedFix: 'Consult the application documentation for code 0200; check JCL parameters and required DDs.',
    },
    U0300: {
        code: 'U0300',
        title: 'User Abend 0300 (Application-Defined)',
        category: 'user',
        explanation: 'A user (application) abend with code 0300. Often signals a fatal database or file error in the application.',
        commonCauses: [
            'Database connection or SQL failure',
            'Required reference file unavailable',
        ],
        suggestedFix: 'Check application logs and database/file availability; consult application documentation for code 0300.',
    },
    U0999: {
        code: 'U0999',
        title: 'User Abend 0999 (Generic Catchall)',
        category: 'user',
        explanation: 'A catchall user abend issued when no more specific error code is defined. Frequently used by in-house frameworks.',
        commonCauses: [
            'Unexpected runtime exception caught by the framework',
            'Fatal error with no dedicated user abend code',
        ],
        suggestedFix: 'Review application and framework logs immediately preceding the abend for the root exception.',
    },
    U4038: {
        code: 'U4038',
        title: 'Language Environment Abend',
        category: 'user',
        explanation: 'A severe runtime error detected by Language Environment (LE).',
        commonCauses: ['Unhandled condition in COBOL/C/PLI', 'Storage corruption', 'Failed CEE call'],
        suggestedFix: 'Review the LE message and CEEDUMP for the failing condition and offset.',
    },
    U4093: {
        code: 'U4093',
        title: 'LE Storage Overflow',
        category: 'user',
        explanation: 'Language Environment ran out of heap or stack storage.',
        commonCauses: [
            'Memory leak in recursive or iterative processing',
            'Very large working-storage structures allocated at runtime',
            'HEAP or STACK LE runtime options set too small',
        ],
        suggestedFix: 'Increase the HEAP and STACK LE runtime options; profile the application for memory leaks.',
    },
};
/** Normalize a free-form code (e.g. " s806 ", "806") into table key form. */
export function normalizeAbendCode(raw: string): string {
    const trimmed = raw.trim().toUpperCase();
    if (trimmed.startsWith('S') || trimmed.startsWith('U'))
        return trimmed;
    // Bare hex like "806" is conventionally a system completion code.
    if (/^[0-9A-F]{3,4}$/.test(trimmed))
        return `S${trimmed}`;
    return trimmed;
}
/** Look up a single abend code. Returns `undefined` if unknown. */
export function lookupAbend(code: string): AbendCodeInfo | undefined {
    return ABEND_TABLE[normalizeAbendCode(code)];
}
/** All known abend codes (useful for documentation/tests). */
export function allAbendCodes(): AbendCodeInfo[] {
    return Object.values(ABEND_TABLE);
}
/**
 * Search the abend reference table. With no query, returns all codes sorted.
 * With a query, matches code, title, explanation, or common causes (case-insensitive).
 */
export function searchAbendCodes(query?: string): AbendCodeInfo[] {
    const all = allAbendCodes();
    const trimmed = query?.trim();
    if (!trimmed) {
        return all.sort((a, b) => a.code.localeCompare(b.code));
    }
    const upper = trimmed.toUpperCase();
    const normalized = normalizeAbendCode(trimmed);
    return all
        .filter((entry) => entry.code === normalized ||
        entry.code.includes(upper) ||
        entry.title.toUpperCase().includes(upper) ||
        entry.explanation.toUpperCase().includes(upper) ||
        entry.commonCauses.some((cause) => cause.toUpperCase().includes(upper)))
        .sort((a, b) => a.code.localeCompare(b.code));
}
/**
 * Scan free text (e.g. spool output) for the first recognizable abend code.
 * Returns the normalized code string or `null`.
 */
export function extractAbendCode(text: string): string | null {
    // 1. Explicit "ABEND Sxxx" / "ABEND Uxxxx" form.
    const abend = text.match(/\bABEND[=\s-]*([SU][0-9A-F]{3,4})\b/i);
    if (abend)
        return normalizeAbendCode(abend[1]);
    // 2. "SYSTEM (COMPLETION) CODE=0C7" form (no S prefix in the message).
    const sys = text.match(/SYSTEM(?:\s+COMPLETION)?\s+CODE\s*[=:]?\s*([0-9A-F]{3,4})\b/i);
    if (sys)
        return normalizeAbendCode(`S${sys[1]}`);
    // 3. "USER (COMPLETION) CODE=0100" form.
    const user = text.match(/USER(?:\s+COMPLETION)?\s+CODE\s*[=:]?\s*(\d{3,4})\b/i);
    if (user)
        return normalizeAbendCode(`U${user[1]}`);
    // 4. Bare "Sxxx"/"Uxxxx" token anywhere.
    const bare = text.match(/\b([SU][0-9A-F]{3,4})\b/);
    if (bare)
        return normalizeAbendCode(bare[1]);
    return null;
}
