# Security Review — e-charging-dashboard

This is a prompt-template + checklist for an external AI agent (Codex, etc.) to perform a thorough security audit of this codebase.

**Read `AGENTS.md` first** for context (architecture, data model, RLS layout). This file zooms in on what to audit and how to report.

---

## The audit prompt

Copy/paste this as the opening prompt for the audit:

> Perform an in-depth security audit of this codebase (e-charging-dashboard, a Supabase-backed dashboard for an EV-charging revenue-share platform). Read `AGENTS.md` first for context. Walk through the checklist in `SECURITY_REVIEW.md` and produce a findings report grouped by **severity** (Critical / High / Medium / Low / Info). For each finding include: file path + line numbers, what's wrong, exploit scenario in 1-2 sentences, and a concrete recommended fix (code diff preferred). Do not fix anything yet — produce the report first so I can triage.

---

## Severity rubric

- **Critical** — data leak, auth bypass, money flow can be redirected, or remote code execution
- **High** — significant privilege escalation possible, sensitive data exposed to wrong audience, or write-access where read was intended
- **Medium** — defense-in-depth missing, would compound with another bug, or affects integrity of business calculations
- **Low** — best-practice deviations, hardening opportunities, missing logging
- **Info** — observations worth noting, no immediate risk

---

## Audit checklist

### 1. Row-Level Security (RLS)

**Tables to audit (all have RLS on):** `clients`, `locations`, `charge_points`, `charging_sessions`, `quarterly_settlements`, `tariff_profiles`, `client_invitations`, `eflux_invoices`, `eflux_sync_log`, `eflux_sync_state`, `organizations`, `profiles`, `user_roles`, `notifications`, `activity_log`, `quotes`.

**Helper functions:** `has_role(uuid, app_role)`, `is_internal(uuid)`, `get_client_id_for_user(uuid)`. All are `SECURITY DEFINER`.

Audit:

