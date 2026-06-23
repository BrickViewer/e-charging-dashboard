# Prompts voor de E-Group e-portal (werkbon-app)

> Twee kant-en-klare prompts om te plakken in de **e-portal-VS-Code / agent** (de E-Group portal- en
> werkbon-app — een aparte codebase, niet deze repo). De data komt al correct binnen vanuit het
> E-Charging-dashboard; deze prompts gaan puur over **weergave + voorvullen** in de e-portal.

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
In de werkbon-app moet de monteur de opdrachtomschrijving uit de offerte zien én alvast voorgevuld
krijgen bij "Uitgevoerde werkzaamheden".

Data: een werkbon (work_orders) is gekoppeld aan een opdracht via order_id (en order_line_id). De
opdrachtomschrijving staat in orders.notes (volledige "Levering en installatie"-scope; terugval op
orders.description of order_lines.work_description).

Gewenst gedrag:
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

## Alternatief (niet gekozen): backend-trigger
In plaats van de e-portal-app kan het voorvullen ook in de E-Group-DB via een trigger op `work_orders`
(bij insert `notes`/`performed_work` defaulten uit `orders.notes` als ze leeg zijn). Dat werkt automatisch
zonder e-portal-code, maar de witregel-weergave (Prompt 1) blijft hoe dan ook frontend-werk. Op verzoek
alsnog te implementeren.
