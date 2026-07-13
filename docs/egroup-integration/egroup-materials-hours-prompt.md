# Prompt: materialen + uren tonen in de e-portal (E-Charging-opdrachten)

Plak-klare prompt voor de e-portal-codebase (frontend). De backend is al volledig
gebouwd en live: de data staat in de database en de werkbon-voorvulling gebeurt
automatisch via DB-triggers. Dit document dekt uitsluitend **weergave**.

## Wat er al automatisch werkt (NIET bouwen)

- E-Charging stuurt per opdracht (`orders.source = 'e_charging_dashboard'`) de
  volledige materialenlijst naar de tabel **`public.order_materials`**
  (kolommen: `order_id, position, quantity, unit, article_number, description,
  supplier, status`; status = `niet_nodig | te_bestellen | besteld | binnen`).
  De lijst wordt bij elke wijziging in E-Charging volledig ververst.
- `order_lines.estimated_hours` wordt gevuld met de montage-uren uit de
  E-Charging-calculatie (alleen-als-leeg: een handmatige correctie van de
  planner blijft staan).
- Bij het aanmaken van een werkbon ("+ Werkbon") op een E-Charging-opdracht
  vullen DB-triggers automatisch `work_orders.notes` + `performed_work` (uit de
  opdrachtomschrijving, alleen-als-leeg) en kopiëren ze de materialen naar
  **`public.work_order_materials`** (kolommen: `work_order_id, quantity, unit,
  article_number, description, position`; regels met status `niet_nodig` blijven
  weg van de werkbon).
- RLS staat lezen al toe: `order_materials` volgt het patroon van de opdracht
  (admin of toegewezen gebruiker).

## Prompt voor de e-portal-app

```
Toon materialen en geschatte uren bij opdrachten en werkbonnen. Alles is read-only
weergave; de data wordt extern (E-Charging) beheerd en automatisch gesynct.

1. Opdracht-detail: toon een sectie "Materialen" met de rijen uit
   public.order_materials voor deze opdracht, gesorteerd op position:
   - per regel: aantal × omschrijving (bv. "3× Zaptec GO 2"), artikelnummer
     (article_number) en leverancier (supplier) als die er zijn, en een
     status-badge: niet_nodig (grijs), te_bestellen (oranje), besteld (blauw),
     binnen (groen).
   - Toon de sectie alleen als er rijen zijn (alleen E-Charging-opdrachten
     hebben deze lijst).
2. Opdracht-detail + planningsweergave: toon order_lines.estimated_hours als
   "Geschatte uren" waar de planner de opdracht inplant (als dat veld nog niet
   zichtbaar is). Dit veld blijft handmatig aanpasbaar zoals nu.
3. Werkbon-detail + werkbon-PDF: toon de materialen uit
   public.work_order_materials (sorteer op position, dan created_at) als de
   werkbon er heeft: aantal × omschrijving + artikelnummer. De monteur moet
   regels kunnen aanvinken/aanvullen zoals bij handmatig toegevoegde materialen.
4. Wijzig NIETS aan de intake-/sync-edge-functions, de external_*-kolommen, de
   DB-triggers op work_orders of de tabel order_materials zelf; dit is puur
   weergave. Eigen (niet-E-Charging) opdrachten houden hun bestaande flow —
   die hebben simpelweg geen order_materials-rijen.

Let op: een opdracht kan meerdere werkbonnen krijgen; elke nieuwe werkbon krijgt
automatisch de volledige actuele materialenlijst mee (bewust).
```

## Contract-referentie

Zie `README.md` (Contract 1 v2: `order_lines[].estimated_hours` + `planning`;
Contract 3 v2: `materials[]` + `estimated_hours`) en de referentiekopie
`sync-material-status.ts`.
