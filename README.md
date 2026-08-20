# @zcrafterai/mcp

MCP server for IBM z/OS — batch jobs, datasets, USS, CICS, Db2, SMF/RACF, and
operational diagnostics, exposed to AI agents over the Model Context Protocol
via the Zowe SDK.

**32 tools.** Full TypeScript source, `strict` mode, builds with `tsc`.

> **Provenance.** This is a reconstructed TypeScript source tree for
> `@notharshhaa/mainframe-mcp-server` 2.5.0 (MIT). The upstream GitHub
> repository was deleted and now 404s; no published version ever shipped `src/`.
> The sources here were rebuilt from the compiled output and its type
> declarations, then verified to recompile to the same JavaScript.
> See [RECONSTRUCTION.md](RECONSTRUCTION.md) and [NOTICE](NOTICE).

## Quick start

Requirements: Node.js 18+, a reachable z/OSMF endpoint, and valid z/OS credentials.

```bash
npm install
npm run build
npm start
```

Then point your MCP client at `dist/index.js`:

```json
{
  "mcpServers": {
    "mainframe": {
      "command": "node",
      "args": ["/absolute/path/to/mcp/dist/index.js"],
      "env": {
        "ZOSMF_HOST": "your-zosmf-host.internal",
        "ZOSMF_PORT": "443",
        "ZOSMF_USER": "your-username",
        "ZOSMF_PASSWORD": "your-password"
      }
    }
  }
}
```

Config is supplied by the MCP client's `env` block, not a `.env` file. See
`config/mcp-client.example.json` and `config/mcp-client.full.example.json`.

## Project layout

```
src/
├── index.ts              entry point — transport selection, signal handling
├── server.ts             MCP server bootstrap, tool-group registration
├── config/               zod schema + env loader (single source of truth)
├── types/                shared domain and tool-wiring types
├── zowe/                 z/OSMF session, profiles, REST helpers
├── utils/                errors, formatters, security, parsers, logging
└── tools/                the 32 tools, grouped by domain
    ├── jobs/             6    ├── cics/          3
    ├── datasets/         5    ├── db2/           2
    ├── uss/              3    ├── smf/           1
    ├── operations/       8    ├── security/      2
    └── intelligence/     2
```

Each tool group has a `shared.ts` (fetch + normalize logic) and one file per
tool, wired up through an `index.ts` registrar.

## Tools

### Jobs
| Tool | Description |
| --- | --- |
| `list_jobs` | List jobs by owner, prefix, or status |
| `get_job_status` | Status and return code for a job |
| `get_job_output` | Spool inventory or DD content |
| `submit_jcl` | Submit inline JCL |
| `analyze_job_failure` | Abend code, failing step, and suggested fix |
| `get_job_jcl` | Retrieve submitted JCL from job spool |

### Datasets
| Tool | Description |
| --- | --- |
| `list_datasets` | List datasets matching an HLQ pattern |
| `read_dataset` | Read a sequential dataset or PDS member |
| `search_dataset` | Search datasets by pattern |
| `search_members` | Search or list PDS members |
| `get_dataset_info` | Catalog attributes without reading content |

### USS
| Tool | Description |
| --- | --- |
| `list_uss_directory` | List a USS directory |
| `read_uss_file` | Read a USS file |
| `search_uss_files` | Search files under a USS path |

### Operations
| Tool | Description |
| --- | --- |
| `find_failed_jobs` | Failed jobs in a time window |
| `summarize_abends` | Abend code breakdown across recent jobs |
| `system_health_summary` | Active, queued, and failed job snapshot |
| `investigate_incident` | Full incident bundle for a job |
| `lookup_abend_code` | Abend reference lookup (S0C7, S806, S222, S0C4, …) |
| `verify_zosmf_connection` | Test z/OSMF connectivity and auth |
| `compare_jobs` | Side-by-side comparison of two jobs |
| `get_user_jobs_summary` | Job counts by status for an owner |

### CICS
| Tool | Description |
| --- | --- |
| `list_cics_regions` | List CICS regions via CMCI REST |
| `get_cics_region_status` | Status and attributes of a CICS region |
| `list_cics_transactions` | Transaction definitions in a region |

### Db2
| Tool | Description |
| --- | --- |
| `list_db2_subsystems` | List Db2 locations via Db2 REST |
| `search_db2_catalog` | Search catalog tables and views |

### SMF / Security
| Tool | Description |
| --- | --- |
| `get_smf_metrics` | SMF/RMF performance metrics snapshot |
| `query_racf_audit` | Query RACF audit records from a log source |
| `security_posture_summary` | Report active security controls and recommendations |

