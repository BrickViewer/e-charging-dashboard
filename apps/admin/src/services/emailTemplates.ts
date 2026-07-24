// REGISTER van instelbare e-mailsjablonen — de gedeelde waarheid voor de editor én de verzendkant.
//
// TWEELING: supabase/functions/_shared/emailTemplates.ts is de Deno-kopie hiervan (zelfde patroon
// als services/faults.ts naast eflux-sync/faults.ts). emailTemplates.test.ts bewaakt dat de sleutels,
// slots en verplichte placeholders van beide bestanden gelijk blijven. Pas je hier iets aan, pas
// het daar dan óók aan.
//
// ONTWERPKEUZE: het HTML-ontwerp per mail blijft in code. Alleen de TEKSTSLOTS zijn instelbaar.
// Daardoor kan de huisstijl niet stukgaan en blijven de afbeeldingen op dashboard.e-charging.nl
// staan — nodig omdat Gmail externe e-mailplaatjes anders als verdacht markeert.

export type TemplateGroup = "klant" | "intern" | "intake";

export interface TemplatePlaceholder {
  /** Naam zonder accolades, bv. "klantnaam" → in de tekst als {{klantnaam}} */
  name: string;
  label: string;
  /** Verplicht = zonder deze placeholder is de mail onbruikbaar; opslaan wordt geweigerd. */
  required?: boolean;
}

export interface TemplateSlot {
  name: string;
  label: string;
  hint?: string;
  multiline?: boolean;
  /** De huidige tekst uit de code. Leeg laten in de editor = deze standaard gebruiken. */
  default: string;
}

export interface EmailTemplateDef {
  key: string;
  label: string;
  description: string;
  group: TemplateGroup;
  /** Afzender-identiteit zoals sendEmail die kent. Informatief in de editor. */
  sender: "info" | "noreply";
  placeholders: TemplatePlaceholder[];
  slots: TemplateSlot[];
  /** Voorbeeldwaarden voor het live voorbeeld en de testmail. */
  sample: Record<string, string>;
}

export const GROUP_LABELS: Record<TemplateGroup, string> = {
  klant: "Klantgericht",
  intern: "Intern",
  intake: "Aanvragen en koppelingen",
};

