# Tech Stack

---

## Core

| Layer | Technology | Notes |
|---|---|---|
| Framework | Next.js 15 (App Router) | React 19, TypeScript strict, Turbopack dev server |
| Language | TypeScript | Strict mode enabled |
| Package Manager | Bun | All commands via `bun` -- never npm/yarn/node |
| Styling | Tailwind CSS v4 | CSS-first config via `@theme` in `app/globals.css` |
| Animation | Motion (`motion/react`) | Page transitions, UI interactions |
| Graph Viz | d3-force + Canvas | Force-directed layout for context network |
| Validation | Zod | AI tool parameter validation |

---

## Database

| | Details |
|---|---|
| Provider | Neon Postgres (serverless) |
| ORM | Drizzle ORM |
| Driver | `postgres` (TCP) via `DATABASE_URL` |
| Schema Mgmt | `drizzle-kit push` (no migration files) |
| Connection | Lazy proxy -- defers until first query, builds work without `DATABASE_URL` |
| Branching | Neon branches for dev/preview isolation |

### Why Neon

- Scale to zero -- no cost when idle
- Serverless -- auto-scales with traffic
- Branch-aware -- instant DB copies for dev/PR previews
- Free tier: 0.5 GiB storage, 191.9 compute hours/month
- Paid (Launch): $19/month, 10 GiB, 300 compute hours

---

## Authentication

| | Details |
|---|---|
| Provider | Neon Auth (Better Auth engine) |
| Auth data | Stored in `neon_auth` schema in your own Neon Postgres |
| OAuth | Google, GitHub (pre-configured, extensible) |
| Organizations | Better Auth organization plugin -- orgs, members, roles, invites |
| Sessions | Cookie-based, managed by Better Auth |
| Branch-aware | Each Neon branch gets isolated auth environment |

### Why Neon Auth

- Free up to 60,000 MAU
- Auth data lives in your own database (queryable, no black box)
- Organization + roles built-in (owner/admin/editor)
- Better Auth is open source -- can self-host if leaving Neon
- Branch-aware auth for dev/preview environments

---

## Hosting

| | Details |
|---|---|
| Provider | Cloudflare Workers |
| Adapter | `@opennextjs/cloudflare` (OpenNext) |
| Runtime | V8 isolates (not containers) |
| Cold start | <5ms |
| Build | `bun opennextjs-cloudflare build` |
| Deploy | `bun opennextjs-cloudflare deploy` |

### Why Cloudflare Workers

- Scale to zero -- $0 when idle
- Unlimited bandwidth (free and paid tiers)
- Free tier: 100,000 requests/day
- Paid tier: $5/month, 10M requests/month
- <5ms cold starts (V8 isolates vs container boot)
- Full Next.js 15 support: App Router, server actions, streaming, middleware
- Cheapest at scale -- 10-20% of Vercel's cost at similar traffic

### Comparison to Alternatives

| Platform | Idle cost | Paid tier | Bandwidth | Cold start |
|---|---|---|---|---|
| **Cloudflare Workers** | $0 | $5/mo | Unlimited | <5ms |
| Vercel | $0 | $20/user/mo | 1TB then $0.15/GB | ~250ms |
| Google Cloud Run | $0 | Pay-per-use | 1 GiB free then $0.12/GB | ~500ms-1s |
| Fly.io | $0 | Pay-per-use | 160GB free | 1-3s |

---

## Payments & Subscriptions

| | Details |
|---|---|
| Provider | Polar.sh (Merchant of Record) |
| Fee | 4% + $0.40 per transaction |
| Tax handling | Polar collects and remits VAT/GST/sales tax globally |
| Subscriptions | Monthly and yearly billing, trials, upgrades, downgrades, cancellations |
| Customer portal | Self-service invoices, payment method updates, billing history |
| Entitlements | Auto-delivery of access on payment |
| Webhooks | Subscription lifecycle events -> update `user_profiles.tier` |

### Why Polar.sh

- Merchant of Record -- handles global tax compliance (VAT, GST, sales tax)
- $0 until first sale
- Cheaper than Stripe + tax service (Polar: 4% + $0.40 vs Stripe: 2.9% + $0.30 + tax service)
- Built-in subscription management and customer portal
- No billing infrastructure to build

---

## AI

