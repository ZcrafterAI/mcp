/**
 * Configuration loader.
 *
 * Configuration is supplied by the MCP client (Cursor, VS Code, Claude Desktop,
 * etc.) through the `env` block in the user's MCP config file — not from a
 * `.env` file. The IDE prompts for values at install/setup time and passes
 * them as environment variables when launching this server.
 */
import type { AppConfig } from './schema.js';
import { configSchema } from './schema.js';
let cached: AppConfig | undefined;
/** Build the raw (unvalidated) config object from environment variables. */
function readEnv() {
    return {
        zosmf: {
            host: process.env.ZOSMF_HOST,
            port: process.env.ZOSMF_PORT,
            basePath: process.env.ZOSMF_BASE_PATH,
            user: process.env.ZOSMF_USER,
            password: process.env.ZOSMF_PASSWORD,
            token: process.env.ZOSMF_TOKEN,
            tokenType: process.env.ZOSMF_TOKEN_TYPE,
            rejectUnauthorized: process.env.ZOSMF_REJECT_UNAUTHORIZED ?? 'true',
        },
        mcp: {
            name: process.env.MCP_SERVER_NAME,
            version: process.env.MCP_SERVER_VERSION,
            transport: process.env.MCP_TRANSPORT,
            ssePort: process.env.MCP_SSE_PORT,
        },
        logLevel: process.env.LOG_LEVEL,
        limits: {
            maxConcurrentRequests: process.env.MAX_CONCURRENT_REQUESTS,
            maxJobOutputLines: process.env.MAX_JOB_OUTPUT_LINES,
            maxDatasetReadLines: process.env.MAX_DATASET_READ_LINES,
            maxJesSpoolFiles: process.env.MAX_JES_SPOOL_FILES,
            maxAuditLines: process.env.MAX_AUDIT_LINES,
            maxJobListResults: process.env.MAX_JOB_LIST_RESULTS,
            maxFailedJobResults: process.env.MAX_FAILED_JOB_RESULTS,
        },
        enterprise: {
            cmciHost: process.env.CMCI_HOST,
            cmciPort: process.env.CMCI_PORT,
            cmciContext: process.env.CMCI_CONTEXT,
            cmciBasePath: process.env.CMCI_BASE_PATH,
            db2Host: process.env.DB2_HOST,
            db2Port: process.env.DB2_PORT,
            db2Location: process.env.DB2_LOCATION,
            db2BasePath: process.env.DB2_BASE_PATH,
            smfSummaryDataset: process.env.SMF_SUMMARY_DATASET,
            rmfMetricsEnabled: process.env.RMF_METRICS_ENABLED ?? 'true',
            racfAuditUssPath: process.env.RACF_AUDIT_USS_PATH,
            racfAuditDataset: process.env.RACF_AUDIT_DATASET,
        },
        security: {
            readOnly: process.env.SECURITY_READ_ONLY ?? 'false',
            allowedTools: process.env.SECURITY_ALLOWED_TOOLS,
            blockedTools: process.env.SECURITY_BLOCKED_TOOLS,
            allowedDatasetPatterns: process.env.SECURITY_ALLOWED_DATASET_PATTERNS,
            allowedUssPaths: process.env.SECURITY_ALLOWED_USS_PATHS,
            auditLogging: process.env.SECURITY_AUDIT_LOGGING ?? 'true',
            maxJclBytes: process.env.SECURITY_MAX_JCL_BYTES,
        },
    };
}
const SETUP_HINT = `
Configure this server in your IDE's MCP settings (not a .env file).
Copy config/mcp-client.example.json and fill in your values, or use your IDE's
MCP install wizard when adding @zcrafterai/mcp.

Required at minimum:
  ZOSMF_HOST, and either (ZOSMF_USER + ZOSMF_PASSWORD) or ZOSMF_TOKEN

See docs/configuration.md for the full variable reference.
`.trim();
/**
 * Load and validate configuration. Result is cached after the first call so
 * repeated imports don't re-parse the environment.
 *
 * @param reload - Force a fresh read (primarily useful in tests).
 */
export function loadConfig(reload: boolean = false): AppConfig {
    if (cached && !reload) return cached;
    const parsed = configSchema.safeParse(readEnv());
    if (!parsed.success) {
        const details = parsed.error.issues
            .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
            .join('\n');
        throw new Error(`Invalid configuration:\n${details}\n\n${SETUP_HINT}`);
    }
    cached = Object.freeze(parsed.data);
    return cached;
}
