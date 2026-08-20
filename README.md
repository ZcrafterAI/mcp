# @zcrafterai/mcp

[![CI](https://github.com/ZcrafterAI/mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/ZcrafterAI/mcp/actions/workflows/ci.yml)

ZcrafterAI MCP is a tool designed to enhance the productivity of your coding agents by providing them with tools that assist them in reading, writing, and performing actions.

This is an [MCP](https://modelcontextprotocol.io) server. Point any MCP client
(Claude Code, Claude Desktop, Cursor, VS Code) at it, and the assistant gains
**32 tools** that talk to your mainframe through z/OSMF using the
[Zowe](https://www.zowe.org) SDK.

<img width="3000" height="1000" alt="6770AD52-6CF4-4300-9BF8-2D1A6C96FB9C" src="https://github.com/user-attachments/assets/aa879b40-c571-4988-9e35-38d088acc29b" />

## Getting started

You need Node.js 20.9 or newer, a reachable z/OSMF endpoint, and credentials
for it.

```bash
npm install
npm run build
```

Then add the server to your MCP client's config. Settings come from the `env`
block here — there is no `.env` file:

```json
{
  "mcpServers": {
    "mainframe": {
      "command": "node",
      "args": ["/absolute/path/to/dist/index.js"],
      "env": {
        "ZOSMF_HOST": "your-zosmf-host.internal",
        "ZOSMF_USER": "your-username",
        "ZOSMF_PASSWORD": "your-password"
      }
    }
  }
}
```

Ready-made examples are in [`config/`](config/). Every setting is listed in
[docs/configuration.md](docs/configuration.md).

Ask the assistant to _"check the mainframe connection"_ to confirm it works.

## The tools

| Category                  | What it covers                                                     | Tools |
| ------------------------- | ------------------------------------------------------------------ | ----- |
| **Batch jobs**            | Submit work and follow it - status, output, and why it failed      | 6     |
| **Datasets**              | Find and read the mainframe's files, libraries, and members        | 5     |
| **Unix files**            | Browse and read the Unix side of z/OS (USS)                        | 3     |
| **Day-to-day operations** | What broke, how often, and whether the system is healthy right now | 8     |
| **Deeper analysis**       | Root-cause reports, and which jobs look likely to fail next        | 2     |
| **CICS regions**          | Inspect the transaction system that runs interactive workloads     | 3     |
| **Db2 databases**         | Look up the tables and views that exist in Db2                     | 2     |
| **Performance metrics**   | Read the system's own performance records (SMF/RMF)                | 1     |
| **Security and audit**    | Review RACF audit records and check this server's own guardrails   | 2     |

The full list, with every argument, is in
[docs/tools.md](docs/tools.md). The last four categories need extra settings
before they can do anything; each tool says exactly what is missing.

## Keeping it safe

The mainframe still makes the final call — RACF and z/OSMF decide what your
credentials may touch. These settings stop an AI agent from going further than
you intended _inside_ those permissions:

| Setting                             | What it does                                         |
| ----------------------------------- | ---------------------------------------------------- |
| `SECURITY_READ_ONLY=true`           | Refuses anything that writes, including `submit_jcl` |
| `SECURITY_ALLOWED_TOOLS`            | Only these tools may run                             |
| `SECURITY_BLOCKED_TOOLS`            | These tools may never run                            |
| `SECURITY_ALLOWED_DATASET_PATTERNS` | Restricts which datasets can be reached              |
| `SECURITY_ALLOWED_USS_PATHS`        | Restricts which Unix paths can be reached            |
| `SECURITY_AUDIT_LOGGING=true`       | Logs every call, with credentials redacted           |

Ask for a _"security posture summary"_ to see which of these are switched on.

Before production, also: use a dedicated service account with least-privilege
RACF profiles, keep secrets in a vault rather than plain environment variables.

## Working on it

```bash
npm run check    # types, lint, formatting, and tests
npm run dev      # rebuild on save
```

The code layout and how to add a tool are in
[CONTRIBUTING.md](CONTRIBUTING.md) and
[docs/architecture.md](docs/architecture.md).

## License

MIT — see [LICENSE](LICENSE) and [NOTICE](NOTICE).