export const EMAIL_TEMPLATES: EmailTemplateDef[] = [
  {
    key: "klant-portaaluitnodiging",
    label: "Klantuitnodiging portaal",
    description:
      "Naar de klant zodra het portaal klaarstaat. Heeft twee varianten: bij installatie én beheer een begeleidende toon (de palen komen nog), bij alleen beheer de standaardtekst.",
    group: "klant",
    sender: "noreply",
    placeholders: [
      { name: "contactnaam", label: "Naam contactpersoon" },
      { name: "bedrijfsnaam", label: "Bedrijfsnaam" },
      { name: "klantnummer", label: "Klantnummer" },
      // NIET verplicht: de knop en de vervalzin zetten deze link structureel in de HTML. Hij is
      // dus onverwijderbaar, wat sterker is dan een opslagblokkade. Je mág hem daarnaast in een
      // tekst noemen (bv. in de voettekst), vandaar dat hij wel beschikbaar is.
      { name: "uitnodigingslink", label: "Activatielink (staat al automatisch in de knop)" },
      { name: "vervaltermijn", label: "Aantal dagen geldig" },
      { name: "afzender", label: "Naam afzender" },
    ],
    slots: [
      {
        name: "onderwerp_standaard",
        label: "Onderwerp (alleen beheer)",
        default: "Activeer uw E-Charging klantportaal",
      },
      {
        name: "onderwerp_installatie",
        label: "Onderwerp (installatie en beheer)",
        default: "Maak alvast uw E-Charging account aan",
      },
      {
        name: "aanhef",
        label: "Aanhef",
        default: "Beste {{contactnaam}},",
      },
      {
        name: "intro_zakelijk",
        label: "Introductie (zakelijk, alleen beheer)",
        multiline: true,
        default:
          "Voor {{bedrijfsnaam}} is het E-Charging klantportaal voorbereid. Via dit portaal ziet u live sessies, geleverde kWh en de definitieve maandafrekeningen zodra E-Charging deze heeft goedgekeurd.",
      },
      {
        name: "intro_particulier",
        label: "Introductie (particulier, alleen beheer)",
        hint: "Gebruikt wanneer bedrijfsnaam en contactnaam gelijk zijn; anders leest de naam dubbelop.",
        multiline: true,
        default:
          "Uw E-Charging klantportaal staat klaar. Via dit portaal ziet u live sessies, geleverde kWh en de definitieve maandafrekeningen zodra E-Charging deze heeft goedgekeurd.",
      },
      {
        name: "intro_installatie",
        label: "Introductie (installatie en beheer)",
        multiline: true,
        default:
          "Uw offerte is getekend — u kunt nu alvast uw E-Charging account aanmaken. Zodra wij uw laadpalen hebben geplaatst en gekoppeld, ziet u meteen live sessies, geleverde kWh en uw maandafrekeningen in het portaal.",
      },
      { name: "knoptekst", label: "Tekst op de knop", default: "Account activeren" },
      { name: "stappen_titel", label: "Kop boven de stappen", default: "Na activatie" },
      { name: "stap1", label: "Stap 1", default: "1. U kiest een wachtwoord en activeert het account." },
      { name: "stap2", label: "Stap 2", default: "2. U vult contact-, factuur- en bankgegevens aan in het portaal." },
      {
        name: "stap3_beheer",
        label: "Stap 3 (alleen beheer)",
        default: "3. E-Charging koppelt de juiste locaties aan uw klantprofiel.",
      },
      {
        name: "stap3_installatie",
        label: "Stap 3 (installatie en beheer)",
        default: "3. Wij plaatsen en koppelen binnenkort uw laadpalen; daarna staat alles live in uw portaal.",
      },
      {
        name: "voettekst",
        label: "Voettekst",
        multiline: true,
        default: "Vragen? Mail naar info@e-charging.nl.",
      },
    ],
    sample: {
      contactnaam: "Jan de Vries",
      bedrijfsnaam: "Hofstede Vastgoed B.V.",
      klantnummer: "#104",
      uitnodigingslink: "https://dashboard.e-charging.nl/uitnodiging/voorbeeld-token",
      vervaltermijn: "14",
      afzender: "E-Charging",
    },
  },
  {
    key: "klant-bericht",
    label: "Portaalbericht aan klant",
    description:
      "Wordt verstuurd als een medewerker vanaf de klantdetailpagina een bericht stuurt. Onderwerp en berichttekst typt de medewerker zelf; hier stel je de omlijsting eromheen in.",
    group: "klant",
    sender: "info",
    placeholders: [
      { name: "aanspreeknaam", label: "Naam van de ontvanger" },
      { name: "afzender", label: "Naam afzender" },
    ],
    slots: [
      { name: "label", label: "Labeltekst boven de kop", default: "Bericht" },
      { name: "aanhef", label: "Aanhef", default: "Beste {{aanspreeknaam}}," },
      { name: "knoptekst", label: "Tekst op de knop naar het portaal", default: "Bekijk in je portaal" },
      { name: "afsluiting", label: "Afsluiting", default: "Met vriendelijke groet," },
      {
        name: "naschrift",
        label: "Naschrift onderaan",
        multiline: true,
        default: "Je kunt op deze e-mail reageren; je bericht komt dan bij ons team binnen.",
      },
    ],
    sample: { aanspreeknaam: "Jan de Vries", afzender: "Wessel Jonkers" },
  },
  {
    key: "taak-toegewezen",
    label: "Taak toegewezen",
    description: "Naar de medewerker aan wie een taak wordt toegewezen.",
    group: "intern",
    sender: "noreply",
    placeholders: [
      { name: "naam", label: "Naam medewerker" },
      { name: "taak", label: "Titel van de taak" },
    ],
    slots: [
      { name: "onderwerp", label: "Onderwerp", default: "Nieuwe taak voor jou: {{taak}}" },
      { name: "aanhef", label: "Aanhef", default: "Hoi {{naam}}," },
      { name: "intro", label: "Introductiezin", default: "Er is een taak aan je toegewezen:" },
      { name: "knoptekst", label: "Tekst op de knop", default: "Bekijk je taken" },
      { name: "afsluiting", label: "Afsluiting", default: "Groet, E-Charging" },
    ],
    sample: { naam: "Wessel", taak: "Offerte 2026-014 nabellen" },
  },
  {
    key: "ere-aangevraagd",
    label: "ERE aangevraagd",
    description: "Interne melding zodra een klant in het portaal aangeeft ERE-certificaten te willen aanmelden.",
    group: "intern",
    sender: "noreply",
    placeholders: [
      { name: "klantnaam", label: "Naam van de klant" },
    ],
    slots: [
      { name: "onderwerp", label: "Onderwerp", default: "ERE aangevraagd: {{klantnaam}}" },
      {
        name: "intro",
        label: "Introductiezin",
        multiline: true,
        default: "wil ERE-certificaten aanmelden (aangevinkt in het klantportaal).",
      },
      {
        name: "oproep",
        label: "Vervolgactie",
        multiline: true,
        default: "Neem contact op om de ERE's voor deze klant aan te melden.",
      },
      { name: "knoptekst", label: "Tekst op de knop", default: "Klant openen" },
      { name: "voettekst", label: "Voettekst", default: "Automatisch verstuurd door het E-Charging dashboard." },
    ],
    sample: { klantnaam: "Hofstede Vastgoed B.V." },
  },
  {
    key: "storing-gedetecteerd",
    label: "Storing gedetecteerd",
    description:
      "Interne melding zodra de monitoring een laadpaalstoring detecteert. Meldingen worden per locatie gebundeld: bij meerdere palen op één locatie geldt de meervoudskop.",
    group: "intern",
    sender: "noreply",
    placeholders: [
      { name: "aantal", label: "Aantal laadpunten met storing" },
      { name: "locatie", label: "Naam van de locatie" },
    ],
    slots: [
      { name: "onderwerp_enkel", label: "Onderwerp (één laadpunt)", default: "Storing gedetecteerd: {{locatie}}" },
      { name: "onderwerp_bundel", label: "Onderwerp (meerdere laadpunten)", default: "Storing: {{aantal}} laadpunten op {{locatie}}" },
      { name: "label", label: "Labeltekst boven de kop", default: "Storing gedetecteerd" },
      { name: "kop_enkel", label: "Kop (één laadpunt)", default: "Een laadpunt heeft een storing" },
      { name: "kop_bundel", label: "Kop (meerdere laadpunten)", default: "{{aantal}} laadpunten op {{locatie}} hebben een storing" },
      {
        name: "intro",
        label: "Introductiezin",
        multiline: true,
        default:
          "Onze monitoring detecteerde dit automatisch. Acteer hierop voordat de klant het merkt: bel e-Flux, en neem zo nodig contact op met de locatie.",
      },
      { name: "knoptekst_storing", label: "Knop bij elke storing", default: "Open storing" },
      { name: "knoptekst_overzicht", label: "Knop naar het overzicht", default: "Open het storingenoverzicht" },
      { name: "voettekst", label: "Voettekst", default: "Deze melding is automatisch verstuurd door het E-Charging dashboard." },
    ],
    sample: { aantal: "3", locatie: "Dwarsweg 10, Zaltbommel" },
  },
  {
    key: "team-uitnodiging",
    label: "Uitnodiging medewerker",
    description:
      "Naar een collega die toegang krijgt tot het beheerportaal. Het onderwerp verschilt tussen een nieuwe uitnodiging en een heruitnodiging van iemand die al een account heeft.",
    group: "intern",
    sender: "noreply",
    placeholders: [
      { name: "naam", label: "Naam van de collega" },
      { name: "rol", label: "Toegekende rol" },
    ],
    slots: [
      { name: "onderwerp_nieuw", label: "Onderwerp (nieuwe uitnodiging)", default: "Uitnodiging — E-Charging beheer-portaal" },
      { name: "onderwerp_opnieuw", label: "Onderwerp (bestaand account)", default: "Je toegang tot het E-Charging beheer-portaal" },
      { name: "kop", label: "Kop", default: "Je bent uitgenodigd voor het beheer-portaal" },
      { name: "aanhef", label: "Aanhef", default: "Hoi {{naam}}," },
      {
        name: "intro",
        label: "Introductie",
        multiline: true,
        default: "Je hebt toegang gekregen tot het E-Charging beheer-portaal met de rol {{rol}}. Activeer je account en stel een wachtwoord in:",
      },
      { name: "knoptekst", label: "Tekst op de knop", default: "Account activeren" },
      { name: "naschrift", label: "Naschrift", multiline: true, default: "Heb je deze uitnodiging niet verwacht? Negeer deze e-mail dan." },
    ],
    sample: { naam: "Sanne", rol: "manager" },
  },
];

export const TEMPLATES_BY_KEY: Record<string, EmailTemplateDef> = Object.fromEntries(
  EMAIL_TEMPLATES.map((t) => [t.key, t]),
);

/** Verplichte placeholders van een sjabloon, als kale namen (zonder accolades). */
export function requiredPlaceholders(key: string): string[] {
  return (TEMPLATES_BY_KEY[key]?.placeholders ?? []).filter((p) => p.required).map((p) => p.name);
}

/** Welke verplichte placeholders ontbreken in de ingevulde slots? Leeg = in orde.
 *  Een leeg slot telt als "standaardtekst gebruiken", dus die controleren we niet:
 *  de standaardtekst bevat de placeholder per definitie al. */
export function missingPlaceholders(key: string, slots: Record<string, string>): string[] {
  const def = TEMPLATES_BY_KEY[key];
  if (!def) return [];
  const haystack = def.slots
    .map((s) => {
      const v = slots[s.name];
      return v && v.trim() ? v : s.default;
    })
    .join(" ");
  return requiredPlaceholders(key).filter((name) => !haystack.includes(`{{${name}}}`));
}
