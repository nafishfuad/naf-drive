# NAF Drive — AI Guide (AGENTS.md)

> **Read this file first in every session.** It contains the locked architecture, coding laws,
> and security rules for this project. If PLAN.md and this file conflict, this file wins on
> *how* code must be written; PLAN.md wins on *what* to build next.

---

## 1. What is NAF Drive?

A web app that lets users connect their **existing personal cloud storage accounts**
(Google Drive, Dropbox, OneDrive, pCloud, Box…) and presents them as **one unified drive
("NAF Drive")** with a Google-Drive-like file system UI.

- Our servers store **metadata only** — file bytes always travel directly between the user's
  browser/device and the provider ("direct transfer" architecture).
- **Two storage tiers.** Standard (default): files live plainly in the user's own drives.
  Private Vault (opt-in): contents and provider-side filenames are encrypted client-side so
  neither we nor providers can read them.
- The placement engine decides which connected drive stores each file, respecting
  per-account usage caps set by the user.
- Runs on **free tiers only** (~$0/month). Scalable by design because file volume costs us nothing.

## 2. Locked Decisions — DO NOT re-litigate or change without owner approval

| Area | Decision |
|---|---|
| Monorepo | pnpm workspaces + Turborepo |
| Frontend | Next.js 15 (App Router) + TypeScript strict + TailwindCSS + shadcn/ui + TanStack Query/Virtual |
| Backend | NestJS + Prisma ORM |
| Database | PostgreSQL via Supabase free tier |
| Auth | Supabase Auth (email verify, TOTP MFA). NO SMS/phone OTP. Backup email + 10 printable one-time recovery codes |
| Queue/cache | Upstash Redis + BullMQ |
| Encryption | Two-tier. **STANDARD** (default): no client-side encryption — privacy comes from direct browser↔provider transfers (bytes never touch us). **VAULT** (opt-in): AES-256-GCM client-side via WebCrypto, Master Key wrapped by Argon2id-derived key from Vault Passphrase |
| Storage modes | `STANDARD` default: plain files, real names in provider UIs, zero friction · `VAULT`: contents + provider-side filenames encrypted; recovery phrase mandatory; Level-2 name-blind DB metadata planned Phase 2 |
| File layout | One whole file on one provider (chunk-striping fallback only in Phase 3+) |
| Transfers | Direct browser↔provider over CORS. tus-style resumable chunks (8–16 MB), pause/resume, IndexedDB-backed queue. Proxy fallback via Oracle VM only when CORS fails |
| Providers | Phase 1: Google Drive, Dropbox · Phase 2: OneDrive, pCloud, Box · MEGA later marked "unofficial" · Samsung Cloud excluded (discontinued) |
| Hosting | Vercel (web) · Oracle Cloud Always-Free ARM VM (API + workers) · Supabase · Upstash ≈ $0/mo |
| Monitoring | Sentry (errors) · pino→Axiom (logs) · Grafana Cloud (metrics) · UptimeRobot · PostHog (metadata-only events) |
| Mobile (later) | React Native + Expo reusing `packages/shared` contracts |

## 3. Architecture Map & Repository Layout

### Structure law: mirrors deployment boundaries, not file types
- `apps/*` = things you **deploy** (web → Vercel · api+workers → Oracle VM)
- `packages/*` = things you **import** (shared contracts, provider adapters)
- `infra/` = how deployments happen · `docs/` = why decisions were made