### Intelligence
| Tool | Description |
| --- | --- |
| `analyze_root_cause` | Deep root-cause analysis with correlation and action items |
| `predict_batch_failures` | Predictive risk scoring for recurring batch failures |

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `ZOSMF_HOST` | yes | z/OSMF hostname |
| `ZOSMF_USER` / `ZOSMF_PASSWORD` | yes\* | Basic auth credentials |
| `ZOSMF_TOKEN` | yes\* | Token auth (alternative to user/password) |
| `ZOSMF_PORT` | no | HTTPS port (default 443) |
| `ZOSMF_REJECT_UNAUTHORIZED` | no | TLS verification (default `true`) |
| `MAX_CONCURRENT_REQUESTS` | no | Parallel independent reads (default `4`, range `1`–`16`) |

\* Provide either user/password or a token. The schema in `src/config/schema.ts`
rejects a config with neither.

## Enterprise security

Guardrails are enforced in this server, *in addition to* RACF/z/OSMF permissions
on the mainframe itself. The mainframe still makes the final authorization
decision — these controls stop an AI agent from exceeding configured boundaries.

| Control | Env variable | Purpose |
| --- | --- | --- |
| Read-only mode | `SECURITY_READ_ONLY=true` | Blocks `submit_jcl` and other write tools |
| Tool allowlist | `SECURITY_ALLOWED_TOOLS` | Only permit specific tools (least privilege) |
| Tool blocklist | `SECURITY_BLOCKED_TOOLS` | Explicitly deny dangerous tools |
| Dataset boundaries | `SECURITY_ALLOWED_DATASET_PATTERNS` | Restrict dataset access by HLQ pattern |
| USS boundaries | `SECURITY_ALLOWED_USS_PATHS` | Restrict USS paths by prefix |
| Audit logging | `SECURITY_AUDIT_LOGGING=true` | Log every tool call (credentials redacted) |
| JCL size limit | `SECURITY_MAX_JCL_BYTES` | Cap inline JCL submit size |
| TLS verification | `ZOSMF_REJECT_UNAUTHORIZED=true` | Enforce certificate validation |

Run `security_posture_summary` to see which controls are active and get
hardening recommendations.

Production deployment also wants: a dedicated z/OS service account with
least-privilege RACF profiles, secrets in a vault rather than plain env vars,
z/OSMF behind an API gateway or VPN, and an auth proxy in front of the SSE
transport if it is exposed beyond localhost.

Phase 3 tool groups need optional configuration to activate: CICS via
`CMCI_HOST`/`CMCI_PORT`/`CMCI_CONTEXT`, Db2 via `DB2_LOCATION`/`DB2_HOST`/`DB2_PORT`,
SMF via z/OSMF RMF or `SMF_SUMMARY_DATASET`, and RACF audit via
`RACF_AUDIT_USS_PATH` or `RACF_AUDIT_DATASET`.

## Examples

```
User:  Why did PAYJOB01 fail?
Agent: analyze_job_failure({ jobId: "JOB01234" })

Job:     PAYJOB01 (JOB01234)
Status:  ABEND S806
Step:    STEP030 - LOADPGM
Reason:  Program load failure — module PAYRPTX not found
Fix:     Verify PAYRPTX is compiled and linked into the correct load library.
```

```
User:  Show me all failed jobs from the last 24 hours
Agent: find_failed_jobs({ hours: 24 })

User:  Show me SYS1.PROCLIB(IKJEFT01)
Agent: read_dataset({ dsn: "SYS1.PROCLIB", member: "IKJEFT01" })

User:  Which batch jobs are at risk of failing?
Agent: predict_batch_failures({ hours: 168 })
```

## Rebranding

The npm package name is `@zcrafterai/mcp`. The MCP server's advertised *display*
name is still `mainframe-mcp-server` — it defaults from `src/config/schema.ts`
(`mcp.name`) and can be overridden at runtime with the `MCP_SERVER_NAME` env var,
or changed in the schema directly.

## Scripts

| Command | Description |
| --- | --- |
| `npm run build` | Compile `src/` to `dist/` |
| `npm run typecheck` | Type-check without emitting |
| `npm test` | Build and run the core correctness and MCP contract tests |
| `npm run benchmark` | Measure startup and simulated diagnostic-read latency |
| `npm run check` | Run type-checking and all tests |
| `npm run dev` | Watch mode |
| `npm start` | Run the built server |
| `npm run clean` | Remove `dist/` |

## License

MIT — see [LICENSE](LICENSE) and [NOTICE](NOTICE).
Original work Copyright (c) 2026 H A R S H H A A.
