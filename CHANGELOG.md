# Changelog

This project follows [Semantic Versioning](https://semver.org).

## Unreleased

### Fixed

- `summarize_abends` and `list_db2_subsystems` evaluated security policy under a
  different name than the one they registered. Naming either tool in
  `SECURITY_ALLOWED_TOOLS` or `SECURITY_BLOCKED_TOOLS` had no effect, and their
  audit records carried the wrong name.

### Changed

- Audit records now say whether they were written before (`started`) or after
  (`finished`) a call, so the two entries per call can be told apart.
- The minimum supported Node.js version is 20.9, matching the Zowe SDK.

## 2.5.0

Initial public release. 32 tools covering batch jobs, datasets, Unix files,
day-to-day operations, deeper analysis, CICS, Db2, performance metrics, and
security auditing.
