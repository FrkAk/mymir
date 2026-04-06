# Security

---

## Encryption Layers

### Layer 1: Encryption at Rest (Neon)

Neon encrypts all data on disk (AES-256). Automatic, no configuration needed.

### Layer 2: Encryption in Transit

TLS/SSL required on all Neon connections (`sslmode=require`). Cloudflare Workers enforce HTTPS on all requests.

### Layer 3: Application-Level Encryption (ALE)

Sensitive fields are encrypted in the application before writing to the database. Even with full DB access, an attacker sees only ciphertext.

**Algorithm:** AES-256-GCM (authenticated encryption, unique IV per value).

**Key architecture:**

```
MASTER_KEY (env var, never in DB)
    ├── HKDF(masterKey, orgId)  → per-org key
    └── HKDF(masterKey, userId) → per-user key (free-tier personal projects)
```

- HKDF = HMAC-based Key Derivation Function (Node.js `crypto`)
- Per-org/user derived keys -- compromise of one scope doesn't expose others
- Master key stored in Cloudflare Secrets Store (HSM-backed DEK/KEK hierarchy)
- Cloudflare Secrets Store: keys are unreadable after storage -- not by developers, admins, or Cloudflare employees. Only the Worker at runtime can decrypt.

**Encrypted fields (IP + sensitive data):**

| Table | Encrypted columns |
|---|---|
| `projects` | `title`, `description`, `decisions`, `history` |
| `phases` | `title`, `description`, `goal`, `decisions`, `history` |
| `modules` | `title`, `description`, `acceptance_criteria`, `decisions`, `history` |
| `tasks` | `title`, `description`, `acceptance_criteria`, `decisions`, `implementation_plan`, `planning_context_snapshot`, `execution_record`, `history` |
| `conversations` | `messages` |
| `node_edges` | `note` |
| `user_profiles` | `polar_customer_id`, `polar_subscription_id` |
| `api_keys` | `encrypted_key` |

**Plaintext fields (needed for queries):**

All IDs, FKs, `status`, `order`, `edge_type`, `source_type`, `target_type`, `tier`, `subscription_status`, `billing_cycle`, `created_by`, timestamps.

### Layer 4: LLM API Key Protection

All LLM API keys (personal and org) are stored server-side with the same encryption path as project data. Keys are **write-only** -- never readable after saving.

**Storage:** `api_keys` table with `encrypted_key` column (AES-256-GCM).

**Encryption chain:**

```
User's LLM API key (plaintext, received once via HTTPS)
  → AES-256-GCM with per-scope derived key
    → HKDF(MASTER_KEY, owner_type + owner_id)
      → MASTER_KEY in Cloudflare Secrets Store
        → Secrets Store protected by Cloudflare's KEK + HSM
```

**Lifecycle:**

| Action | What happens |
|---|---|
| Save key | Key sent via HTTPS once, encrypted, stored in DB. Plaintext zeroed from server memory. |
| Use key | Server decrypts from DB per request, creates LLM provider instance, calls API, zeros decrypted key. |
| Rotate key | User enters new key, old ciphertext overwritten and unrecoverable. |
| Delete key | Row deleted from DB, ciphertext gone. |
| DB breach | Attacker gets ciphertext, useless without MASTER_KEY. |
| App code leaked | Attacker sees encryption logic, still needs MASTER_KEY from Cloudflare Secrets Store. |

**What is NOT done:**

- Keys are NOT stored in localStorage (no XSS risk)
- Keys are NOT sent in request bodies on every chat call (sent once at save time only)
- Keys are NOT passed as URL query parameters (no server log exposure)
- Keys are NOT readable after saving -- not by the user, not by admins, not by us

**Resolution order per chat request:**

```
1. User's personal key (api_keys WHERE owner_type='user')
2. Org shared key (api_keys WHERE owner_type='org')
3. Server env var fallback
4. No key → error
```

### Layer 5: Auth Data Protection

| Data | Protection |
|---|---|
| Passwords | Hashed (bcrypt/argon2) by Better Auth -- not reversible |
| Email | Plaintext in `neon_auth.user` (needed for login lookup) -- protected by Neon encryption at rest |
| OAuth tokens | Encrypted by Better Auth |
| Session tokens | Short-lived, auto-expire, HttpOnly/Secure/SameSite cookies |

