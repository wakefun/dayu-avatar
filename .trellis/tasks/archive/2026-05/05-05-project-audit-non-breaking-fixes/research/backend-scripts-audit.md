# Research: Backend Scripts Audit

- **Query**: Audit local repo for task `.trellis/tasks/05-05-project-audit-non-breaking-fixes`, focusing only on `apps/api/src/index.ts`, root package scripts, tsconfig, `.env.example`, and README API/runtime contracts.
- **Scope**: internal
- **Date**: 2026-05-05

## Findings

### Files Audited

| File Path | Description |
|---|---|
| `apps/api/src/index.ts` | Express API, env loading, SQLite/session store, OIDC, uploads, generation, static file routes |
| `package.json` | Root pnpm scripts and runtime engine declarations |
| `tsconfig.base.json` | Shared TypeScript compiler options |
| `.env.example` | Backend runtime variable example values/contracts |
| `README.md` | API/runtime documentation and verification commands |

### Audit Items

| Severity | Evidence | Finding | Why it matters | Fix class |
|---|---|---|---|---|
| Low | `apps/api/src/index.ts:191-198`; runtime dev log used repo-root `data/`; repo has `./data` and no `./apps/data`. | Rechecked: `apiRoot = apps/api` and `path.resolve(apiRoot, '../..')` correctly resolves to the repository root. | README `.env` and `data/` contracts are honored; the earlier root-mismatch suspicion was a false positive. | No fix needed. |
| Low | `package.json:9-14`; `README.md:119-127`, `221-229` | README verification commands match root scripts: `pnpm typecheck`, `pnpm lint`, `pnpm build`; scripts run recursive workspace commands. | Script contract appears consistent for verification. | No fix identified. |
| Low | `package.json:5-8`; `README.md:47-50`; `apps/api/src/index.ts:1` | Node 24 engine and README prerequisite align with `node:sqlite` usage. | Runtime requirement is documented and enforced at package metadata level. | No fix identified. |
| Low | `tsconfig.base.json:1-13`; `apps/api/src/index.ts:0-9` | Shared TS config targets ES2022/ESNext, strict mode, Node types; backend imports Node built-ins and Express types. | Compiler/runtime contract appears internally consistent. | No fix identified. |
| Low | `apps/api/src/index.ts:302-307`; `.env.example:5`; `README.md:73-79` | CORS origin uses `WEB_ORIGIN`, matching environment docs. | Frontend/API local contract is documented. | No fix identified. |
| Low | `apps/api/src/index.ts:202-210`; `.env.example:12-23`; `README.md:80-87` | generation mode, OpenAI model/quality/timeout env keys match documented names/defaults. | OpenAI runtime contract appears aligned. | No fix identified. |
| Low | `apps/api/src/index.ts:211-215`, `2526-2530`; `.env.example:25-30`; `README.md:88-99`, `176-195` | OIDC env keys and documented OIDC flow match code-level configuration checks and callback routes. | Auth runtime contract appears aligned. | No fix identified. |
| Low | `apps/api/src/index.ts:327-931`; `README.md:161-174`, `176-185`, `201-210` | README lists API route groups/response shapes; implemented routes follow `/api/**` and error shape `{ error: { code, message } }`. | API shape contract is broadly reflected in code. | No fix identified. |

## Caveats / Not Found

- No external references were used; this was a local repo audit only.
- The audit did not run commands such as typecheck/lint/build and did not inspect files outside the requested scope.
- A root-path mismatch was considered and rejected after rechecking `path.resolve(apps/api, '../..')`, runtime logs, and existing data directories.
