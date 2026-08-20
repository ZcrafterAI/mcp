/**
 * Zod schema describing every configuration value the server accepts.
 *
 * The schema is the single source of truth: it documents defaults, coerces the
 * string-typed environment variables into their proper types, and validates
 * mutually-exclusive auth options.
 */
import { z } from 'zod';

/** Coerce common truthy/falsy string env values into a boolean. */
const booleanFromEnv = z.union([z.boolean(), z.string()]).transform((value) => {
    if (typeof value === 'boolean') return value;
    return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
});
const portSchema = z.coerce.number().int().min(1).max(65535);
export const configSchema = z
    .object({
        zosmf: z.object({
            host: z.string().min(1, 'ZOSMF_HOST is required'),
            port: portSchema.default(443),
            basePath: z.string().optional(),
            user: z.string().optional(),
            password: z.string().optional(),
            token: z.string().optional(),
            tokenType: z.string().optional(),
            rejectUnauthorized: booleanFromEnv.default(true),
        }),
        mcp: z.object({
            name: z.string().default('mainframe-mcp-server'),
            version: z.string().default('2.5.0'),
            transport: z.enum(['stdio', 'sse']).default('stdio'),
            ssePort: portSchema.default(3000),
        }),
        logLevel: z
            .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
            .default('info'),
        limits: z.object({
            maxJobOutputLines: z.coerce.number().int().positive().default(5000),
            maxDatasetReadLines: z.coerce.number().int().positive().default(2000),
            maxJesSpoolFiles: z.coerce.number().int().positive().default(20),
            maxAuditLines: z.coerce.number().int().positive().default(500),
            maxJobListResults: z.coerce.number().int().positive().default(500),
            maxFailedJobResults: z.coerce.number().int().positive().default(100),
            maxConcurrentRequests: z.coerce.number().int().min(1).max(16).default(4),
        }),
        enterprise: z.object({
            cmciHost: z.string().optional(),
            cmciPort: portSchema.default(1490),
            cmciContext: z.string().optional(),
            cmciBasePath: z.string().default('/CICSSystemManagement'),
            db2Host: z.string().optional(),
            db2Port: portSchema.default(50400),
            db2Location: z.string().optional(),
            db2BasePath: z.string().default('/dbrest'),
            smfSummaryDataset: z.string().optional(),
            rmfMetricsEnabled: booleanFromEnv.default(true),
            racfAuditUssPath: z.string().optional(),
            racfAuditDataset: z.string().optional(),
        }),
        security: z.object({
            readOnly: booleanFromEnv.default(false),
            allowedTools: z.string().optional(),
            blockedTools: z.string().optional(),
            allowedDatasetPatterns: z.string().optional(),
            allowedUssPaths: z.string().optional(),
            auditLogging: booleanFromEnv.default(true),
            maxJclBytes: z.coerce.number().int().positive().default(65536),
        }),
    })
    .superRefine((cfg, ctx) => {
        const hasBasic = Boolean(cfg.zosmf.user && cfg.zosmf.password);
        const hasToken = Boolean(cfg.zosmf.token);
        if (!hasBasic && !hasToken) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message:
                    'Provide either ZOSMF_USER + ZOSMF_PASSWORD or ZOSMF_TOKEN for authentication.',
                path: ['zosmf', 'auth'],
            });
        }
    });

/** Fully validated configuration, inferred from the schema above. */
export type AppConfig = z.infer<typeof configSchema>;
