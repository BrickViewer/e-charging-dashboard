

# Batch 6: Financieel Overzicht — Goedkeuring Workflow & Stripe Payout

## Overzicht

Het financieel overzicht (`AdminFinancial.tsx`) bestaat al met KPI's, charts, en tabel. De uitbreiding voegt toe:
1. **Goedkeuring workflow** — inline status-wijziging per afrekening (calculated → approved → paid)
2. **Bulk acties** — meerdere afrekeningen selecteren en goedkeuren/markeren als betaald
3. **Maand filter** — dropdown om op specifieke maand te filteren
4. **Stripe payout stub** — bij "markeer als betaald" wordt `createTransfer()` aangeroepen (V1: noop/log, V2: echte Stripe call)
5. **Detail rij** — klikbare rij toont uitgebreid overzicht van de afrekening

## Wijzigingen

### 1. `AdminFinancial.tsx` — Uitbreiden

**Nieuwe functionaliteit:**
- Checkbox-kolom voor bulk selectie (select all / individueel)
- Actie-balk bovenaan tabel: "Goedkeuren (N)" en "Markeer betaald (N)" knoppen, zichtbaar wanneer items geselecteerd
- Status wijzigen: `supabase.from("monthly_settlements").update({ status }).eq("id", id)` met `useMutation` + `invalidateQueries`
- Bij "markeer betaald": ook `paid_at: new Date().toISOString()` zetten en `createTransfer()` aanroepen uit `services/stripe.ts`
- Maand filter: dropdown met unieke maanden uit de data
- Klikbare rij opent inline detail-paneel (collapsible) met sessie-aantallen, kosten-breakdown, en payout info
- Toast feedback na elke actie
- StatusBadge component hergebruiken in plaats van inline styling

**Maand filter:**
- Extra `Select` dropdown naast status filter
- Opties: "Alle maanden" + dynamisch uit data (bv. "mrt 2025", "feb 2025")

**Bulk acties flow:**
```text
┌──────────────────────────────────────┐
│ ☑ 3 geselecteerd  [Goedkeuren] [Betaald markeren] │
├──────────────────────────────────────┤
│ ☑ │ mrt 2025 │ Klant A │ ... │ Berekend   │
│ ☑ │ mrt 2025 │ Klant B │ ... │ Berekend   │
│ ☐ │ feb 2025 │ Klant A │ ... │ Betaald    │
└──────────────────────────────────────┘
```

### 2. `useAdminData.ts` — Geen wijzigingen nodig

Mutations worden direct in de component gedaan met `useMutation`.

### 3. `services/stripe.ts` — Geen wijzigingen

De bestaande `createTransfer()` stub wordt hergebruikt. Logt naar console in V1.

## Technische details

- Mutations: `useMutation` + `useQueryClient().invalidateQueries(["admin-settlements"])`
- Goedkeuren: update status naar `approved`
- Betaald markeren: update status naar `paid`, set `paid_at`, call `createTransfer()` met `client_payout` bedrag
- Alleen afrekeningen met status `calculated` kunnen goedgekeurd worden
- Alleen afrekeningen met status `approved` kunnen als betaald gemarkeerd worden
- Bulk selectie respecteert deze regels (knoppen disabled als selectie niet past)

## Bestanden

| Bestand | Actie |
|---------|-------|
| `src/pages/admin/AdminFinancial.tsx` | Uitbreiden met workflow, bulk acties, maand filter |

Geen database migraties nodig.

