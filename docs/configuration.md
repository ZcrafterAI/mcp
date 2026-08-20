# Configuration

Every setting is an environment variable, supplied by your MCP client's `env`
block. There is no `.env` file — the client launches this server and passes the
values in. Working examples live in [`../config/`](../config/).

Only two things are truly required: **where the mainframe is**, and **who you
are**.

## Connecting

| Variable                    | Default | Description                                   |
| --------------------------- | ------- | --------------------------------------------- |
| `ZOSMF_HOST`                | —       | **Required.** z/OSMF hostname.                |
| `ZOSMF_PORT`                | `443`   | HTTPS port.                                   |
| `ZOSMF_BASE_PATH`           | —       | Path prefix, if z/OSMF sits behind a gateway. |
| `ZOSMF_REJECT_UNAUTHORIZED` | `true`  | Verify the TLS certificate. Leave this on.    |

## Signing in

Provide **either** a username and password **or** a token. Startup fails with a
clear message if neither is set.

| Variable           | Description                                    |
| ------------------ | ---------------------------------------------- |
| `ZOSMF_USER`       | z/OS user id.                                  |
| `ZOSMF_PASSWORD`   | Password or passphrase.                        |
| `ZOSMF_TOKEN`      | Session token, as an alternative to the above. |
| `ZOSMF_TOKEN_TYPE` | Token type. Defaults to `LTPA2`.               |

## Guardrails

These limit what an AI agent may do _within_ the permissions your credentials
already carry. RACF and z/OSMF still have the final say. Lists are
comma-separated.

| Variable                            | Default | Description                                                       |
| ----------------------------------- | ------- | ----------------------------------------------------------------- |
| `SECURITY_READ_ONLY`                | `false` | Refuse every write, including `submit_jcl`.                       |
| `SECURITY_ALLOWED_TOOLS`            | —       | If set, only these tool names may run.                            |
| `SECURITY_BLOCKED_TOOLS`            | —       | These tool names may never run. Checked before the allow list.    |
| `SECURITY_ALLOWED_DATASET_PATTERNS` | —       | Dataset patterns that may be reached, e.g. `PROD.*,SYS1.PROCLIB`. |
| `SECURITY_ALLOWED_USS_PATHS`        | —       | USS path prefixes that may be reached, e.g. `/u/appdev`.          |
| `SECURITY_AUDIT_LOGGING`            | `true`  | Log every call. Credentials and JCL bodies are redacted.          |
| `SECURITY_MAX_JCL_BYTES`            | `65536` | Largest inline JCL that may be submitted.                         |

Run the `security_posture_summary` tool to see which of these are active.

## Response limits

Caps that keep a single answer from overwhelming the agent's context. Raise
them if replies are being cut off; lower them to save tokens.

| Variable                  | Default | Description                                 |
| ------------------------- | ------- | ------------------------------------------- |
| `MAX_JOB_OUTPUT_LINES`    | `5000`  | Lines returned from one spool file.         |
| `MAX_DATASET_READ_LINES`  | `2000`  | Lines returned from one dataset read.       |
| `MAX_JES_SPOOL_FILES`     | `20`    | Spool files read during a failure analysis. |
| `MAX_AUDIT_LINES`         | `500`   | RACF audit lines parsed per query.          |
| `MAX_JOB_LIST_RESULTS`    | `500`   | Jobs returned by a list.                    |
| `MAX_FAILED_JOB_RESULTS`  | `100`   | Failed jobs examined in a time window.      |
| `MAX_CONCURRENT_REQUESTS` | `4`     | Parallel reads against z/OSMF (1–16).       |

## Optional systems

Four tool categories stay registered but cannot work until these are set. Each
one reports exactly what is missing when called.

**CICS**

| Variable         | Default                 | Description                                     |
| ---------------- | ----------------------- | ----------------------------------------------- |
| `CMCI_CONTEXT`   | —                       | **Required for CICS.** CICSplex name or APPLID. |
| `CMCI_HOST`      | `ZOSMF_HOST`            | CMCI hostname, if different.                    |
| `CMCI_PORT`      | `1490`                  | CMCI port.                                      |
| `CMCI_BASE_PATH` | `/CICSSystemManagement` | CMCI path prefix.                               |

**Db2**

| Variable        | Default      | Description                                    |
| --------------- | ------------ | ---------------------------------------------- |
| `DB2_LOCATION`  | —            | **Required for Db2.** Subsystem location name. |
| `DB2_HOST`      | `ZOSMF_HOST` | Db2 REST hostname, if different.               |
| `DB2_PORT`      | `50400`      | Db2 REST port.                                 |
| `DB2_BASE_PATH` | `/dbrest`    | Db2 REST path prefix.                          |

**Performance metrics** — needs z/OSMF RMF, a summary dataset, or both.

| Variable              | Default | Description                            |
| --------------------- | ------- | -------------------------------------- |
| `RMF_METRICS_ENABLED` | `true`  | Query z/OSMF RMF for live metrics.     |
| `SMF_SUMMARY_DATASET` | —       | Dataset holding an SMF summary report. |

**RACF audit** — needs one of these.

| Variable              | Description                     |
| --------------------- | ------------------------------- |
| `RACF_AUDIT_USS_PATH` | USS file holding audit records. |
| `RACF_AUDIT_DATASET`  | Dataset holding audit records.  |

## Server behaviour

| Variable             | Default                | Description                                                      |
| -------------------- | ---------------------- | ---------------------------------------------------------------- |
| `MCP_TRANSPORT`      | `stdio`                | `stdio` or `sse`.                                                |
| `MCP_SSE_PORT`       | `3000`                 | Port for the SSE transport.                                      |
| `MCP_SERVER_NAME`    | `mainframe-mcp-server` | Name advertised to the client.                                   |
| `MCP_SERVER_VERSION` | package version        | Version advertised to the client.                                |
| `LOG_LEVEL`          | `info`                 | `fatal`, `error`, `warn`, `info`, `debug`, `trace`, or `silent`. |

Logs are JSON on **stderr**. Under the stdio transport, stdout carries the MCP
protocol and nothing else may be written to it.

The SSE transport has no authentication. If you expose it beyond localhost, put
an authenticating proxy in front of it.
