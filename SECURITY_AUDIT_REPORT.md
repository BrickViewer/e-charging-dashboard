# Supabase Security Audit — E-Charging dashboard

**Datum**: 2026-05-05
**Eigenaar**: E-Group BV (KvK 69153817)
**Scope**: Supabase project `uuldldhmuanmjlyvnagt` + frontend (`e-charging-dashboard`)
**Auditor**: zelf-audit via `/supabase-pentest` skill (vóór go-live)
**Autorisatie**: bevestigd (eigen platform, niet-productioneel)

---

## Executive summary

**Algemeen oordeel**: het platform is **structureel goed beveiligd**. Geen P0-bevindingen. Twee P1-bevindingen rond auth-configuratie zijn met 1-klik in het Supabase dashboard te fixen. Alle 15 publieke tabellen hebben correcte RLS-policies; cross-tenant access werd actief getest en is niet mogelijk.

| Severity | Aantal | Categorie |
|---|---|---|
| P0 (kritiek) | 0 | — |
| P1 (hoog) | **3** | `.env` in git, signup open, user-enumeration via signup |
| P2 (medium) | **2** | anon-key in publieke repo, leaked-password-protection uit |
| P3 (laag) | **3** | SECURITY DEFINER funcs via REST, 204 op write-block, search_path warnings |

---

## P1 — Onmiddellijk te fixen

### P1-A. `.env` is gecommit naar publieke GitHub-repo

**Repository**: `https://github.com/BrickViewer/e-charging-dashboard.git`
**File**: `.env` is tracked in git én staat NIET in `.gitignore`.

**Wat lekt**:
```bash
VITE_SUPABASE_PROJECT_ID="uuldldhmuanmjlyvnagt"
VITE_SUPABASE_URL="https://uuldldhmuanmjlyvnagt.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="eyJhbGc..."
```

**Impact**:
- Anon-key zelf is NIET vertrouwelijk (signed JWT met `role: anon`, beschermd door RLS — zie P3-A en Phase 3 voor RLS-validatie)
- Maar `.env` ontbreekt in `.gitignore`: future leaks (bv. ooit een Stripe-key, RESEND-key, of service_role key per ongeluk in `.env` zetten) worden direct publiek
- Project-URL is publiek leesbaar — verlaagt drempel voor probes

**Remediatie** (5 min):
```bash
echo "" >> .gitignore
echo "# Local environment" >> .gitignore
echo ".env" >> .gitignore
echo ".env.local" >> .gitignore
echo ".env.*.local" >> .gitignore

git rm --cached .env
git commit -am "chore: untrack .env from git, ensure not committed in future"
git push
```

Optioneel (defense in depth): roteer de anon-key in Supabase Dashboard → Settings → API → "Reset anon/public key", update `.env` lokaal en in deployment-platform env-vars.

---

### P1-B. Open signup terwijl het model invite-only is

**Bevinding**: `disable_signup: false` op `/auth/v1/settings`.

**Bewijs**:
```bash
$ curl -X POST 'https://uuldldhmuanmjlyvnagt.supabase.co/auth/v1/signup' \
  -H 'apikey: <ANON>' -H 'Content-Type: application/json' \
  -d '{"email":"pentest@gmail.com","password":"PwnPwn123!"}'
# → HTTP 429 "over_email_send_rate_limit" (endpoint accepteert input, valt alleen op rate-limit)
```

**Impact**:
- Het platform is invite-only volgens de business-flow (admin → `auth.admin.createUser` via `send-client-invitation`).
- Met open signup kan iedereen een orphan-account aanmaken op de publieke endpoint.
- Orphan heeft geen `client_id`-koppeling, dus RLS blokkeert data-access ✓.
- Risico's:
  - Email-quota DoS (Supabase free-tier: 30k mails/maand)
  - Vervuiling van `auth.users`
  - Toekomstige policy-zwakheid wordt direct exploitable

**Remediatie** (1 klik):
1. Supabase Dashboard → Authentication → Providers → Email
2. **"Allow new users to sign up"** → uit
3. Test: `curl /auth/v1/signup ...` moet HTTP 422 "signup_disabled" retourneren

Onze invite-flow gebruikt `auth.admin.createUser` server-side, niet het publieke `/auth/v1/signup` endpoint — blijft werken.

---

### P1-C. User enumeration via signup endpoint

**Bevinding**: `/auth/v1/signup` reveals of een email al bestaat.

**Bewijs — bestaande user**:
```json
POST /auth/v1/signup with {"email":"info@brickviewer.nl","password":"AnyPwd1234"}
→ HTTP 200
{
  "id": "fea406b3-...",
  "email": "info@brickviewer.nl",
  "recovery_sent_at": "2026-05-05T18:33:32.942521Z",  ← LEK: timestamp ouder dan now → user bestaat
  "confirmation_sent_at": "2026-05-05T18:34:36.467Z"
}
```

Bij niet-bestaande user is `recovery_sent_at` afwezig en zou `confirmation_sent_at` ≈ now zijn.

**Impact**: attacker kan emails enumeraten en gerichte phishing/credential-stuffing voorbereiden.

**Remediatie**: P1-B fix lost dit grotendeels op (signup endpoint geeft dan altijd dezelfde rejection). De andere endpoints (`/login`, `/recover`) zijn al generic — getest.

