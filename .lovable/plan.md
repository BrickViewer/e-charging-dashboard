

## Probleem

De gebruiker `wessel.jonkers@brickviewer.nl` heeft geen record in `user_roles` en is niet gekoppeld aan een client. De AuthContext kan geen rol bepalen en redirected terug naar `/login`.

## Oplossing

Een database migratie die:

1. **Admin-rol toevoegt** voor de bestaande gebruiker:
   ```sql
   INSERT INTO user_roles (user_id, role)
   VALUES ('896f50bf-a634-4609-b153-ce9dd2bc8aad', 'admin');
   ```

2. **Profiel koppelt** aan de E-Charging organisatie:
   ```sql
   UPDATE profiles
   SET organization_id = '00000000-0000-0000-0000-000000000001',
       full_name = 'Wessel Jonkers'
   WHERE user_id = '896f50bf-a634-4609-b153-ce9dd2bc8aad';
   ```

3. **Een demo-client koppelt** aan dezelfde user (optioneel, voor testen van het klantportaal):
   ```sql
   UPDATE clients
   SET portal_user_id = '896f50bf-a634-4609-b153-ce9dd2bc8aad'
   WHERE id = '10000000-0000-0000-0000-000000000001';
   ```
   (Dit zou conflicteren met de admin-rol — beter om een aparte testgebruiker voor het klantportaal te maken.)

## Resultaat na migratie

- Login als `wessel.jonkers@brickviewer.nl` → rol `admin` → redirect naar `/admin`
- Het beheerpaneel laadt met alle demodata

## Aanbeveling

Maak voor het klantportaal een tweede testgebruiker aan in Supabase Auth en koppel die via `portal_user_id` aan een van de demo-clients.

