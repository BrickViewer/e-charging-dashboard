// DENO-TWEELING van apps/admin/src/services/emailTemplates.ts.
// Zelfde patroon als services/faults.ts naast eflux-sync/faults.ts: de frontend heeft de
// bewerkbare kant, hier staat de verzendkant. Wijzig je één van beide, wijzig dan de ander —
// apps/admin/src/services/emailTemplates.test.ts bewaakt dat via een vingerafdruk.
//
// Hier staan bewust ALLEEN de velden die bij het verzenden nodig zijn: sleutel, slots met hun
// standaardtekst, en welke placeholders verplicht zijn. Labels, hints en voorbeeldwaarden zijn
// UI-zaken en staan alleen aan de frontendkant.

export interface DenoTemplateSlot {
  name: string;
  default: string;
}

export interface DenoEmailTemplateDef {
  key: string;
  required: string[];
  slots: DenoTemplateSlot[];
}

export const EMAIL_TEMPLATES: DenoEmailTemplateDef[] = [
  {
    key: "klant-portaaluitnodiging",
    // Leeg: de activatielink staat structureel in de HTML (knop + vervalzin) en kan dus niet
    // door een tekstwijziging verdwijnen. Validatie is hier niet nodig.
    required: [],
    slots: [
      { name: "onderwerp_standaard", default: "Activeer uw E-Charging klantportaal" },
      { name: "onderwerp_installatie", default: "Maak alvast uw E-Charging account aan" },
      { name: "aanhef", default: "Beste {{contactnaam}}," },
      {
        name: "intro_zakelijk",
        default:
          "Voor {{bedrijfsnaam}} is het E-Charging klantportaal voorbereid. Via dit portaal ziet u live sessies, geleverde kWh en de definitieve maandafrekeningen zodra E-Charging deze heeft goedgekeurd.",
      },
      {
        name: "intro_particulier",
        default:
          "Uw E-Charging klantportaal staat klaar. Via dit portaal ziet u live sessies, geleverde kWh en de definitieve maandafrekeningen zodra E-Charging deze heeft goedgekeurd.",
      },
      {
        name: "intro_installatie",
        default:
          "Uw offerte is getekend — u kunt nu alvast uw E-Charging account aanmaken. Zodra wij uw laadpalen hebben geplaatst en gekoppeld, ziet u meteen live sessies, geleverde kWh en uw maandafrekeningen in het portaal.",
      },
      { name: "knoptekst", default: "Account activeren" },
      { name: "stappen_titel", default: "Na activatie" },
      { name: "stap1", default: "1. U kiest een wachtwoord en activeert het account." },
      { name: "stap2", default: "2. U vult contact-, factuur- en bankgegevens aan in het portaal." },
      { name: "stap3_beheer", default: "3. E-Charging koppelt de juiste locaties aan uw klantprofiel." },
      {
        name: "stap3_installatie",
        default: "3. Wij plaatsen en koppelen binnenkort uw laadpalen; daarna staat alles live in uw portaal.",
      },
      { name: "voettekst", default: "Vragen? Mail naar info@e-charging.nl." },
    ],
  },
  {
    key: "klant-bericht",
    required: [],
    slots: [
      { name: "label", default: "Bericht" },
      { name: "aanhef", default: "Beste {{aanspreeknaam}}," },
      { name: "knoptekst", default: "Bekijk in je portaal" },
      { name: "afsluiting", default: "Met vriendelijke groet," },
      { name: "naschrift", default: "Je kunt op deze e-mail reageren; je bericht komt dan bij ons team binnen." },
    ],
  },
  {
    key: "taak-toegewezen",
    required: [],
    slots: [
      { name: "onderwerp", default: "Nieuwe taak voor jou: {{taak}}" },
      { name: "aanhef", default: "Hoi {{naam}}," },
      { name: "intro", default: "Er is een taak aan je toegewezen:" },
      { name: "knoptekst", default: "Bekijk je taken" },
      { name: "afsluiting", default: "Groet, E-Charging" },
    ],
  },
  {
    key: "ere-aangevraagd",
    required: [],
    slots: [
      { name: "onderwerp", default: "ERE aangevraagd: {{klantnaam}}" },
      { name: "intro", default: "wil ERE-certificaten aanmelden (aangevinkt in het klantportaal)." },
      { name: "oproep", default: "Neem contact op om de ERE's voor deze klant aan te melden." },
      { name: "knoptekst", default: "Klant openen" },
      { name: "voettekst", default: "Automatisch verstuurd door het E-Charging dashboard." },
    ],
  },
  {
    key: "storing-gedetecteerd",
    required: [],
    slots: [
      { name: "onderwerp_enkel", default: "Storing gedetecteerd: {{locatie}}" },
      { name: "onderwerp_bundel", default: "Storing: {{aantal}} laadpunten op {{locatie}}" },
      { name: "label", default: "Storing gedetecteerd" },
      { name: "kop_enkel", default: "Een laadpunt heeft een storing" },
      { name: "kop_bundel", default: "{{aantal}} laadpunten op {{locatie}} hebben een storing" },
      { name: "intro", default: "Onze monitoring detecteerde dit automatisch. Acteer hierop voordat de klant het merkt: bel e-Flux, en neem zo nodig contact op met de locatie." },
      { name: "knoptekst_storing", default: "Open storing" },
      { name: "knoptekst_overzicht", default: "Open het storingenoverzicht" },
      { name: "voettekst", default: "Deze melding is automatisch verstuurd door het E-Charging dashboard." },
    ],
  },
  {
    key: "team-uitnodiging",
    required: [],
    slots: [
      { name: "onderwerp_nieuw", default: "Uitnodiging — E-Charging beheer-portaal" },
      { name: "onderwerp_opnieuw", default: "Je toegang tot het E-Charging beheer-portaal" },
      { name: "kop", default: "Je bent uitgenodigd voor het beheer-portaal" },
      { name: "aanhef", default: "Hoi {{naam}}," },
      { name: "intro", default: "Je hebt toegang gekregen tot het E-Charging beheer-portaal met de rol {{rol}}. Activeer je account en stel een wachtwoord in:" },
      { name: "knoptekst", default: "Account activeren" },
      { name: "naschrift", default: "Heb je deze uitnodiging niet verwacht? Negeer deze e-mail dan." },
    ],
  },
];

export const TEMPLATES_BY_KEY: Record<string, DenoEmailTemplateDef> = Object.fromEntries(
  EMAIL_TEMPLATES.map((t) => [t.key, t]),
);

/** Vingerafdruk van het register; de frontend-tweeling moet dezelfde opleveren.
 *  Bewaakt door apps/admin/src/services/emailTemplates.test.ts. */
export function templateFingerprint(): string {
  return EMAIL_TEMPLATES.map((t) =>
    [t.key, t.required.join("|"), t.slots.map((s) => `${s.name}=${s.default.length}`).join("|")].join("::"),
  ).join("\n");
}
