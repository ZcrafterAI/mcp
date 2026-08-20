# How the code is organised

The server does one thing: it takes a request from an AI agent, turns it into a
z/OSMF call, and turns the answer back into readable text. Everything below
serves that path.

## Where things live

```
src/
├── index.ts        start here — load settings, build, connect
├── server.ts       build the server and attach every tool
├── config/         settings: read from the environment, validated once
├── transport/      how the AI client connects (stdio, or HTTP + SSE)
├── zowe/           connections to the mainframe and raw REST calls
├── tools/          everything an agent can ask for, grouped by category
├── policy/         the guardrails every call passes through
├── parsers/        reading the mainframe's own text and XML output
├── utils/          errors, logging, formatting, small helpers
└── types/          shared types
```

## What happens during one call

```
AI agent
   │  "read SYS1.PROCLIB(IKJEFT01)"
   ▼
transport/          receives the JSON-RPC request
   ▼
policy/guard.ts     is this tool allowed? is that dataset in bounds?
   │                writes a "started" audit record
   ▼
tools/datasets/     the tool runs: validate input, call z/OSMF
   ▼
zowe/               the session and the HTTP call
   ▼
utils/formatters    the answer becomes a readable table or report
   ▼
policy/guard.ts     writes a "finished" audit record with the outcome
   ▼
AI agent
```

If anything throws, `guard` catches it and returns a short error with a stable
code instead of crashing the server. No tool needs its own `try`/`catch` for
this.

## The tool layer

Tools are grouped by subject, one directory per group:

```
tools/
├── registry.ts       the catalog — the one place that lists every group
├── define-tool.ts    how a tool is declared
├── jobs/
│   ├── index.ts      the group's tool list
│   ├── shared.ts     fetching and normalising, used by several tools
│   ├── list-jobs.ts  one file per tool
│   └── ...
└── datasets/, uss/, operations/, analysis/, cics/, db2/, smf/, security/
```

A tool file declares what it is and what it does — nothing else:

```ts
export const listJobsTool = defineTool({
  name: 'list_jobs',
  description: 'List z/OS batch jobs filtered by owner, name prefix, or status.',
  input: inputShape,
  async run({ owner, prefix }, ctx) {
    const jobs = await listJobs(ctx, owner ?? '*', prefix ?? '*');
    return textResult(formatJobList(jobs));
  },
});
```

The name appears once. Security checks, audit records, and error handling are
applied by `defineTool` to every tool alike, so they cannot be forgotten or
applied inconsistently.

When a tool touches a dataset or a Unix path, it says so, and the policy layer
checks it against the configured boundaries _before_ the tool runs:

```ts
resources: ({ dsn }) => ({ dataset: dsn }),
```

## Talking to the mainframe

`zowe/` holds three small pieces:

- **`session.ts`** — builds and caches one connection per endpoint (`zosmf`,
  `cmci`, `db2`). Credentials are resolved in exactly one place.
- **`rest-client.ts`** — `getJson` / `getText` / `postJson`, which turn network
  failures into a clear "cannot reach the host" error.
- **`requirements.ts`** — the guards for optional features, each naming the
  setting that is missing.

Most tools never touch these directly; they use the Zowe SDK through their
group's `shared.ts`.

## Types

`types/zos.ts` defines a small, stable shape for each mainframe concept — job,
dataset, member, USS entry. The SDK's raw responses are normalised into these
immediately, so a change in an SDK field name is a one-line fix in one
`shared.ts` rather than a change across every tool.
