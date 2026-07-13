# Prompts voor de E-Group e-portal (werkbon-app)

> Twee kant-en-klare prompts om te plakken in de **e-portal-VS-Code / agent** (de E-Group portal- en
> werkbon-app — een aparte codebase, niet deze repo). De data komt al correct binnen vanuit het
> E-Charging-dashboard; deze prompts gaan puur over **weergave + voorvullen** in de e-portal.

> ⚠️ **Scope:** het voorvullen (Prompt 2) geldt **alleen voor opdrachten die via E-Charging binnenkomen**
> (`orders.source = 'e_charging_dashboard'` / `orders.external_system = 'e-charging'`). **Eigen
> e-portal-opdrachten** (handmatig/`source <> 'e_charging_dashboard'`) houden hun **bestaande flow** en
> worden niet aangeraakt. Prompt 1 (witregels) is generieke weergave en mag overal gelden — dat verandert
> alleen hoe meerregelige tekst getoond wordt, niet het gedrag van eigen opdrachten.

## Datamodel (ter referentie — niets aan wijzigen)
- `orders.notes` = volledige opdrachtomschrijving ("Levering en installatie"-scope), mét witregels (`\n\n`).
- `orders.description` = korte samenvatting (bv. "5 laadpunten").
- `order_lines.work_description` = de werkregel (bv. "Levering & installatie — 5 laadpunten").
- `work_orders` = de **werkbon**, gekoppeld via `order_id` + `order_line_id` (+ `project_id`). Velden:
  `notes` (omschrijving/notitie), `performed_work` (uitgevoerde werkzaamheden), `report_notes`,
  `status`, `werkbon_pdf_path`.

---

## Prompt 1 — Meerregelige tekst mét witregels tonen

```
In de E-Group portal/werkbon-app worden meerregelige tekstvelden (o.a. orders.notes, orders.description,
work_orders.notes, work_orders.performed_work) nu als één lange lap getoond: de regelafbrekingen en
witregels (\n en lege regels) verdwijnen door HTML whitespace-collapsing.

Pas de WEERGAVE aan zodat deze velden mét regelafbrekingen en witregels worden getoond, overal waar ze
zichtbaar zijn (opdracht-detail, werkbon-detail én de werkbon-PDF/rapport). Gebruik white-space: pre-wrap
op het tonende element, bv. <p className="whitespace-pre-wrap">{value}</p>, of render per regel via
value.split('\n').

De data komt al correct binnen mét witregels — dit is puur weergave. Wijzig niets aan de intake-functie
of aan de data.
```

---

## Prompt 2 — Werkbon: omschrijving tonen + uitgevoerde werkzaamheden voorvullen

```
In de werkbon-app moet de monteur, voor opdrachten die via E-Charging zijn binnengekomen, de
opdrachtomschrijving uit de offerte zien én alvast voorgevuld krijgen bij "Uitgevoerde werkzaamheden".

SCOPE — BELANGRIJK: dit geldt UITSLUITEND voor E-Charging-opdrachten, d.w.z.
orders.source = 'e_charging_dashboard' (of orders.external_system = 'e-charging'). Eigen e-portal-
opdrachten (handmatig aangemaakt, source <> 'e_charging_dashboard') houden hun BESTAANDE werkbon-flow en
worden NIET voorgevuld of aangepast.

Data: een werkbon (work_orders) is gekoppeld aan een opdracht via order_id (en order_line_id). De
opdrachtomschrijving staat in orders.notes (volledige "Levering en installatie"-scope; terugval op
orders.description of order_lines.work_description).

Gewenst gedrag (alleen wanneer orders.source = 'e_charging_dashboard'):
1. Bij het AANMAKEN van een werkbon (de "+ Werkbon"-actie): vul work_orders.notes (Omschrijving) én
   work_orders.performed_work (Uitgevoerde werkzaamheden) alvast met orders.notes van de gekoppelde
   opdracht — ALLEEN als ze nog leeg zijn (overschrijf nooit wat de monteur al heeft ingevuld).
2. In de werkbon-detail: toon de Omschrijving (de scope; read-only of bewerkbaar) en het bewerkbare veld
   "Uitgevoerde werkzaamheden" (voorgevuld; de monteur kan aanvullen/aanpassen).
3. Neem Omschrijving + Uitgevoerde werkzaamheden ook mee in de werkbon-PDF/rapport.
4. Toon alle bovenstaande tekst mét witregels (white-space: pre-wrap; zie Prompt 1).

Bron-prioriteit voor de voorvul-tekst: orders.notes -> orders.description -> order_lines.work_description.
Raak de intake-edge-function en de external_*-kolommen niet aan; dit is puur werkbon-/frontend-logica.
```

---

## Update 2026-07-13: backend-trigger is geïmplementeerd
Het voorvullen gebeurt inmiddels automatisch in de E-Group-DB (migratie
`order_materials_and_echarging_werkbon_prefill`): `trg_work_orders_echarging_prefill` vult bij het
aanmaken van een werkbon `notes`/`performed_work` (alleen-als-leeg, prioriteit orders.notes ->
orders.description -> order_lines.work_description) en `trg_work_orders_echarging_materials` kopieert de
materialenlijst (`order_materials`, status ≠ niet_nodig) naar `work_order_materials`. Beide strikt
gescoped op `source='e_charging_dashboard'`. **Stap 1 van Prompt 2 (frontend-voorvullen) is daarmee
vervallen** — de weergave-stappen (witregels, werkbon-detail, PDF) blijven frontend-werk, evenals het
tonen van de materialen (zie `egroup-materials-hours-prompt.md`).
