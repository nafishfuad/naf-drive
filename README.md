# NAF Drive

One private drive over all your cloud accounts. Zero-knowledge encrypted, direct
browser↔provider transfers. See `PLAN.md` (roadmap) and `AGENTS.md` (coding laws +
security rules) before contributing.

## Stack

pnpm monorepo · Next.js 15 (web) · NestJS + Prisma (api) · PostgreSQL (Supabase-compatible)
· Zod contracts (`@naf/shared`) · provider adapters (`@naf/providers`)

## Quickstart (local dev)

Prereqs: Node ≥ 20, pnpm ≥ 9, Docker (for local Postgres/Redis).

```powershell
# 1. Install dependencies
pnpm install

# 2. Start Postgres (54322) and Redis (54323)
docker compose -f infra/docker-compose.yml up -d

# 3. API environment
Copy apps/api/.env.example → apps/api/.env   # defaults work with the compose DB

# 4. Create tables + demo seed row
cd apps/api
npx prisma migrate deploy
npx prisma db seed
cd ../..

# 5. Web environment — must live inside apps/web (Next.js reads it from there)
Copy apps/web/.env.example → apps/web/.env.local   # add your Supabase URL + anon key
#    (create a free project at https://supabase.com → Project Settings → API)

# 6. Run everything
pnpm dev        # web on :3000 · api on :3001
```

## Verify the toolchain

```powershell
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## Repository map

```
apps/web            Next.js UI (SEO landing at /, auth, dashboard at /dashboard, settings)
apps/api            NestJS REST API (/health, /v1/vault/*), Prisma schema
packages/shared     Zod schemas + TS contracts shared by every app
packages/providers  StorageProvider port — one adapter per cloud (Phase 1+)
infra/              docker-compose (dev) · Dockerfile.api (prod image)
docs/               ADRs & runbooks
.github/workflows/  ci.yml (PRs) · deploy-api.yml (main → Oracle VM)
```

## Security notes

- File bytes never touch our servers (direct browser↔provider transfers) — in every mode.
- **Standard mode** stores files plainly in the user's own drives.
- **Private Vault** (opt-in) encrypts contents + provider-side filenames client-side; the
  master key exists only wrapped with the user's passphrase/recovery phrase. `apps/api`
  stores ciphertext envelopes exclusively and can never decrypt vault data.
- Never commit `.env*` files. Secrets live in GitHub Actions secrets /
  Vercel dashboards only.