| | Details |
|---|---|
| SDK | Vercel AI SDK (`ai` package) |
| Model | Bring Your Own Key (BYOK) |
| Providers | Google Gemini (default), Anthropic Claude, OpenAI |
| Key storage | Encrypted server-side in `api_keys` table (AES-256-GCM) |
| Key resolution | Personal key → org shared key → server env var fallback |
| Rate limiting | Gemini free tier: 12 RPM target, exponential backoff on 429s |
| Cost to us | $0 -- users pay their own LLM provider |

### API Key Security

Keys are stored server-side with the same encryption used for project data. A single code path handles both personal and org keys. Keys are write-only -- never readable after saving. The `MASTER_KEY` used for encryption lives in Cloudflare Secrets Store (HSM-backed). See `docs/security.md` for full details.

---

## Security

| Layer | Technology | Details |
|---|---|---|
| Encryption at rest | Neon | AES-256, automatic |
| Encryption in transit | TLS/SSL | Neon `sslmode=require` + Cloudflare HTTPS |
| Application-level encryption | AES-256-GCM | All IP fields encrypted before DB write |
| Key management | HKDF per org/user | Derived from `MASTER_KEY` in Cloudflare Secrets Store (HSM) |
| Auth | Better Auth | Bcrypt password hashing, HttpOnly session cookies |
| SQL injection | Drizzle ORM | Parameterized queries |
| Input validation | Zod | All server actions and AI tool parameters |
| GDPR | Built-in | Data export, deletion, encryption, minimization |

See `docs/security.md` for full details.

---

## Infrastructure

| | Details |
|---|---|
| Repository | GitHub (private) |
| CI/CD | Cloudflare Workers auto-deploy from GitHub |
| DNS/CDN | Cloudflare (included with Workers) |

---

## Cost Summary

### At Zero Users (Development)

| Service | Cost |
|---|---|
| Neon Postgres | $0 (free tier) |
| Neon Auth | $0 (free up to 60k MAU) |
| Cloudflare Workers | $0 (free tier) |
| Polar.sh | $0 (no sales) |
| GitHub | $0 (free private repos) |
| **Total** | **$0/month** |

### At Early Traction (~1,000 users, ~100 paid)

| Service | Cost |
|---|---|
| Neon Postgres | $0-19/month |
| Neon Auth | $0 |
| Cloudflare Workers | $0-5/month |
| Polar.sh | 4% + $0.40 per transaction |
| **Total infra** | **$0-24/month** |

### At Scale (~10,000 users, ~1,000 paid)

| Service | Cost |
|---|---|
| Neon Postgres | $19/month (Launch) |
| Neon Auth | $0 |
| Cloudflare Workers | $5/month |
| Polar.sh | 4% + $0.40 per transaction |
| **Total infra** | **~$24/month** |

---

## When Free Tiers Run Out

### Neon Postgres

| Limit | Free tier | What triggers upgrade |
|---|---|---|
| Storage | 0.5 GiB | Database grows past 0.5 GiB (many projects, conversations, history JSONB) |
| Compute | 191.9 CU-hours/mo | Sustained high query volume (~768 hours wall-clock at 0.25 CU) |
| Branches | 10 | More than 10 dev/preview branches |

**Realistic trigger:** Storage. At ~500-1,000 active projects with conversations and history, you'll approach 0.5 GiB. Compute is unlikely to be hit first.

**Upgrade:** Neon Launch at $19/month -- 10 GiB storage, 300 compute hours. Handles tens of thousands of users.

### Cloudflare Workers

| Limit | Free tier | What triggers upgrade |
|---|---|---|
| Requests | 100,000/day (~3M/mo) | ~3M page loads + API calls per month |
| CPU time | 10ms per invocation | Complex server-side rendering or heavy API routes |

**Realistic trigger:** Request count. At ~1,000 daily active users hitting ~30 requests/session, you'd reach ~30,000 requests/day -- still well within free tier. Upgrade needed around ~3,000+ DAU.

**Upgrade:** Cloudflare Workers Paid at $5/month -- 10M requests/month, 30M CPU milliseconds.

### Upgrade Timeline Estimate

| Milestone | Neon | Cloudflare | Total infra |
|---|---|---|---|
| Launch (0-100 users) | Free | Free | $0/mo |
| Early traction (100-1,000 users) | Free or $19/mo | Free | $0-19/mo |
| Growth (1,000-5,000 users) | $19/mo | $5/mo | $24/mo |
| Scale (5,000-50,000 users) | $19-69/mo (Scale) | $5/mo | $24-74/mo |

Both services scale gradually. No sudden cost cliffs.
