

# Fix Plan: Locatie-koppeling, eFlux-velden & Unlinked Locations

## Fix 1: Database migration

**Migration SQL:**
```sql
ALTER TABLE locations ALTER COLUMN client_id DROP NOT NULL;

CREATE POLICY "Internal users can view unlinked locations" ON locations
  FOR SELECT USING (
    client_id IS NULL AND is_internal(auth.uid())
  );
```

Note: gebruik `is_internal(auth.uid())` in plaats van een directe profiles-query — dat is consistent met de bestaande RLS-patronen en voorkomt recursie.

Bestaande RLS policy "Portal user can view own locations" werkt al correct (filtert op `client_id = get_client_id_for_user()`), dus NULL locaties zijn daar automatisch uitgesloten.

## Fix 2: Locatie koppelen/ontkoppelen UI

**Bestand: `src/pages/admin/AdminClientDetail.tsx`**

In de "locaties" tab (regel 226-280):

1. **"Locatie koppelen" knop** bovenaan de locatielijst → opent een `Dialog` met twee tabs:
   - **Tab "Bestaande locatie"**: `Select` gevuld door `useUnlinkedLocations()`. Bij bevestiging: `supabase.from("locations").update({ client_id: id }).eq("id", selectedId)`. Invalidate queries + toast.
   - **Tab "Nieuwe locatie"**: Formulier (naam, adres, postcode, plaats, type pand select, parkeerplaatsen, EAN, eigen opwek toggle + kWp). Insert met `client_id` van huidige klant.

2. **"Ontkoppelen" knop** per locatie-card (in de CardHeader, naast de naam):
   - `AlertDialog` met bevestigingstekst inclusief locatienaam
   - Bij bevestiging: `update({ client_id: null }).eq("id", loc.id)`
   - Invalidate queries

**Imports toe te voegen:** `Link, Unlink` van lucide-react, `Dialog/DialogContent/...`, `AlertDialog/...`, `Select/SelectContent/...`, `Switch` uit shadcn.

## Fix 3: eFlux ID-velden bewerkbaar

Per locatie-card, onder de bestaande metadata (pandtype, parkeerplaatsen, etc.):

1. **Locatie-niveau**: Inline input voor `eflux_location_id` met save-knop die `updateLocation(loc.id, { eflux_location_id: value })` aanroept.

2. **Laadpunt-tabel**: Extra kolom "e-Flux EVSE ID" met inline input voor `eflux_evse_controller_id`. Bij blur/enter: `updateChargePoint(cp.id, { eflux_evse_controller_id: value })`.

## Fix 4: Hook `useUnlinkedLocations`

**Bestand: `src/hooks/useAdminData.ts`**

Nieuwe export:
```typescript
export function useUnlinkedLocations() {
  return useQuery({
    queryKey: ['unlinked-locations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('locations')
        .select('*')
        .is('client_id', null)
        .order('name');
      if (error) throw error;
      return data;
    }
  });
}
```

### Bestanden die wijzigen

| Bestand | Wijziging |
|---------|-----------|
| Migration (nieuw) | `client_id` nullable + RLS policy |
| `src/hooks/useAdminData.ts` | `useUnlinkedLocations` hook |
| `src/pages/admin/AdminClientDetail.tsx` | Koppel-dialog, ontkoppel-button, eFlux inline edits |

