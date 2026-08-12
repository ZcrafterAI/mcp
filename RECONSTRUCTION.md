# How this source tree was reconstructed

The upstream repository for `@notharshhaa/mainframe-mcp-server` was deleted from
GitHub. This document records how the TypeScript in `src/` was recovered, how it
was verified, and exactly where it differs from what upstream shipped.

## What was and wasn't available

| Source | Status |
| --- | --- |
| `github.com/NotHarshhaa/mainframe-mcp-server` | **404** — repo removed (owner account still active, 93 other repos) |
| `@notharshhaa/mainframe-mcp-server` on npm | Live, `2.5.0` latest, ships prebuilt `dist/` |
| `src/*.ts` in any published version | Never shipped — checked 1.0.0, 2.0.0, 2.1.0, 2.2.0, 2.5.0 |
| `dist/*.js.map` `sourcesContent` | Absent — maps carry `mappings` only, no source text |
| Forks or mirrors | None on GitHub |

So the original `.ts` files were not directly recoverable. What *did* survive is
enough to rebuild them faithfully:

- `dist/*.js` — `tsc` output, unminified, with JSDoc and identifier names intact
- `dist/*.d.ts` — complete public type declarations

## Method

Three passes, scripted so the result is reproducible rather than hand-typed:

1. **Merge.** For each module, start from the `.js` implementation. Pure type
   modules (`export {}` in the emit) are taken from their `.d.ts` verbatim — for
   those the declaration *is* the original source. Restore the file-header JSDoc
   and type-only imports, both of which the `.js` emit drops.

2. **Apply signatures.** Lift each exported function, constructor, and const
   signature out of the `.d.ts` and apply it to the implementation, merging
   positionally: parameter *name* and default from the implementation, *type*
   and optionality from the declaration. This is what recovers the `?` markers,
   generics, and return types that JS emit erases.

3. **Hand-fix the rest.** Some things appear in neither artifact and were
   reconstructed from how the code uses them:
   - Module-local types never exported, so absent from the `.d.ts`
     (`RawDataset`, `RawMember`, `RawUssItem`, the Db2 response envelopes).
   - `as const` assertions, which are type-level and vanish from the emit.
   - Generic type arguments at call sites — `getJson<T>(…)` emits as `getJson(…)`.
   - Annotations on non-exported helpers and callbacks.

`tsconfig.json` uses `strict: true`, so the compiler located every remaining gap.

## Verification

Two independent checks, both passing:

**1. It recompiles to the same JavaScript.** Comparing `tsc` output against the
original `dist/`, ignoring comments and whitespace: **65 of 69 files are
byte-identical.** The 4 that differ are the deliberate changes listed below.

**2. It runs identically.** Built and driven over stdio with a JSON-RPC
`initialize` + `tools/list` handshake, the server registers all **32 tools** —
the same set the published package registers.

## Intentional deviations from upstream

Four files differ, each for a stated reason. All are behaviour-preserving.

| File | Change | Why |
| --- | --- | --- |
| `server.ts` | `listen(port, resolve)` → `listen(port, () => resolve())` | `Promise<void>`'s `resolve` takes no argument; `listen`'s callback passes none, so the value is unchanged. |
| `tools/db2/shared.ts` | Use the `location` returned by `requireDb2Config()` instead of re-reading `config.enterprise.db2Location` | Same value — the helper returns exactly that field after its guard — but typed as `string` rather than `string \| undefined`. |
| `tools/security/query-racf-audit.ts` | `.filter(Boolean)` → `.filter((part): part is string => Boolean(part))` | Identical at runtime; narrows the type so the later `.split('=')` is safe. |
| `config/index.ts` | CRLF → LF inside the `SETUP_HINT` string; install hint renamed to `@zcrafterai/mcp` | The stray CRs were an editor artifact (only 2 files in the whole package had them). The hint named a different package than this one. |

One cosmetic emit-level difference: in `server.js` and `query-racf-audit.js` the
file-header comment no longer appears in the *compiled output*, because it now
sits directly above an `import type` line that is elided during emit. The header
is present in the `.ts` source, which is what matters.

## Reproducing

The conversion scripts are not part of the runtime and are not published. The
inputs were the unpacked npm tarball for 2.5.0. Nothing in `src/` requires them
to build — `npm install && npm run build` is self-contained.
