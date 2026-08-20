# Contributing

Thanks for helping out. This project talks to production mainframes, so the bar
is "obviously correct and easy to read" rather than clever.

## Getting set up

```bash
npm install
npm run check    # types, lint, formatting, and tests
```

You do not need a mainframe to work on most of this. The test suite runs the
whole server in memory with no network access.

## Before you open a pull request

```bash
npm run check
```

That runs everything CI runs. If formatting is the only complaint,
`npm run format` fixes it.

## Adding a tool

1. **Write the tool.** One file per tool, in the group directory it belongs to
   (`src/tools/jobs/`, `src/tools/datasets/`, and so on):

   ```ts
   export const myThingTool = defineTool({
     name: 'my_thing',
     description: 'One or two sentences telling an agent when to use this.',
     input: inputShape,
     async run(args, ctx) {
       return textResult(/* ... */);
     },
   });
   ```

2. **List it** in that group's `index.ts`.

3. **If it touches a dataset or a Unix path**, add a `resources` function so the
   security boundaries apply to it:

   ```ts
   resources: ({ dsn }) => ({ dataset: dsn }),
   ```

4. **If it writes anything**, add its name to `WRITE_TOOLS` in
   `src/policy/rules.ts` so read-only mode refuses it.

5. **Update the docs**: `npm run docs:tools` regenerates `docs/tools.md` from
   the code. Do not edit that file by hand.

A brand-new category also needs one entry in `src/tools/registry.ts`, with a
title and summary written for someone who does not know mainframes.

## House style

- **Names are written once.** If you find yourself repeating a tool name, a
  setting name, or a limit, there is a place it should live instead.
- **Throw, don't catch.** Tools throw the typed errors in `src/utils/errors.ts`.
  The wrapper around every tool turns them into clean messages. A `try`/`catch`
  inside a tool usually means something is being hidden.
- **Never write to stdout.** Under the stdio transport that channel is the MCP
  protocol. Log through `src/utils/logger.ts`, which writes to stderr. The
  linter enforces this.
- **Say what a limit is for.** A number in the code needs a name and a reason.
- **Comments explain why.** What the code does should be clear from reading it.

## Writing for an AI agent

Tool descriptions and argument text are read by a model deciding what to call.

- Say when to reach for the tool, not just what it wraps.
- Give every argument a `.describe()` with an example: `'JES job id, e.g. "JOB01234".'`
- Error messages should name the fix: which setting, which permission, which DD
  to look at.

## Tests

Add a test whenever behaviour changes. The suites are:

| File                     | Covers                                             |
| ------------------------ | -------------------------------------------------- |
| `test/core.test.mjs`     | Identifier handling, sessions, bounded concurrency |
| `test/policy.test.mjs`   | Guardrails and redaction, in isolation             |
| `test/contract.test.mjs` | The full MCP call path, end to end                 |
| `test/registry.test.mjs` | That every tool is listed, named, and described    |

## Reporting a security problem

Please don't open a public issue — see [SECURITY.md](SECURITY.md).

## Please don't include

Real hostnames, user ids, dataset names, or job output in issues, pull
requests, or tests. Redact them first.
