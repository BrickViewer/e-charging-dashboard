# Prompt voor de E-Group portal (frontend-tagging)

> Kopieer alles hieronder naar de E-Group portal-agent / developer. De **backend
> is al volledig gebouwd en getest** (kolommen, enum-waarde, intake-edge-function,
> completion-trigger, secrets). Er hoeft alleen nog frontend-werk te gebeuren om de
> opdrachten duidelijk te taggen en filterbaar te maken.

---

## Context

Het E-Charging dashboard zet getekende installatie-opdrachten naar ons portaal via
de edge function `intake-external-order`. Die maakt automatisch een organisatie,
project en **order** aan in onze database. De backend-koppeling werkt al; deze opdracht
gaat puur over hoe we deze opdrachten **in de Opdrachten-weergave tonen en filteren**.

## Wat er al in de database staat (niets aan wijzigen)

Op `public.orders` bestaan nu deze velden, gevuld door de intake:
- `service_category` (enum) — de business line: `e_check`, `e_charging`, `e_make`, `e_maintenance`. Voor E-Charging-opdrachten is dit altijd `e_charging`.
- `source` (enum) — voor extern aangeleverde opdrachten: `e_charging_dashboard` (nieuwe waarde, naast `offer`/`manual`/`storing`).
- `external_system` (text) — `'e-charging'` voor opdrachten uit het E-Charging dashboard (NULL voor handmatige).
- `external_reference` (text) — referentie van het bronsysteem (uniek).
- `external_callback_url` (text) — interne callback-URL (niet tonen).

Statusterugkoppeling gebeurt automatisch: elke wijziging van `orders.status` van een
order met `external_system='e-charging'` stuurt via een database-trigger (`pg_net`) een
bericht terug naar E-Charging. **Daar hoeft de frontend niets voor te doen** — gewoon de
status op de gebruikelijke manier laten wijzigen via de bestaande werkbon/opdracht-flow.

## Te bouwen in de Opdrachten-weergave (frontend)

1. **Categorie-badge per opdracht**: toon `service_category` als een duidelijke gekleurde
   badge met label:
   - `e_check` → "E-Check"
   - `e_charging` → "E-Charging"
   - `e_make` → "E-Make"
   - `e_maintenance` → "E-Maintenance"
   Gebruik per categorie een eigen, consistente kleur (zelfde kleuren overal).

2. **Filter op categorie**: een filter/segment in de Opdrachten-lijst waarmee je kunt
   filteren op `service_category` (alles / E-Check / E-Charging / E-Make / E-Maintenance).

3. **Externe-bron-markering**: voor opdrachten met `external_system = 'e-charging'` een
   herkenbare markering, bv. een chip **"E-Charging (extern)"** of een klein icoon naast
   het opdrachtnummer, zodat het team direct ziet dat deze opdracht automatisch is
   binnengekomen vanuit het E-Charging dashboard. Toon eventueel `external_reference` of
   het offertenummer in de detailweergave.

4. **(Optioneel) filter op bron**: kunnen filteren op "alleen extern aangeleverd"
   (`external_system is not null`) is handig voor het verwerken van binnengekomen opdrachten.

## Belangrijk

- Wijzig de bestaande **status-lifecycle niet** (`bevestigd → te_plannen → ingepland →
  in_uitvoering → gereed → afgerond`). De terugkoppeling naar E-Charging hangt aan
  statuswijzigingen en werkt al automatisch.
- Raak de kolommen `external_*` en de trigger/intake-functie niet aan.
- Houd de styling consistent met de rest van het portaal.

## Verwacht resultaat

In de Opdrachten-lijst is per opdracht direct zichtbaar (a) om welke business line het
gaat via een gekleurde badge, en (b) of de opdracht extern (vanuit E-Charging) is
binnengekomen. De lijst is filterbaar op categorie. Zodra een E-Charging-opdracht op
`gereed`/`afgerond` wordt gezet, ziet het E-Charging dashboard dat automatisch.
