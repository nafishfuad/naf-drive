## What does this PR do?

<!-- Link the PLAN.md task: `PLAN.md § Phase X — <task>` -->

## How was it verified?

- [ ] `pnpm lint && pnpm typecheck && pnpm test` green locally
- [ ] New logic covered by tests (unit / property-based)
- [ ] Manual verification steps (list below)

## Security checklist (AGENTS.md §5 — all boxes or don't merge)

- [ ] Auth guard + explicit ownership check on every new endpoint
- [ ] Inputs validated with Zod schemas (strict where public)
- [ ] No secrets/tokens/PII in logs, errors, or responses
- [ ] No file bytes persisted server-side
- [ ] No new deps without license/health check (`pnpm audit` clean)
