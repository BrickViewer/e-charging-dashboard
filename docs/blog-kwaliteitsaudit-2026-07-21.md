# Blog-kwaliteitsaudit — 21 juli 2026

Vervolg op de businessmodel-audit van dezelfde dag. Alle 14 gepubliceerde blogs + 1 concept zijn per blog door een eigen auditor gelezen (content, FAQ, excerpt, SEO-velden) en elke bevinding is onafhankelijk getoetst vóór toepassing. Focus: het "In het kort"-blok (de website rendert alleen één <p> die met het label begint als groene callout — 8 blogs hadden een leeg label met losse bullets eronder), HTML-hygiëne, taalfouten, links en metadata. Alle correcties zijn per direct live; her-indexering aangevraagd via IndexNow.


## ERE-certificaten uitgelegd: zo kunt u verdienen aan geleverde kilowatturen
`ere-certificaten-uitgelegd` — 2 correcties (gepubliceerd)

**[hoog] content** — Het "In het kort"-blok heeft de foute vorm: een <p> met alleen het label gevolgd door een losse <ul>. De website rendert alleen de eerste <p> die met "In het kort:" begint als groene callout; de complete bulletlijst valt daardoor buiten de callout.

- Vóór: “<p><strong>In het kort:</strong></p><ul><li>ERE staat voor Emissiereductie-eenheid en is per 1 januari 2026 de opvolger van het HBE-systeem (Nederlandse Emissieautoriteit, NEa, 2025).</li><li>Wie elektrisch laadt levert een CO2-besparing, die als certificaat verkocht kan worden aan brandstofleveranciers met een compensatieplicht.</li><li>Een MID-gecertificeerde meter is een harde voorwaarde: zonde…”
- Na: “<p><strong>In het kort:</strong> ERE staat voor Emissiereductie-eenheid en is per 1 januari 2026 de opvolger van het HBE-systeem (Nederlandse Emissieautoriteit, NEa, 2025). Wie elektrisch laadt levert een CO2-besparing die als certificaat verkocht kan worden aan brandstofleveranciers met een compensatieplicht. Een MID-gecertificeerde meter is daarbij een harde voorwaarde, en voor de meeste laadpaa…”

**[laag] meta_variants** — Getalsincongruentie: het meervoudige onderwerp "ERE-certificaten" wordt gevolgd door het enkelvoudige "wat het is / hoe het werkt / wat het oplevert".

- Vóór: “ERE-certificaten: wat het is, hoe het werkt en wat het oplevert”
- Na: “ERE-certificaten: wat ze zijn, hoe ze werken en wat ze opleveren”


## Wat levert een laadpaal op? Een compleet overzicht
`wat-levert-een-laadpaal-op` — 3 correcties (gepubliceerd)

**[hoog] content** — Het "In het kort"-blok staat als <h2> met een losse <ul> in plaats van één <p><strong>In het kort:</strong> ...</p> met lopende zinnen; hierdoor rendert de website de groene callout niet en valt de lijst buiten het blok.

- Vóór: “<h2>In het kort</h2><ul><li>Een laadpaal levert vastgoedeigenaren op meerdere manieren op: via laadmarge, ERE-certificaten, netdiensten en een hogere vastgoedwaarde.</li><li>De laadmarge, het verschil tussen inkoop- en verkoopprijs van elektriciteit, is doorgaans de meest directe opbrengstbron.</li><li>Sinds 1 januari 2026 genereren MID-gecertificeerde laadpalen ERE-certificaten, die brandstofleve…”
- Na: “<p><strong>In het kort:</strong> Een laadpaal levert vastgoedeigenaren op meerdere manieren op: via laadmarge, ERE-certificaten, netdiensten en een hogere vastgoedwaarde. De laadmarge, het verschil tussen inkoop- en verkoopprijs van elektriciteit, is doorgaans de meest directe opbrengstbron. Sinds 1 januari 2026 genereren MID-gecertificeerde laadpalen daarnaast ERE-certificaten, die brandstoflever…”

**[laag] content** — Kilowattuur is een het-woord (het uur, het kilowattuur); "Elke kilowattuur die" is een lidwoord-/congruentiefout.

