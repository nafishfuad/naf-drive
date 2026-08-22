# NAF Drive — Master Plan

> Status legend: `[ ]` todo · `[~]` in progress · `[x]` done.
> Companion file: `AGENTS.md` (coding laws + security rules — read first).
> Work top-to-bottom through phases. Do not start a phase until the previous one meets its acceptance criteria.

---

## 1. Vision

**NAF Drive** = one clean drive interface over the user's *own* scattered cloud accounts.
Users connect Google Drive, Dropbox, OneDrive, pCloud, Box, etc.; NAF Drive shows a single
file system and uploads/downloads directly browser↔provider (zero server bandwidth).
Two tiers: **Standard** (default — plain files in the user's own drives, zero friction) and
**Private Vault** (opt-in — contents + provider-side filenames encrypted client-side with
keys only the user holds). A placement engine decides where files go while respecting
per-account usage caps.

**Non-goals (v1):** replacing providers, server-side storage of user files, phone/SMS auth,
desktop sync clients (Phase 4+), team shared spaces (Phase 4+).

## 2. Locked Decisions

| Area | Decision |
|---|---|
| Audience | Private launch (owner + friends) → public signups later |
| Privacy | Zero-knowledge default: we can never read file contents; admin panel sees metadata only |
| Stack | pnpm monorepo · Next.js 15 + TS strict + Tailwind + shadcn/ui (web) · NestJS + Prisma (api) · packages/shared (Zod contracts) · packages/providers (adapters) |
| Auth | Supabase Auth: email verification, TOTP MFA, backup email, 10 printable recovery codes. No SMS |
| DB | Supabase Postgres free tier (+ keep-alive ping during dev) |
| Queue | Upstash Redis + BullMQ |
| Storage tiers | `STANDARD` default: plain files, real names everywhere, no extra secrets · `VAULT` opt-in: passphrase-wrapped master key, contents + provider-side names encrypted client-side. Level-2 name-blind DB metadata = Phase 2 |
| Recovery | Account: backup email / TOTP / codes (Supabase-managed). Vault data: signup Recovery Phrase wraps Master Key + `naf-manifest.json` index on every drive root + offline open-source Recovery Kit HTML tool (Vault users only) |
| Transfers | Direct browser↔provider over CORS; tus-style resumable 8–16MB chunks; Web Worker chunk+hash pipeline (VAULT adds encrypt step); IndexedDB queue; HTTP Range streaming downloads; Oracle VM proxy only as CORS fallback |
| Placement | `available = min(quota_total × cap%, quota_free) − reserved` → largest-fit wins; ties broken by most-recently-successful |
| Hosting | Vercel free (web) · Oracle Always-Free ARM VM (api+workers) · Supabase · Upstash ≈ $0/mo |

## 3. System Architecture

```
┌──────────────────── Browser (user) ────────────────────┐
│ Next.js UI · TanStack Query/Virtual                     │
│ Web Worker: AES-GCM chunk crypto + SHA-256              │
│ Transfer engine: tus-style resume, IndexedDB queue      │
│ WebCrypto: master key unwrap (Vault Passphrase/phrase)  │
└───────┬───────────────────────────────┬─────────────────┘
        │ metadata JSON (KBs)           │ ciphertext chunks (direct!)
        ▼                               ▼
┌── NestJS API (Oracle VM / Vercel) ──┐   ┌─ Provider APIs ─────────┐
│ Supabase JWT guard · Zod validation │   │ Google Drive (CORS ✓)   │
│ Placement Engine · FS service       │   │ Dropbox    (CORS ✓)     │
│ Token broker: refresh→30min mint    │◄──► OneDrive   (CORS ✓)     │
│ BullMQ workers: manifests, watchdog │   │ pCloud/Box (Phase 2)    │
└──────────┬──────────────────────────┘   └─────────────────────────┘
           ▼
   Supabase Postgres (metadata only) · Upstash Redis (queue)
```

Key invariant: **file bytes never pass through our infrastructure** (proxy fallback is the rare exception).

## 4. Data Model (Prisma)

```
users               id, supabase_user_id, display_name, storage_mode(A/B/C),
                    wrapped_master_key, recovery_phrase_wrapped, vault_setup_at, role
provider_connections id, user_id→users, provider_type(enum), display_name,
                    encrypted_tokens_json, cap_pct(1–100), status(ok|expired|error),
                    quota_cache_json {total,used}, last_synced_at
nodes               id, parent_id→nodes(null=root), owner_id, type(folder|file),
                    name(display), size_bytes, mime_type, status(staged|active|trashed|deleted),
                    created_at, updated_at, deleted_at
                    UNIQUE(parent_id, name, owner_id) among non-deleted
file_locations      id, node_id→nodes, connection_id→provider_connections,
                    remote_file_id, remote_path, size_bytes(cipher),
                    sha256_ciphertext, status(pending|complete|failed)
upload_sessions     id, user_id, node_id, connection_id, target_remote_folder,
                    total_bytes, chunk_size, received_chunks(json), status, expires_at
shares              id, node_id, owner_id, token_hash, password_hash?, expires_at?,
                    max_downloads?, download_count, revoked_at?
activity_log        id, user_id, action(enum), meta_json, created_at
usage_daily         id, user_id, date, upload_bytes, download_bytes, api_requests, storage_bytes
```

Indexes: `nodes(owner_id,parent_id,status)` · `file_locations(node_id)` ·
`usage_daily(user_id,date)` unique · `shares(token_hash)`.

## 5. Provider Matrix

| Provider | API | CORS direct | Resumable upload | Free quota | Scope policy | Phase |
|---|---|---|---|---|---|---|
| Google Drive | official REST/OAuth2 | ✅ | ✅ resumable sessions | 15GB | `drive.file` minimum | 1 |
| Dropbox | official | ✅ | ✅ upload sessions | 2GB | `files.content.write` scoped app folder first | 1 |
| OneDrive | MS Graph | ✅ | ✅ upload session URLs | 5GB | `Files.ReadWrite.AppFolder` first | 2 |
| pCloud | official | ✅ | ✅ chunked API | up to 10GB | OAuth scoped | 2 |
| Box | official | ✅ | ✅ chunked uploads | 10GB | app-folder scope first | 2 |
| MEGA | unofficial SDK | ⚠️ E2E-native | n/a (its own crypto) | 20GB | ToS risk — mark "unofficial" | 3+ |
| Samsung Cloud | ❌ discontinued | — | — | — | excluded permanently | — |
| S3-compatible (Storj/Backblaze) | S3 API | ✅ presigned URLs | ✅ multipart | generous free tiers | bucket-scoped keys | 4 |

Rule: start every provider with **app-folder-only scopes**; request broader scopes only if a feature truly needs it.

## 6. Phases

### Phase 0 — Scaffold & Foundation (~1 week)
Goal: runnable monorepo with auth and empty drive shell.

- [x] Init pnpm monorepo (turborepo): `apps/web`, `apps/api`, `packages/shared`, `packages/providers`, plus `infra/` (docker-compose, Dockerfile.api) and `docs/`; TS strict everywhere; ESLint+Prettier; commitlint
- [x] Docker Compose for local dev (Postgres + Redis) mirroring Supabase/Upstash envs
- [x] Prisma schema for all tables above + migrations (`0_init` generated); seed script
- [ ] Supabase project: enable email confirmations, TOTP MFA, backup-email flow design doc ← **owner action: create free project, put URL+anon key into `.env.local`**
- [x] `apps/api`: NestJS bootstrap, config module with zod-env, Supabase JWT guard, health endpoint, structured logging (pino), global error filter (RFC7807 shape)
- [x] `apps/web`: Next.js shell, Tailwind, route structure (/drive, /settings, /setup-vault), auth screens wired to Supabase SDK (login + TOTP challenge), protected routes middleware
- [x] Vault key ceremony: Master Key generated client-side → wrapped with Argon2id(Vault Passphrase) → stored as ciphertext envelopes; Recovery Phrase shown once; wrap/unwrap roundtrip covered by unit tests (7 passing)
- [x] CI — `.github/workflows/ci.yml`: on every PR run lint → typecheck → unit tests → build → `pnpm audit`; Turborepo filters so only affected apps rebuild
- [ ] Branch protection on `main`: PR required, all status checks required, no direct push, no force push ← **owner action after first push to GitHub**
- [ ] Vercel project linked to repo (root = `apps/web`): preview deployment per PR, production deploy automatic on main merge ← **owner action**
- [x] CD — `.github/workflows/deploy-api.yml`: on main merge touching `apps/api/**` → migrate + Docker build + SSH deploy to Oracle VM; green no-op until `ORACLE_VM_*` secrets exist
- [ ] Sentry + UptimeRobot wired ← **owner action: create free accounts, add DSNs to env**

**Acceptance:** fresh clone → `docker compose up -d && pnpm i && pnpm dev` works; register/login/logout/TOTP works; recovery code list shown once; vault unlock roundtrip tested; opening a test branch PR shows all ci.yml checks green + a Vercel preview URL; merging it triggers the api deploy workflow (runs green even if VM not yet provisioned — job no-ops with a clear message until infra exists).

### Phase 1 — MVP: one real drive end-to-end (~4 weeks)
Goal: browse/upload/download files between NAF Drive ↔ Google Drive ↔ Dropbox.

- [ ] `packages/providers`: `StorageProvider` interface (listFolder, ensureFolder, createResumableSession, uploadChunk, downloadRange, stat, delete, getQuota) + GoogleDrive adapter + Dropbox adapter (official OAuth flows, PKCE where supported)
- [ ] Settings → "Connect account": OAuth consent → tokens envelope-encrypted (AES-256-GCM) → row in provider_connections; disconnect revokes at provider
- [ ] Quota sync worker: hourly getQuota → quota_cache_json; connection status badges
- [ ] Placement Engine v1 + property-based tests (caps respected, largest-fit, no overflow under concurrency — reserve via Postgres transaction)
- [ ] Upload pipeline: session create (Zod-validated) → mint ≤30-min scoped token → browser chunk+encrypt in Worker → direct resumable upload → completion endpoint writes nodes/file_locations atomically
- [ ] Download pipeline: location map + token → parallel Range fetches → decrypt-on-stream → save-to-disk (File System Access API, blob fallback)
- [ ] Drive UI: folder tree, breadcrumbs, grid/list toggle, virtualized listing, drag-drop multi-file upload with progress/pause/resume/cancel, rename/delete/move/copy, search-by-name, sort
- [ ] Trash: soft-delete nodes, restore, 30-day purge worker
- [ ] `naf-manifest.json` writer (debounced, per connection root) + reader
- [ ] usage_daily counters; basic quota dashboard (per-account bar with cap% slider)
- [ ] Playwright smoke: register→connect(mock HTTP provider)→upload→download→delete roundtrip

**Acceptance:** upload a 100MB file on flaky throttled network → pause/resume survives tab reload → file lands whole on chosen provider honoring caps; download decrypts correctly; manifest visible in the real Drive UI; zero file bytes observable hitting our API logs.

### Phase 2 — v1 completeness + public-readiness (~3 weeks)
Goal: more providers, sharing, admin monitoring, resilience.

- [ ] Adapters: OneDrive, pCloud, Box (+ CORS-fallback proxy mode through Oracle VM behind feature flag)
- [ ] Share links: expiry, optional password, max-downloads, revoke; share page streams client-side (`#key` fragment only needed for Vault-mode files)
- [ ] Level-2 name-blind metadata (VAULT): encrypt `nodes.name`/paths per-user under the vault key; decrypted tree + search served client-side after unlock
- [ ] Background jobs hardening: token auto-refresh w/ retry ladder, orphaned-session reaper, stale staged-node cleanup, manifest repair job
- [ ] Admin panel (role-gated): users count, storage totals, transfers/day, error rates per adapter, queue depth, connection health — **metadata only**
- [ ] Free-limit watchdog cron: poll Supabase/Upstash/Vercel/VM usage → alert Discord/email at 60/80/95% of each vendor cap
- [ ] Backup email + recovery-code regenerate flows; audit-log viewer for own account
- [ ] Rate limiting (per-user/IP buckets), idempotency keys on mutating POSTs, security headers audit vs checklist
- [ ] Email via Resend free tier: security alerts (new login, new device, token expiry)

**Acceptance:** 5 providers connected simultaneously behave independently; share link works in incognito without NAF account; admin sees accurate usage; watchdog fires on simulated threshold breach; OWASP ASVS-lite self-review signed off in PR notes.

### Phase 3 — Power features (~4 weeks)
Goal: advanced reliability + convenience.

- [ ] Chunk-striping fallback for oversized files (no single provider fits): stripe chunks across ≥2 connections, reassembly map in file_locations.chunk_index (VAULT chunks stay encrypted), Recovery Kit compatibility
- [ ] Content-addressed dedup (sha256 in metadata; skip re-upload when identical hash already on same connection)
- [ ] Thumbnails/previews: first-frame previews for images/PDF/text (VAULT: client-side decrypt-first-frame); LRU cache in IndexedDB
- [ ] Provider-to-provider migration tool: copy/move trees between two connected accounts server-side-free (browser-driven or worker-driven with streaming)
- [ ] PWA: installable, offline shell, background upload queue continuation
- [ ] MEGA unofficial adapter (flagged, opt-in, ToS warning modal)

**Acceptance:** 40GB virtual file spanning 3×15GB accounts round-trips intact after killing network mid-transfer twice; dedup saves verifiable duplicate bytes; mode switch completes without data loss (manifest diff check).

### Phase 4 — Scale-out (later, backlog order)
- [ ] React Native (Expo) mobile app reusing `packages/shared`
- [ ] Desktop sync client (Electron/Tauri) — watch-folder bidirectional sync
- [ ] S3-compatible adapters (Storj, Backblaze B2) via presigned multipart
- [ ] Team/family spaces with per-member caps
- [ ] File versioning (keep last N versions per node)
- [ ] Public signup wave: waitlist, abuse controls, ToS/privacy pages reflecting zero-knowledge claims accurately

## 7. Security Model Summary

Layers: Supabase auth (identity) → NestJS guards (session) → per-resource ownership checks →
Zod input walls → least-privilege short-lived provider tokens → direct transfers keep file
bytes off our servers (all modes) → VAULT tier adds client-side encryption + envelope-wrapped
keys at rest → rate limits + headers + audit trail. See AGENTS.md §5 checklist — applied to
every feature.

## 8. Observability & Cost Watchdog

| Concern | Tool | Free allowance |
|---|---|---|
| Errors | Sentry | 5k events/mo |
| Logs | pino → Axiom | 500GB/mo |
| Metrics/dashboards | Grafana Cloud | generous free |
| Uptime | UptimeRobot | 50 monitors |
| Product analytics | PostHog (metadata events only) | 1M events/mo |
| DB health | Supabase dashboard + pg_stat_statements | built-in |
| Vendor caps | custom watchdog cron → Discord/email | free |

Watchdog thresholds: alert at 60/80/95% of: Supabase 500MB DB · Upstash daily commands ·
Vercel 100GB bandwidth · Oracle VM disk/CPU · Resend daily emails.

## 9. Cost Model

Fixed ≈ $0/mo. Variable drivers are all metadata-scale (KB/user/month). Growth pressure
points ranked: Supabase DB size → Upstash commands → Vercel bandwidth → VM CPU. Mitigation:
usage_daily trend alerts fire long before limits; paid escape hatch is a single $10–25/mo tier
(Postgres dedicated) only when DAU justifies it.

## 10. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Provider changes API/CORS | transfers break | adapter interface isolates blast radius; proxy fallback path; contract tests per adapter |
| Provider suspends automated-use account (ToS) | user loses that volume | prefer official APIs + app scopes; MEGA flagged unofficial/opt-in; docs warn users |
| User loses Vault Passphrase AND Recovery Phrase (Vault users) | vault data unrecoverable | mandatory phrase print step + backup email reminders; cannot be fixed by us by design (document loudly). Standard-mode users unaffected |
| Supabase free project pauses (inactivity) | API outage | keep-alive ping during dev; real traffic post-launch; restore runbook documented |
| Browser memory blowup on huge files | crash | constant-memory streaming everywhere; chunk-size ceiling; File System Access sink |
| Race conditions in placement | quota overflow | reserve-inside-transaction + property tests + reconciliation worker vs provider quota |
| Vendor free-tier policy change | cost shock | watchdog alerts early; architecture keeps paid upgrade path small and optional |

## 11. Idea Backlog (not scheduled)

Smart placement policies (speed-preferred provider, cost tags) · selective offline pinning ·
duplicate finder UI · activity digest emails · browser extension "save to NAF Drive" ·
end-to-end shared folders between NAF users · rclone-compatible webdav bridge ·
import-from-MultCloud-style bulk transfer wizard.