```
naf-drive/
├── .github/
│   ├── workflows/
│   │   ├── ci.yml            # PR checks: lint → typecheck → test → build → audit
│   │   └── deploy-api.yml    # on main merge: Docker build → SSH deploy to Oracle VM
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── CODEOWNERS
├── apps/
│   ├── web/                  # FRONTEND — Next.js (Vercel)
│   │   └── src/
│   │       ├── app/          # Routes: / (SEO landing) · (auth)/login·register · auth/callback
│   │                        # · (drive-app)/dashboard·settings·setup-vault · robots/sitemap/OG
│   │       ├── components/   # ui/ · features/ · layout/
│   │       ├── hooks/
│   │       ├── lib/          # api client, auth helpers, query providers
│   │       └── workers/      # Web Workers: crypto + transfer engine (UI never blocks)
│   └── api/                  # BACKEND — NestJS (Oracle VM)
│       └── src/
│           ├── modules/      # auth · files · connections · placement · transfers
│           │                 # shares · admin · health
│           ├── workers/      # BullMQ processors: quota-sync · manifest-writer ·
│           │                 # watchdog · cleanup (isolated per queue → extractable
│           │                 # into apps/worker later WITHOUT refactor)
│           ├── common/       # guards, filters, interceptors, decorators
│           ├── config/       # zod-validated env (no process.env outside here)
│           └── prisma/       # PrismaService + migrations live in prisma/schema.prisma
├── packages/
│   ├── shared/               # Zod schemas + TS types = THE contract (web/api/mobile import)
│   └── providers/            # core/ (StorageProvider interface) · google-drive/ ·
│                             # dropbox/ · onedrive/ … one folder per cloud, zero business logic
├── infra/                    # docker-compose.yml (dev), Dockerfile.api, deploy scripts
├── docs/                     # ADRs (architecture decision records), runbooks
├── PLAN.md                   # Phased roadmap with checkboxes — update as work completes
└── AGENTS.md                 # This file
```

### Backend module template (every NestJS module follows this exactly)
```
modules/<name>/
├── <name>.controller.ts   # HTTP only — Zod-validate, delegate, return DTO
├── <name>.service.ts      # orchestration — no framework imports beyond DI
├── domain/                # pure business logic + port interfaces (unit-testable, no Nest imports)
├── dto/                   # Zod schemas from @naf/shared re-exported/augmented
└── <name>.module.ts
```

### Dependency rule (enforce in code review)
`web → shared ← api → providers`
- `providers` must NOT import from `apps/*`.
- Domain logic lives in `api/src/modules/<name>/domain`; adapters implement interfaces defined there.
- `process.env` access ONLY inside `config/` (zod-env); everything else reads typed config.

### Git & CI/CD workflow ("GitHub Flow" — how every change ships)
```
main (protected: PR required, all checks green required, no direct push)
 1. branch: feat/<topic> | fix/<topic> | chore/<topic>   (from latest main)
 2. commit with Conventional Commits → push
 3. open PR → ci.yml runs: lint → typecheck → unit+integration tests → build → pnpm audit
 4. Vercel posts a PREVIEW deployment URL on the PR for UI review
 5. squash-merge once green → CD fires:
      web → Vercel production deploy (automatic)
      api → Docker image build → SSH deploy to Oracle VM (deploy-api.yml)
 6. DB migrations run as pre-deploy step; always backward-compatible (expand-contract)
```
- Secrets live ONLY in GitHub Actions secrets / Vercel dashboard — never in repo, never in code.
- Renovate/Dependabot dependency PRs go through the same pipeline.
- Never merge red; never bypass checks; hotfixes are branches too (`hotfix/x` → fast review).

### Transfer pipelines (memorize)

```
UPLOAD (file bytes NEVER touch our servers):
browser → api: "add file" (metadata only, KBs)
api → browser: placement decision {connectionId, remoteFolderId, shortLivedToken(≤30min)}
browser Web Worker: split into 8–16MB chunks → AES-GCM encrypt each
browser → PROVIDER directly: resumable session upload (pause/resume/retry here)
browser → api: "complete" (+ ciphertext hashes) → write nodes/file_locations rows,
               rewrite naf-manifest.json on that connection root (debounced)

DOWNLOAD:
api → browser: short-lived token + location map
browser → PROVIDER directly: HTTP Range parallel fetches
browser: decrypt-on-stream → save (File System Access API / blob fallback)
```

### Data model (authoritative — see Prisma schema when it exists)

`users` · `provider_connections` · `nodes` (virtual FS tree) · `file_locations`
(node↔provider mapping) · `upload_sessions` · `shares` · `activity_log` · `usage_daily`.
Integrity is sacred: every `file_location` MUST have FK integrity to an existing node +
connection. Orphaned locations = lost data pointers = catastrophic bug.

## 4. Coding Laws

1. **KISS** — simplest solution that satisfies the current phase. No speculative features (YAGNI).
2. **DRY** — no copy-pasted logic ≥3 lines; extract to `shared/` if used across apps.
3. **SOLID-lite** — depend on interfaces (`StorageProvider` port); one reason to change per module.
4. **TypeScript strict** always: `"strict": true`, no `any`, prefer `unknown` + narrowing,
   exhaustive switch with `never` checks, no non-null `!` assertions outside tests.
