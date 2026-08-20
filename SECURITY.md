# Security policy

## Reporting a vulnerability

Please report security issues privately rather than opening a public issue.

Use GitHub's private vulnerability reporting on this repository
(**Security → Report a vulnerability**), or email the maintainers.

Please include what you can:

- What the issue allows an attacker to do
- Steps to reproduce it
- Affected version
- Any suggested fix

You can expect an acknowledgement within a few days and an assessment shortly
after. Please give us a reasonable window to ship a fix before disclosing
publicly.

**Redact before you send.** No real hostnames, user ids, dataset names, or job
output.

## Supported versions

Fixes go to the latest published release.

## What this server does and does not protect

This server sits between an AI agent and z/OSMF. It can restrict what the agent
asks for; it cannot grant anything your credentials do not already have.

**The mainframe is the real boundary.** RACF and z/OSMF make the final
authorization decision on every call. Give the server a dedicated service
account with least-privilege profiles — do not rely on the settings below
alone.

**What the server does enforce**, before any call leaves the process:

- Read-only mode, refusing every write operation
- Tool allow and block lists
- Dataset pattern and USS path boundaries
- A size cap on submitted JCL
- Audit records for every call, with credentials and JCL bodies redacted

See [docs/configuration.md](docs/configuration.md#guardrails) for the settings.

## Deployment notes

- **Keep TLS verification on.** `ZOSMF_REJECT_UNAUTHORIZED=false` disables
  certificate checking and the server warns loudly when you do it.
- **Credentials are environment variables.** They are visible to anything that
  can read the process environment. Prefer a secrets manager that injects them
  at launch, and prefer a token over a password where you can.
- **The SSE transport has no authentication.** Anyone who can reach the port can
  drive the server with your mainframe credentials. Keep it on localhost, or put
  an authenticating proxy in front of it.
- **Audit logs go to stderr as JSON.** Ship them somewhere durable if you need a
  record of what the agent did.