---

## P2 — Aan te raden

### P2-A. Leaked-password-protection uit

Supabase Auth heeft optionele HaveIBeenPwned-integratie om bekende-gelekte wachtwoorden te blokkeren. Nu uit.

**Remediatie**: Dashboard → Authentication → Policies → "Leaked Password Protection" → aan. Voert geen extra API-call uit — gebruikt k-anonymity hash-prefix lookup.

### P2-B. Anon-key zat in publieke repo (zie P1-A)

Strikt genomen niet vertrouwelijk (signed JWT, beschermd door RLS), maar best-practice is rotatie nadat de key publiek heeft gestaan. Optioneel, na P1-A fix.

---

## P3 — Defense-in-depth (lage prioriteit)

### P3-A. SECURITY DEFINER helper-functies callable via REST

Supabase advisor (`0028_anon_security_definer_function_executable`) flagde:
- `public.get_client_id_for_user(uuid)`
- `public.has_role(uuid, app_role)`
- `public.is_internal(uuid)`
- `public.handle_new_user()`

Deze zijn `SECURITY DEFINER` (draaien als owner) en aanroepbaar via `/rest/v1/rpc/`. Tests met willekeurige UUIDs leveren alleen `false`/`null` — geen data-leak. Maar best-practice: REVOKE EXECUTE op `anon`/`authenticated` zodat ze alleen intern (in policies) blijven werken.

**Remediatie**:
```sql
REVOKE EXECUTE ON FUNCTION public.get_client_id_for_user(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_internal(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
```

### P3-B. PostgREST 204 op RLS-blocked write

Wanneer RLS een UPDATE/DELETE blokkeert via "0 rows match", retourneert PostgREST `204 No Content` ipv `403 Forbidden`. Standaard PostgreSQL-gedrag, niet exploitable. Werd geverifieerd: `PATCH /clients` als portal-client geeft 204, maar `company_name` blijft ongewijzigd. Niet kritiek, alleen verwarrend in debugging.

### P3-C. `set_updated_at` heeft mutable search_path

Pre-existerende functie (niet door deze sessie aangemaakt). Advisor-warning `0011_function_search_path_mutable`. Niet kritiek voor security maar best-practice fixen:
```sql
ALTER FUNCTION public.set_updated_at SET search_path = public;
```

---

## ✅ Wat goed staat

| Domein | Status |
|---|---|
| **RLS aan op alle 15 publieke tabellen** | ✅ |
| **Geen `USING (true)`-policies** | ✅ |
| **Cross-tenant test (client A vs B)** | ✅ portal-user ziet alleen eigen data |
| **IDOR/write-attempts als portal-client** | ✅ alle blocked |
| **PostgREST anon-toegang tot tabellen** | ✅ 0 rows op alle 15 tabellen |
| **`auth.users` niet via PostgREST** | ✅ 404 |
| **Service-role key niet in client-code** | ✅ |
| **Stripe/Resend/eFlux secrets niet in client** | ✅ alle alleen in Supabase env / org-tabel met RLS |
| **Edge functions JWT-verified** | ✅ 4 van 5 (`accept-client-invitation` is by-design public) |
| **`accept-client-invitation` token entropie** | ✅ 256 bits |
| **Realtime broadcast** | ✅ niet in gebruik (geen WebSocket-surface) |
| **Storage buckets** | ✅ niet in gebruik (geen storage-surface) |
| **Login error generic** | ✅ geen enumeration via login |
| **Recover error generic** | ✅ geen enumeration via password-reset |
| **`mailer_autoconfirm: false`** | ✅ verificatie verplicht |

---

## Remediatie-checklist (in volgorde)

### Vandaag (5 min totaal)

- [ ] **P1-A**: `.env` toevoegen aan `.gitignore` + `git rm --cached .env`
- [ ] **P1-B**: Supabase Dashboard → Auth → Providers → Email → "Allow new users to sign up" UIT
- [ ] **P2-A**: Supabase Dashboard → Auth → Policies → "Leaked Password Protection" AAN

### Deze week (15 min)

- [ ] **P3-A**: REVOKE EXECUTE op de 4 SECURITY DEFINER functies
- [ ] **P3-C**: `ALTER FUNCTION public.set_updated_at SET search_path = public`
- [ ] (optioneel) **P2-B**: Supabase anon-key roteren

### Bij volgende sprint

- [ ] Storage-policies opzetten zodra eerste bucket wordt aangemaakt (logo's, MID-foto's)
- [ ] Realtime-policies controleren zodra een tabel naar `supabase_realtime` publication wordt toegevoegd

---

## Audit metadata

- Tracking files: `.sb-pentest-context.json`, `.sb-pentest-audit.log`
- Evidence: `.sb-pentest-evidence/01-detection/` t/m `07-functions-audit/`
- Reproduceerbare commands: `.sb-pentest-evidence/curl-commands.sh`
- Cleanup: test-accounts (`pentest-pwn-*@gmail.com`, `*@evil.test`) verwijderd uit `auth.users` ✓

**Re-audit aanbevolen**: na go-live (Stripe Connect live, Resend prod-domain verified), en periodiek per kwartaal.