5. **Functions ≤ ~40 lines**, files ≤ ~300 lines, single responsibility.
6. **Validate every boundary with Zod** (from `packages/shared`): HTTP bodies, query params,
   env vars (zod-env module), webhook payloads. Never trust client input — ever.
7. **Naming**: `PascalCase` classes/types/components · `camelCase` functions/variables ·
   `SCREAMING_SNAKE` constants · files `kebab-case.ts` · boolean vars read as predicates
   (`isConnected`, `canResume`).
8. **Comments**: only for *why*, never *what*. No commented-out code in commits. No TODO without issue link.
9. **Errors**: fail fast with typed errors (`NafError` base + codes). API returns RFC7807-style
   `{code, message, details}`. Never swallow errors; workers retry with exponential backoff + jitter.
10. **No comments explaining obvious code; no dead code; no magic numbers** — named constants.
11. Commits: Conventional Commits (`feat(api): ...`, `fix(web): ...`). Small PRs (<400 LOC).
12. Prefer composition over inheritance; dependency injection via NestJS DI everywhere in `api`.

## 5. Security Checklist — apply to EVERY feature/PR (all boxes or don't merge)

- [ ] Endpoint has auth guard + explicit ownership check (`resource.userId === req.user.id`)
      — authorization is checked **per request**, never assumed from UI hiding.
- [ ] Admin-only routes guarded by role claim; admin sees **metadata only**, never content/tokens.
- [ ] All inputs validated by Zod schema incl. max lengths; reject unknown fields.
- [ ] No secrets/keys/tokens/personal data in logs, error messages, or responses. Log IDs, not entities.
- [ ] OAuth refresh tokens stored only AES-256-GCM envelope-encrypted; keys from env/KMS, rotated quarterly.
- [ ] Tokens minted for browsers are short-lived (≤30 min) and least-privilege scope (e.g., `drive.file`).
- [ ] Rate limiting on all mutating endpoints + login/register/reset (per-IP and per-user).
- [ ] New dependencies: check license, weekly downloads, last publish <6mo, `pnpm audit` clean.
- [ ] SQL only via Prisma parameterized queries; no string-built queries anywhere.
- [ ] File paths/names sanitized against traversal; share tokens are 128-bit random, stored hashed.
- [ ] CSRF protection on cookie-auth mutations; cookies httpOnly+Secure+SameSite=Lax.
- [ ] CSP strict (no `unsafe-inline` scripts), HSTS, X-Content-Type-Options on all responses.
- [ ] Idempotency keys accepted on POST /upload-session, share-create, manifest-update.

### Hard "NEVER" rules
1. **NEVER persist file bytes server-side** (no disk writes of content, no temp files).
2. NEVER log plaintext keys, wrapped keys, tokens, passwords, or full URLs containing them.
3. NEVER bypass the placement engine to hand-pick a target connection.
4. NEVER decrypt VAULT-mode content server-side — vault decryption happens only in the user's
   browser/app. Standard-mode streams are never written to disk or persisted either.
5. NEVER send provider refresh tokens to any client, including the owner's own browser.
6. NEVER widen an OAuth scope "because it's easier" — least privilege is law.

## 6. Testing & Definition of Done

- Unit tests (Vitest) required for: placement engine (property-based: cap% respected,
  largest-fit chosen, no overflow), crypto helpers (test vectors), Zod schemas, domain services.
- Integration tests (Jest + Testcontainers Postgres or Supabase branch) for API modules.
- E2E smoke (Playwright) from Phase 1: register → connect mock provider → upload → download roundtrip.
- Every bug fix ships with a regression test first.
- **Definition of Done**: tests pass · lint/typecheck clean (`pnpm lint && pnpm typecheck`) ·
  security checklist above checked · docs updated · PLAN.md checkbox ticked.

## 7. Session Protocol for AI Assistants

1. Read `PLAN.md` → find the first uncompleted checkbox = current task.
2. Work within that phase only; do not start the next phase without owner confirmation.
3. Before claiming done: run `pnpm lint && pnpm typecheck && pnpm test` from repo root.
4. Update `PLAN.md` checkboxes/status as you complete tasks.
5. If a needed decision isn't covered here or in PLAN.md, ASK — do not invent policy.