- Vóór: “Elke kilowattuur die via een MID-gecertificeerde laadpaal wordt geleverd, komt hiervoor in aanmerking.”
- Na: “Elk kilowattuur dat via een MID-gecertificeerde laadpaal wordt geleverd, komt hiervoor in aanmerking.”

**[laag] content** — Zelfde congruentiefout: kilowattuur is onzijdig, dus "elke geleverde kilowattuur" moet "elk geleverd kilowattuur" zijn.

- Vóór: “Dit betekent dat elke geleverde kilowattuur via een gecertificeerde laadpaal een extra, structurele inkomstenbron kan vormen naast de laadmarge.”
- Na: “Dit betekent dat elk geleverd kilowattuur via een gecertificeerde laadpaal een extra, structurele inkomstenbron kan vormen naast de laadmarge.”


## Laadinfrastructuur voor kantoorpanden: de complete gids
`laadinfrastructuur-kantoorpanden` — 2 correcties (gepubliceerd)

**[hoog] content** — Het "In het kort"-blok heeft de foute vorm: een <p> met alleen het label gevolgd door een losse <ul>. De website rendert alleen de eerste <p> die met "In het kort:" begint als groene callout; de bullets vallen daarbuiten. Bovendien bevat de laatste bullet een grammaticale fout ("bepaalt ... meer over gebruikerstevredenheid").

- Vóór: “<p><strong>In het kort:</strong></p><ul><li>Laadinfrastructuur bij kantoorpanden omvat laadpalen, bekabeling, meterkastaanpassingen en beheersoftware waarmee medewerkers en bezoekers een elektrische auto kunnen opladen.</li><li>Het aantal laadpunten dat een pand aankan, hangt vooral af van de beschikbare netaansluiting en het gebruik van load balancing.</li><li>Voor nieuwe kantoorgebouwen met meer…”
- Na: “<p><strong>In het kort:</strong> Laadinfrastructuur bij kantoorpanden omvat laadpalen, bekabeling, meterkastaanpassingen en beheersoftware waarmee medewerkers en bezoekers een elektrische auto kunnen opladen. Hoeveel laadpunten een pand aankan, hangt vooral af van de beschikbare netaansluiting en het gebruik van load balancing. Voor nieuwe kantoorgebouwen met meer dan tien parkeerplaatsen geldt si…”

