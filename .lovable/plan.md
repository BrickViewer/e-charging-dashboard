

## Probleem

De app hangt op "Laden..." door twee samenhangende issues:

1. **Deadlock in AuthContext**: `fetchRole()` maakt `await` Supabase-calls *binnen* de `onAuthStateChange` callback. Dit blokkeert de Supabase auth event-loop en kan een deadlock veroorzaken waardoor `isLoading` nooit `false` wordt.

2. **Ontbrekende accounts**: De client-gebruiker `info@brickviewer.nl` bestaat nog niet.

## Plan

### Stap 1 — Fix AuthContext deadlock

De `onAuthStateChange` callback mag geen Supabase API-calls awaiten. Oplossing:
- In `onAuthStateChange`: alleen `setSession` en `setUser` updaten (synchrone state). Geen `fetchRole` aanroepen.
- `fetchRole` verplaatsen naar een apart `useEffect` dat reageert op veranderingen in `user`.
- `getSession()` blijft de initiële sessie herstellen en triggert via de user-state het role-fetch effect.

```text
onAuthStateChange ──► setSession + setUser (sync only)
                           │
                           ▼
useEffect([user]) ──► fetchRole(user.id) ──► setRole ──► setIsLoading(false)
```

### Stap 2 — Accounts aanmaken

Een tijdelijke edge function (`create-test-users`) die via de Supabase Admin API twee gebruikers aanmaakt:

| Account | Email | Wachtwoord | Rol |
|---------|-------|------------|-----|
| Admin | wessel.jonkers@brickviewer.nl | welkom123 | admin (al ingesteld) |
| Client | info@brickviewer.nl | welkom123 | client (via `portal_user_id`) |

De edge function:
- Maakt `info@brickviewer.nl` aan via `supabase.auth.admin.createUser()`
- Koppelt deze aan demo-client `10000000-0000-0000-0000-000000000001` via `UPDATE clients SET portal_user_id = ...`
- Reset het wachtwoord van `wessel.jonkers@brickviewer.nl` naar `welkom123` via `supabase.auth.admin.updateUserById()`

Na uitvoering wordt de edge function aangeroepen met `curl` en daarna verwijderd.

### Stap 3 — Login pagina: redirect als al ingelogd

Een klein toevoeging aan `Login.tsx`: als de gebruiker al is ingelogd en een rol heeft, direct doorsturen naar het juiste portaal zodat ze niet op de login-pagina blijven hangen.

### Resultaat

- `wessel.jonkers@brickviewer.nl` → login → `/admin` (beheerpaneel)
- `info@brickviewer.nl` → login → `/portal` (klantportaal)
- Geen "Laden..." hang meer

### Technische details

**AuthContext.tsx wijzigingen:**
- `onAuthStateChange` wordt een synchrone callback (geen `async`)
- Nieuw `useEffect` met dependency `[user]` voor het ophalen van de rol
- `isLoading` wordt pas `false` gezet nadat de rol is opgehaald (of als er geen user is)

**Edge function `create-test-users`:**
- Gebruikt `SUPABASE_SERVICE_ROLE_KEY` (al beschikbaar als secret)
- Idempotent: controleert of gebruikers al bestaan voor aanmaken