---

## Access Control

### Row-Level Scoping

Every DB query must be scoped to the authenticated user:

- **Org projects:** `WHERE org_id IN (user's org memberships)`
- **Personal projects:** `WHERE owner_id = currentUser.id`
- **Shared projects:** `WHERE project_id IN (user's project_shares)`
- **Never:** `SELECT * FROM projects WHERE id = :id` without auth check

### Role Enforcement

| Action | Owner | Admin | Editor |
|---|---|---|---|
| Manage org settings | Yes | Yes | No |
| Invite/remove members | Yes | Yes | No |
| Delete org | Yes | No | No |
| CRUD projects | Yes | Yes | Yes |
| View all org projects | Yes | Yes | Yes |

### Tier Enforcement

| Action | Free | Pro |
|---|---|---|
| Create project | 1 max | Unlimited |
| Create tasks | 40 max | Unlimited |
| Join/create org | No | Yes |
| Share project | Yes | Yes |

---

## Input Validation

- Drizzle ORM: parameterized queries (prevents SQL injection)
- Zod: validation on all server actions and AI tool parameters
- Server actions: 2MB body limit (Next.js config)

---

## Transport Security

- HTTPS enforced by Cloudflare Workers (automatic)
- HSTS headers via Cloudflare
- CSP headers to prevent XSS

---

## GDPR Compliance

### Data Classification

| Category | Data | Legal basis |
|---|---|---|
| Account PII | Email, name, avatar | Contract performance (Art. 6(1)(b)) |
| Subscription data | Polar IDs, tier, billing cycle | Contract performance |
| Project IP | Titles, descriptions, plans, conversations | Contract performance |
| Auth metadata | Sessions, OAuth tokens | Legitimate interest (Art. 6(1)(f)) |

### Rights Implementation

| Right | How |
|---|---|
| **Access (Art. 15)** | Data export endpoint -- decrypt and return all user data as JSON |
| **Erasure (Art. 17)** | Delete user account + all owned projects + org memberships. Derived encryption keys become unreachable -- encrypted data in backups is permanently unreadable. |
| **Portability (Art. 20)** | JSON export of decrypted projects, phases, modules, tasks, conversations |
| **Rectification (Art. 16)** | User can update name/email via account settings |
| **Restriction (Art. 18)** | Deactivate account without deletion |

### Data Minimization

- No analytics PII, no tracking pixels, no third-party analytics
- LLM API keys encrypted server-side (AES-256-GCM), write-only, never readable after save
- Payment data handled entirely by Polar -- never touches our DB
- No data collected beyond what's needed for the product

### Breach Response

If DB is breached: all IP fields are ALE-encrypted. Attacker gets ciphertext + structural metadata (statuses, timestamps, IDs). No personal project content is exposed. GDPR breach notification obligation is reduced when encrypted data is compromised (Recital 87).

---

## Implementation Checklist

### Before Launch

- [ ] `lib/crypto.ts` -- `encrypt()`, `decrypt()`, `deriveKey()` (~40 lines)
- [ ] Encrypt/decrypt wrapper in data access layer (`lib/graph/queries.ts`)
- [ ] `api_keys` table + unified key storage/retrieval (`lib/keys.ts`)
- [ ] Remove localStorage API key storage from client
- [ ] Remove API key from chat request body -- server reads from `api_keys` table
- [ ] Fix `GET /api/models` -- move `apiKey` from query param to POST body
- [ ] Row-level access control on every server action and API route
- [ ] `MASTER_KEY` in Cloudflare Secrets Store (HSM-backed)
- [ ] Zod validation on all server actions
- [ ] HTTPS only (Cloudflare automatic)
- [ ] Secure session cookies (Better Auth default)
- [ ] CSP headers via Cloudflare response headers

### Before Paying Customers

- [ ] Rate limiting on auth endpoints (login, signup, invite)
- [ ] GDPR data export endpoint (`/api/export`)
- [ ] GDPR data deletion endpoint (`/api/delete-account`)
- [ ] Privacy policy page
- [ ] Terms of service page
- [ ] Cookie consent (if adding any analytics later)

### At Scale

- [ ] Master key rotation procedure (re-encrypt all data with new key)
- [ ] Audit logging (who accessed what, when)
- [ ] Automated orphan edge cleanup
- [ ] Security headers audit