**[laag] content** — Twee taalfouten in één zin: "voldoende" staat er dubbel in ("ruim voldoende om de accu voldoende bij te vullen") en het werkwoord "staan" hoort niet bij het onderwerp "medewerkers" (auto's staan geparkeerd, medewerkers zíjn op kantoor).

- Vóór: “maar voor medewerkers die een groot deel van de dag op kantoor staan is dat doorgaans ruim voldoende om de accu voldoende bij te vullen voor de rit naar huis”
- Na: “maar voor medewerkers die een groot deel van de dag op kantoor zijn is dat doorgaans ruim voldoende om de accu bij te vullen voor de rit naar huis”


## MID-gecertificeerde laadpalen: waarom het verschil maakt
`mid-gecertificeerde-laadpalen` — 2 correcties (gepubliceerd)

**[hoog] content** — Het "In het kort"-blok heeft de foute vorm: een <p> met alleen het label gevolgd door een losse <ul>. De website rendert alleen de eerste <p> die met "In het kort:" begint als groene callout; de vijf bullets vallen daardoor buiten de callout en het blok oogt kapot.

- Vóór: “<p><strong>In het kort:</strong></p><ul><li>MID staat voor Measuring Instruments Directive (2014/32/EU) en stelt Europese eisen aan meetinstrumenten die worden gebruikt voor facturatie.</li><li>Een MID-gecertificeerde laadpaal heeft een geijkte kWh-meter waarvan de meetwaarden juridisch bindend zijn.</li><li>Zonder MID-meter kunt u geen ERE-certificaten aanvragen bij de Nederlandse Emissieautorite…”
- Na: “<p><strong>In het kort:</strong> MID staat voor Measuring Instruments Directive (2014/32/EU) en stelt Europese eisen aan meetinstrumenten die worden gebruikt voor facturatie. Een MID-gecertificeerde laadpaal heeft een geijkte kWh-meter waarvan de meetwaarden juridisch bindend zijn; zonder zo'n meter kunt u geen ERE-certificaten aanvragen bij de Nederlandse Emissieautoriteit (NEa). Niet elke laadpa…”

**[middel] content** — Em-dash (—) in de lopende tekst; de huisstijl verbiedt em-dashes.

- Vóór: “zonder handmatige correcties achteraf — en is de meetdata direct bruikbaar”
- Na: “zonder handmatige correcties achteraf, en is de meetdata direct bruikbaar”


## RED III en de Brandstoftransitieverplichting: wat verandert er?
`red-iii-brandstoftransitieverplichting` — 1 correcties (gepubliceerd)

**[hoog] content** — Het "In het kort"-blok heeft de foute vorm: een <p> met alleen het label gevolgd door een losse <ul>. De website rendert alleen de label-<p> als groene callout; de bulletlijst valt daarbuiten. Vereist is één <p><strong>In het kort:</strong> ...</p> met 2-4 lopende zinnen.

- Vóór: “<p><strong>In het kort:</strong></p><ul><li>RED III (Richtlijn 2023/2413) verplicht EU-lidstaten om het aandeel hernieuwbare energie in transport te verhogen naar minimaal 29% in 2030 (Europese Unie, 2023).</li><li>Nederland vertaalt deze richtlijn naar de Brandstoftransitieverplichting (BTV), die de eerdere Jaarverplichting Energie Vervoer vervangt.</li><li>Brandstofleveranciers moeten hun portfo…”
- Na: “<p><strong>In het kort:</strong> RED III (Richtlijn 2023/2413) verplicht EU-lidstaten om het aandeel hernieuwbare energie in transport te verhogen naar minimaal 29% in 2030 (Europese Unie, 2023). Nederland vertaalt deze richtlijn naar de Brandstoftransitieverplichting (BTV), die de eerdere Jaarverplichting Energie Vervoer vervangt. De focus verschuift daarbij van de hoeveelheid hernieuwbare energi…”


## AC vs DC laden: wat is het verschil en wat past bij uw locatie?
`ac-vs-dc-laden` — 2 correcties (gepubliceerd)

**[hoog] content** — Het "In het kort"-blok heeft de foute vorm: een <p> met alleen het label gevolgd door een losse <ul>. De website rendert alleen de eerste <p> die met "In het kort:" begint als groene callout; de complete bulletlijst valt daardoor buiten de callout en de callout zelf is leeg op het label na.

- Vóór: “<p><strong>In het kort:</strong></p><ul><li>AC laden gebruikt de omvormer in de auto, DC laden gebruikt een externe omvormer in de laadpaal zelf.</li><li>AC is geschikt voor langere sta-tijden (thuis, kantoor, VvE-parkeergarage), DC voor korte stops met hoge doorloop.</li><li>DC-laadpalen zijn aanzienlijk duurder in aanschaf en vragen vrijwel altijd een netverzwaring.</li><li>Voor de meeste vastgo…”
- Na: “<p><strong>In het kort:</strong> Bij AC laden zet de auto zelf de stroom om via de ingebouwde omvormer, bij DC laden doet een externe omvormer in de laadpaal dat. AC past bij locaties waar voertuigen langere tijd stilstaan, zoals kantoren en VvE-parkeergarages; DC is bedoeld voor korte stops met hoge doorloop, maar is aanzienlijk duurder in aanschaf en vraagt vrijwel altijd een netverzwaring. Voor…”

**[laag] content** — De afsluitende CTA-link staat als los inline <a>-element op rootniveau van de content, buiten een <p>. Dit is een los blokelement zonder alinea-omhulsel en kan afwijkend renderen ten opzichte van de rest van de bodytekst.

- Vóór: “<a href="/contact" rel="noopener noreferrer">Neem contact op</a>”
- Na: “<p><a href="/contact" rel="noopener noreferrer">Neem contact op</a></p>”


## Laadpalen voor VvE's: mogelijkheden en aandachtspunten
`laadpalen-vve` — 1 correcties (gepubliceerd)

**[hoog] content** — Het "In het kort"-blok heeft de foute vorm: een <p> met alleen het label gevolgd door een losse <ul>. De website rendert alleen de label-alinea als groene callout; de bullets vallen erbuiten. Vereist is één <p> met 2-4 lopende zinnen.

- Vóór: “<p><strong>In het kort:</strong></p><ul><li>Voor een laadpunt is nu nog toestemming van de VvE-ledenvergadering nodig; een wetsvoorstel (de notificatieregeling) vervangt die naar verwachting eind 2026 of begin 2027 door een melding aan het bestuur.</li><li>Een collectieve laadoplossing met slim laden (load balancing) voorkomt overbelasting van de netaansluiting en wildgroei aan losse kabels.</li><…”
- Na: “<p><strong>In het kort:</strong> Voor een laadpunt is nu nog toestemming van de VvE-ledenvergadering nodig; een wetsvoorstel (de notificatieregeling) vervangt die naar verwachting eind 2026 of begin 2027 door een melding aan het bestuur. Een collectieve laadoplossing met slim laden (load balancing) voorkomt overbelasting van de netaansluiting en wildgroei aan losse kabels. Een laadpuntbesluit vraa…”


## Laadinfrastructuur en de VvE: wat de Outlook Mobiliteit 2026 betekent voor uw parkeergarage
`laadinfrastructuur-en-de-vve-wat-de-outlook-mobiliteit-betekent-voor-uw-parkeergarage` — 1 correcties (gepubliceerd)

**[laag] content** — Congruentiefout: het samengestelde onderwerp 'de verwachte ontwikkeling ... en de impact ...' vraagt een meervoudige persoonsvorm ('zijn gebracht' in plaats van 'is gebracht').

- Vóór: “waarin de verwachte ontwikkeling van elektrische mobiliteit en de impact op laadinfrastructuur en het stroomnet in kaart is gebracht”
- Na: “waarin de verwachte ontwikkeling van elektrische mobiliteit en de impact op laadinfrastructuur en het stroomnet in kaart zijn gebracht”


## Netcongestie in Nederland: wat het is, gevolgen voor laadinfrastructuur en het ACM-prioriteringskader in 2026
`netcongestie-in-nederland-wat-het-is-wat-er-per-2026-verandert-en-wat-het-betekent-voor-vastgoed-en-laadpalen` — 2 correcties (gepubliceerd)

**[laag] content** — Verkeerde adjectiefverbuiging: 'load balancing' is als leenwoord op -ing een de-woord, dus het bijvoeglijk naamwoord krijgt een buigings-e ('dynamische'). Elders in het artikel staat wel correct 'dynamische lastverdeling'.

- Vóór: “bijvoorbeeld met dynamisch load balancing”
- Na: “bijvoorbeeld met dynamische load balancing”

**[laag] content** — Zelfde verbuigingsfout als hierboven: 'dynamisch load balancing' moet 'dynamische load balancing' zijn ('load balancing' is een de-woord).

- Vóór: “<strong>Zet in op dynamisch load balancing</strong>”
- Na: “<strong>Zet in op dynamische load balancing</strong>”


## Laadpaal subsidie 2026: wat kunnen bedrijven, VvE's en vastgoedeigenaren nog aanvragen?
`laadpaal-subsidie-2026-wat-kunnen-bedrijven-vve-s-en-vastgoedeigenaren-nog-aanvragen` — 3 correcties (gepubliceerd)

**[laag] content** — Losgeschreven samenstelling (spelfout): 'laadpaal subsidies' moet aaneen; de intro en excerpt schrijven zelf al correct 'laadpaalsubsidie', waardoor de tekst bovendien inconsistent is.

- Vóór: “<h2>Welke laadpaal subsidies bestaan er in 2026?</h2>”
- Na: “<h2>Welke laadpaalsubsidies bestaan er in 2026?</h2>”

**[laag] content** — Losgeschreven samenstelling (spelfout): 'laadpaal subsidie' moet aaneen, in lijn met 'laadpaalsubsidie' elders in dezelfde alinea en in de excerpt.

- Vóór: “Een laadpaal subsidie is een financiële bijdrage van de overheid, een gemeente of provincie in de aanschaf-, advies- of installatiekosten van laadinfrastructuur voor elektrische voertuigen.”
- Na: “Een laadpaalsubsidie is een financiële bijdrage van de overheid, een gemeente of provincie in de aanschaf-, advies- of installatiekosten van laadinfrastructuur voor elektrische voertuigen.”

**[laag] faq** — Losgeschreven samenstelling (spelfout) in de FAQ-vraag: 'laadpaal subsidie' moet aaneen.

- Vóór: “Is ERE een alternatief voor laadpaal subsidie thuis?”
- Na: “Is ERE een alternatief voor laadpaalsubsidie thuis?”


## Netcongestie kosten: wat betaalt u in 2026 en hoe beperkt u de schade bij laadinfrastructuur?
`netcongestie-kosten-wat-betaalt-u-in-2026-en-hoe-beperkt-u-de-schade-bij-laadinfrastructuur` — 1 correcties (gepubliceerd)

**[middel] excerpt** — De excerpt is midden in een zin afgekapt en eindigt op een hangend beletselteken, waardoor de samenvatting onafgerond oogt in overzichten en previews.

- Vóór: “Vanaf 1 juli 2026 verandert de wachtlijstregeling ook voor kleinverbruikers, wat…”
- Na: “Vanaf 1 juli 2026 verandert de wachtlijstregeling ook voor kleinverbruikers, wat de urgentie voor vastgoedeigenaren vergroot.”


## Laadpalen voor VvE's in 2026: regels, techniek en aanpak op een rij
`laadpalen-voor-vve-s-in-2026-regels-techniek-en-aanpak-op-een-rij` — 1 correcties (gepubliceerd)

**[laag] excerpt** — Pleonasme: een wetsvoorstel is per definitie een voorstel, dus "voorgesteld wetsvoorstel" is dubbelop.

- Vóór: “een voorgesteld wetsvoorstel voor eenvoudigere besluitvorming”
- Na: “een wetsvoorstel voor eenvoudigere besluitvorming”


## Laadpaal bij woningcorporaties: van losse projecten naar een herhaalbare aanpak
`laadpaal-bij-woningcorporaties-van-losse-projecten-naar-een-herhaalbare-aanpak` — 1 correcties (gepubliceerd)

**[middel] excerpt** — Het excerpt eindigt midden in een zin met een hangend beletselteken; de slotzin is afgekapt na "per…".

- Vóór: “sneller en goedkoper dan losse projecten per…”
- Na: “sneller en goedkoper dan losse projecten per gebouw.”


## Laadpaal verplicht? Deze EPBD IV-regels gelden voor uw gebouw of parkeergarage
`laadpaal-verplicht-deze-epbd-iv-regels-gelden-voor-uw-gebouw-of-parkeergarage` — 1 correcties (concept)

**[hoog] content** — Het "In het kort"-blok heeft de foute vorm: een <p> met alleen het label gevolgd door een losse <ul>. De website rendert alleen de eerste <p> als groene callout, waardoor alle bullets buiten de callout vallen. Vereist is één <p><strong>In het kort:</strong> ...</p> met 2-4 lopende zinnen.

- Vóór: “<p><strong>In het kort:</strong></p><ul><li>Sinds 29 mei 2026 gelden via EPBD IV nieuwe laadpaal-verplichtingen in het Besluit bouwwerken leefomgeving (Bbl).</li><li>Nieuwbouw woongebouw met meer dan 3 parkeerplaatsen: minimaal 1 werkend laadpunt, voorbekabeling voor de helft van de plaatsen, leidingdoorvoer voor de rest.</li><li>Ingrijpende renovatie van een woongebouw: voorbekabeling voor alle p…”
- Na: “<p><strong>In het kort:</strong> Sinds 29 mei 2026 gelden via EPBD IV nieuwe laadpaal-verplichtingen in het Besluit bouwwerken leefomgeving (Bbl). Nieuwbouw van een woongebouw met meer dan 3 parkeerplaatsen vraagt minimaal 1 werkend laadpunt, voorbekabeling voor de helft van de plaatsen en leidingdoorvoer voor de rest; bij een ingrijpende renovatie is voorbekabeling voor alle parkeerplaatsen verpl…”


---
Totaal: 23 correcties over 14 blogs (1 blog zonder bevindingen). Eindcontrole: 0 posts met een leeg In-het-kort-label of h2-variant; alle 15 posts beginnen met de juiste callout-vorm; 0 em-dashes in content; het enige resterende afgekapte excerpt hoort bij een gearchiveerde (niet-publieke) post. Preventie: de In-het-kort-vorm is als verplichte regel opgenomen in de schrijf-, herschrijf- en keuringsprompts (edges content-autoblog v34, content-revise v20, recording-to-blog v11).