- [ ] Does `is_internal()` correctly distinguish between roles? It currently returns `true` for **any** user that has a row in `user_roles`, regardless of which `app_role`. Is that intended for all places it's used as SELECT-gate (clients, locations, sessions, settlements, ...)? A `viewer` user can see everything via this gate.
- [ ] Is the `SECURITY DEFINER` + `SET search_path TO 'public'` pattern correctly applied to all helper functions? Any function missing `search_path` is vulnerable to search-path injection.
- [ ] Can a portal user (non-internal) trigger a query path that returns another klant's data? Check joins in hooks (`useClientData.ts`) and `select(...)` strings — RLS protects the leaf table but transitive joins can leak.
- [ ] Is there any policy with `qual = true` or `using_expr = 'true'` on a sensitive table? (Currently `eflux_invoices.service_role_volledige_toegang` does this — verify it's restricted to `roles: {service_role}`).
- [ ] Are INSERT/UPDATE/DELETE policies present where they should be, or do tables silently allow all writes through ALL-policies?
- [ ] Can a klant **modify** their own `clients` row (e.g., change `revenue_share_percentage` or `energy_cost_per_kwh`)? Current SELECT-only policy `Portal user can view own client` should prevent this — verify there's no UPDATE-policy that leaks.
- [ ] Look for tables without RLS or with `permissive: 'PERMISSIVE'` policies that should be `RESTRICTIVE`.
- [ ] `notifications`: can user A insert notifications voor user B? Check the INSERT policy — it currently only requires `is_internal(auth.uid())` for INSERT, no `recipient_id` check.

### 2. Edge Functions

**Functions:** `eflux-sync`, `aggregate-settlements`, `eflux-test-connection`, `send-client-invitation`, `accept-client-invitation`.

Audit:

- [ ] Check the `verify_jwt` flag of each deployed function. `aggregate-settlements` and `eflux-test-connection` are currently deployed with `verify_jwt: false`. Is that intentional? They use service-role key internally — if any unauthenticated caller can invoke them, they can trigger arbitrary recompute/probes.
- [ ] `eflux-test-connection` runs Road API probes and returns raw responses — does this leak provider info, account IDs, internal endpoint structure to an unauthenticated caller?
- [ ] `accept-client-invitation`: is the token comparison time-safe (no early-return on mismatch)? Is the token long enough (verify in `client_invitations.token` generation in `send-client-invitation`)?
- [ ] `send-client-invitation`: can a klant trigger an invitation to an email of their choice for a klant they don't own? Check role guard.
- [ ] Does `invoke_edge_function()` SQL helper leak the anon key in error messages or logs?
- [ ] Are CORS headers locked down or `Access-Control-Allow-Origin: *`? Risk if `verify_jwt=false` since browsers will let any origin call it.
- [ ] Are any service-role-only operations exposed via a public endpoint that returns the data to the caller (vs. just writing to DB)?

### 3. Authentication & authorization (frontend)

Audit:

- [ ] In `src/contexts/AuthContext.tsx` and the Supabase client setup: is the session refreshed correctly, and does sign-out clear all cached query data (TanStack Query)?
- [ ] Route guards: do `/admin/*` routes block portal-users client-side? More importantly: **server-side** via RLS, since client-side guards are advisory. Verify a portal-user calling an admin hook gets no data, not an error that exposes structure.
- [ ] Are there any `useAdminData.ts` hooks used in portal pages by mistake?
- [ ] In `accept-client-invitation` landing: after linking `clients.portal_user_id`, is the session correctly established or does the user have to re-authenticate? Avoid an intermediate window where the link is set but not yet auth'd.
- [ ] Is there protection against invitation-token brute-force? Rate-limit?

### 4. API key / secret handling

Audit:

- [ ] `EFLUX_API_KEY` storage — confirm it's only in Edge Function secrets, never in DB or client bundle. Grep for `EFLUX_API_KEY` and `eflux_api_key` in `src/`.
- [ ] `supabase_anon_key` in Vault — accessed by `invoke_edge_function()`. Any other place that reads it from Vault?
- [ ] Any `.env`/`.env.local` files committed to the repo? Check `.gitignore`.
- [ ] Service role key — should NEVER be in `src/`. Grep `SUPABASE_SERVICE_ROLE_KEY`.
- [ ] Are Resend, Stripe, or other future API keys also in env-secrets (not DB)?
- [ ] `organizations` table previously had a `eflux_api_key` column that was dropped in migration `20260512112037`. Verify it's truly gone and no code path still references it.

### 5. Money flow integrity

This is a financial system — calculation bugs = real money lost.

Audit:

- [ ] In `aggregate-settlements/index.ts`: when status is `approved`/`paid`/`charged_back`, the function correctly skips and does NOT overwrite. Verify there is no path where an admin can re-trigger compute and silently change an approved settlement.
- [ ] The approve-handler in `AdminClientDetail.tsx` writes `setup_fee_charged_at` and `setup_fee_amount` to charge_points. If the approve fails halfway (e.g., one paal update succeeds, settlement update fails), is there a transaction or compensation?
- [ ] `eflux_setup_fee_paal_ids` is an array on `quarterly_settlements`. Can it be tampered with via direct DB write (RLS check)? Should it be immutable once status leaves `live`/`calculated`?
- [ ] Floating-point precision: amounts are stored as `numeric`, but in JS/TS we use `Number()`. Any place where we do `× 100 / 100` rounding that could drift?
- [ ] `revenue_share_percentage` is read from `clients` — is it possible for a klant (via portal) to UPDATE this on their own row? RLS should block, but verify.
- [ ] Can a stale `charging_sessions.reimbursement_amount` be retroactively changed by a re-sync after approve, silently breaking the historical settlement total? Look at `eflux-sync/index.ts` upsert behavior.

### 6. SQL / NoSQL injection

- [ ] All DB access goes via Supabase JS client — verify no `rpc()` calls construct SQL via string concatenation.
- [ ] `invoke_edge_function(fn_name text, ...)` SQL helper: `fn_name` is interpolated into a URL — could a malicious caller pass `'aggregate-settlements?evil=1'`? Check if it's safely encoded.
- [ ] Edge functions: any place using raw SQL via `supabase.rpc()` or `from(...).select(rawString)`?
- [ ] `eflux-sync` reads from Road API → upserts into DB. Are field names validated, or could a malicious API response with extra columns cause something?

### 7. Cross-site scripting (XSS)

- [ ] React escapes by default — but check for `dangerouslySetInnerHTML` anywhere. Grep.
- [ ] User-provided strings (klant company_name, contact_name, location.name, paal.name) rendered as-is — fine in React, but check if any are used in `document.title`, `URL` construction, or copied into clipboard without encoding.
- [ ] Markdown rendering anywhere? Notification messages? Should be sanitized.

### 8. CSRF / origin

- [ ] Supabase JS client uses fetch with Authorization headers (not cookies), so CSRF is mostly N/A.
- [ ] Edge functions with `verify_jwt=true` are CSRF-safe via JWT requirement. Functions with `verify_jwt=false` need separate scrutiny.

### 9. Logging & monitoring

- [ ] `activity_log` insertions — check what's logged. Anything sensitive (passwords, tokens) ending up in logs?
- [ ] `eflux_sync_log.error_message` — could include API responses; do they contain secrets?
- [ ] Stack traces returned to clients on Edge Function failures (`return json({status: "error", message: msg}, 500)`) — could leak internal info. Check `aggregate-settlements/index.ts` and `eflux-sync/index.ts`.

### 10. Dependencies

- [ ] Run `npm audit` mentally — flag any known-vulnerable packages in `package.json`. Focus on auth, crypto, fetch, html-rendering deps.
- [ ] Are `@supabase/supabase-js`, `react-router-dom`, `react-hook-form`, `zod` all on recent versions?

### 11. Klant-portal isolation (the most important check)

Specifically construct attack scenarios:

- [ ] Klant A logs in. Can klant A see klant B's clients-row? Try: query `clients` table, expect only own row.
- [ ] Klant A inspects their portal-session's JWT, then directly calls `/rest/v1/quarterly_settlements?select=*` (no klant_id filter). Should return only own settlements thanks to RLS.
- [ ] Same for: `locations`, `charge_points`, `charging_sessions`, `tariff_profiles`, `notifications`.
- [ ] Can klant trigger an admin-only edge function? (`eflux-sync`, `aggregate-settlements`) — should require admin JWT or fail.
- [ ] Can klant accept an invitation that belongs to another klant? Test the `accept-client-invitation` flow with a stolen/leaked token.
- [ ] Notification recipient confusion: can klant A send themself a notification claiming to be from E-Charging admin? (Currently `is_internal()` check on INSERT — verify klant is not internal.)

### 12. Data export / GDPR

- [ ] Klant request to delete account: is there a path? `clients.portal_user_id` would need un-linking; `auth.users` deletion needs `handle_new_user` trigger consideration.
- [ ] Klant request data export: aggregate from clients + sessions + settlements — no current endpoint.
- [ ] Logs retention — `activity_log` and `eflux_sync_log` grow forever; pruning policy?

---

## Out of scope (don't waste time on)

- Stripe integration (not yet built)
- BTW handling (not yet built)
- IBAN handling (not yet built)
- Document archive (placeholder only)
- Visual design / a11y review (separate concern)

---

## Format of the report

Please produce findings in this format:

```
### [SEVERITY] Short title
**Location:** path/to/file.ts:123-145
**Issue:** What's wrong, technically.
**Exploit:** 1-2 sentences describing how this could be abused.
**Fix:** Concrete recommendation, code diff if possible.
```

Group by severity (Critical first). At the end, give a 1-paragraph executive summary suitable for sharing with non-engineers.
