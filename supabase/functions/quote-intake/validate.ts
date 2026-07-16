// Servervalidatie, triage en samenvatting van een offerteaanvraag.
// Spiegelt src/lib/offerte/{validation,triage}.ts uit de website-repo — een
// ongeauthenticeerde inzender mag nooit op de clientvalidatie vertrouwd worden.

import {
  AANSLUITING,
  BESTAAND_NIEUWBOUW,
  EIGENDOM,
  JA_NEE,
  JA_NEE_WEET_NIET,
  KABEL_LENGTE,
  KLEUR_FRONT,
  LAADTARIEF,
  PLAATSING,
  TRIAGE_LABEL,
  TYPE_LOCATIE,
  TYPE_ORGANISATIE,
  WIE_GAAT_LADEN,
  label,
  maandLabel,
  type Flow,
  type Triage,
} from "./labels.ts";

export class BadRequest extends Error {}

export type UploadedFile = { path: string; name: string; size: number; content_type: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const POSTCODE_RE = /^[1-9][0-9]{3}\s?[A-Za-z]{2}$/;
const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
export const PATH_RE = new RegExp(`^qi/${UUID}/${UUID}\\.(jpg|jpeg|png|webp|mp4|mov|webm)$`);

export const MAX_LAADPALEN = 10;
export const MAX_BESTANDEN_PER_VELD = 5;
export const OPMERKINGEN_MAX = 5000;

const MAAND_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Huisnummer + toevoeging tot één house_number, conform de dashboard-conventie
 *  (combineHouse in apps/admin/src/lib/houseNumber.ts): "8" + "A" → "8 A". */
export function combineHuisnummer(huisnummer: string, toevoeging: string): string {
  return [huisnummer, toevoeging].filter(Boolean).join(" ");
}

/** Optionele slider-waarde in centen: afwezig → null; aanwezig maar geen
 *  integer binnen het bereik → BadRequest (oude payloads sturen het veld niet). */
function centOptioneel(v: unknown, veld: string, min: number, max: number): number | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) {
    throw new BadRequest(`Ongeldige waarde voor ${veld}`);
  }
  return v;
}

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

function str(v: unknown, veld: string, opts: { max?: number; verplicht?: boolean } = {}): string {
  if (typeof v !== "string") {
    if (opts.verplicht) throw new BadRequest(`${veld} ontbreekt`);
    return "";
  }
  const s = v.trim();
  if (opts.verplicht && !s) throw new BadRequest(`${veld} is verplicht`);
  if (opts.max && s.length > opts.max) throw new BadRequest(`${veld} is te lang`);
  return s;
}

function enumOf(v: unknown, map: Record<string, string>, veld: string, verplicht: boolean): string {
  const s = typeof v === "string" ? v : "";
  if (!s) {
    if (verplicht) throw new BadRequest(`${veld} is verplicht`);
    return "";
  }
  if (!(s in map)) throw new BadRequest(`Ongeldige waarde voor ${veld}`);
  return s;
}

/** Bestandslijst: alleen paden die de server zelf kan hebben uitgegeven. */
export function files(v: unknown, veld: string): UploadedFile[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new BadRequest(`${veld} heeft een ongeldig formaat`);
  if (v.length > MAX_BESTANDEN_PER_VELD) throw new BadRequest(`Te veel bestanden bij ${veld}`);
  return v.map((raw) => {
    const f = obj(raw);
    const path = str(f.path, `${veld}: pad`, { verplicht: true, max: 200 });
    if (!PATH_RE.test(path)) throw new BadRequest(`Ongeldig bestandspad bij ${veld}`);
    return {
      path,
      name: str(f.name, `${veld}: bestandsnaam`, { max: 300 }).slice(0, 300) || "bestand",
      size: typeof f.size === "number" && f.size >= 0 ? Math.floor(f.size) : 0,
      content_type: str(f.content_type, `${veld}: type`, { max: 100 }),
    };
  });
}

const bool = (v: unknown) => v === true;

/* ────────────────────────────── particulier ────────────────────────────── */

export type ParticulierData = ReturnType<typeof parseParticulier>;

export function parseParticulier(raw: unknown) {
  const d = obj(raw);
  const g = obj(d.gegevens);
  const m = obj(d.meterkast);
  const v = obj(d.verrekenen);
  const a = obj(d.afronden);

  const postcode = str(g.postcode, "Postcode", { verplicht: true, max: 20 });
  if (!POSTCODE_RE.test(postcode)) throw new BadRequest("Ongeldige postcode");
  const email = str(g.email, "E-mailadres", { verplicht: true, max: 200 });
  if (!EMAIL_RE.test(email)) throw new BadRequest("Ongeldig e-mailadres");

  const aantal = typeof d.aantal_laadpalen === "number" ? Math.floor(d.aantal_laadpalen) : 0;
  if (!Number.isInteger(aantal) || aantal < 1 || aantal > MAX_LAADPALEN) {
    throw new BadRequest("Ongeldig aantal laadpalen");
  }
  const rawPalen = Array.isArray(d.laadpalen) ? d.laadpalen : [];
  if (rawPalen.length < aantal) throw new BadRequest("Gegevens van een laadpaal ontbreken");

  const laadpalen = rawPalen.slice(0, aantal).map((rawPaal, i) => {
    const lp = obj(rawPaal);
    const nr = i + 1;
    const vasteKabel = enumOf(lp.vaste_kabel, JA_NEE, `Vaste kabel (laadpaal ${nr})`, true);
    const kabelLengte =
      vasteKabel === "ja"
        ? enumOf(lp.kabel_lengte, KABEL_LENGTE, `Kabellengte (laadpaal ${nr})`, true)
        : "";
    return {
      foto_plek: files(lp.foto_plek, `Foto plek (laadpaal ${nr})`),
      foto_plek_overgeslagen: bool(lp.foto_plek_overgeslagen),
      route_media: files(lp.route_media, `Route (laadpaal ${nr})`),
      route_overgeslagen: bool(lp.route_overgeslagen),
      vaste_kabel: vasteKabel,
      kabel_lengte: kabelLengte,
      kleur_front: enumOf(lp.kleur_front, KLEUR_FRONT, `Kleur front (laadpaal ${nr})`, true),
    };
  });

  const verrekenen = enumOf(v.zakelijk_verrekenen, JA_NEE, "Zakelijk verrekenen", true);
  const plaatsing = enumOf(a.plaatsing, PLAATSING, "Gewenste plaatsing", true);
  const maand = plaatsing === "specifieke_maand" ? str(a.plaatsing_maand, "Maand", { verplicht: true, max: 7 }) : "";
  if (maand && !MAAND_RE.test(maand)) throw new BadRequest("Ongeldige maand");

  // Verzwaring naar 3-fase: optionele vervolgvraag (site stelt hem bij 1-fase).
  const verzwaring = enumOf(m.verzwaring_3fase, JA_NEE_WEET_NIET, "Verzwaring naar 3-fase", false);
  const verzwaringMaand = verzwaring === "ja" ? str(m.verzwaring_maand, "Verzwaring maand", { max: 7 }) : "";
  if (verzwaringMaand && !MAAND_RE.test(verzwaringMaand)) throw new BadRequest("Ongeldige maand");

  if (!bool(a.privacy_akkoord)) throw new BadRequest("Akkoord met de privacyverklaring is verplicht");

  return {
    gegevens: {
      naam: str(g.naam, "Naam", { verplicht: true, max: 200 }),
      straat: str(g.straat, "Straat", { verplicht: true, max: 200 }),
      huisnummer: str(g.huisnummer, "Huisnummer", { verplicht: true, max: 20 }),
      toevoeging: str(g.toevoeging, "Toevoeging", { max: 20 }),
      postcode,
      plaats: str(g.plaats, "Plaats", { verplicht: true, max: 120 }),
      email,
      telefoon: str(g.telefoon, "Telefoonnummer", { verplicht: true, max: 60 }),
    },
    meterkast: {
      fotos: files(m.fotos, "Foto meterkast"),
      fotos_overgeslagen: bool(m.fotos_overgeslagen),
      kruipruimte: enumOf(m.kruipruimte, JA_NEE_WEET_NIET, "Kruipruimte", true),
      aansluiting: enumOf(m.aansluiting, AANSLUITING, "Aansluiting", true),
      verzwaring_3fase: verzwaring,
      verzwaring_maand: verzwaringMaand,
    },
    aantal_laadpalen: aantal,
    laadpalen,
    verrekenen: {
      zakelijk_verrekenen: verrekenen,
      dynamisch_contract:
        verrekenen === "ja" ? enumOf(v.dynamisch_contract, JA_NEE_WEET_NIET, "Dynamisch contract", true) : "",
      laadtarief: verrekenen === "ja" ? enumOf(v.laadtarief, LAADTARIEF, "Laadtarief", true) : "",
      // Sliders van de site (centen per kWh); oude bundles sturen ze niet.
      stroomkosten_cent: centOptioneel(v.stroomkosten_cent, "Gemiddelde stroomkosten", 5, 60),
      marge_cent: centOptioneel(v.marge_cent, "Marge", 1, 30),
    },
    afronden: {
      plaatsing,
      plaatsing_maand: maand,
      opmerkingen: str(a.opmerkingen, "Opmerkingen", { max: OPMERKINGEN_MAX }),
      privacy_akkoord: true as const,
      updates_opt_in: bool(a.updates_opt_in),
    },
  };
}

/* ─────────────────────────────── zakelijk ─────────────────────────────── */

export type ZakelijkData = ReturnType<typeof parseZakelijk>;

export function parseZakelijk(raw: unknown) {
  const d = obj(raw);
  const o = obj(d.organisatie);
  const l = obj(d.locatie);
  const s = obj(d.schaal);
  const t = obj(d.techniek);
  const a = obj(d.afronden);

  const email = str(o.email, "E-mailadres", { verplicht: true, max: 200 });
  if (!EMAIL_RE.test(email)) throw new BadRequest("Ongeldig e-mailadres");

  const typeOrganisatie = enumOf(o.type_organisatie, TYPE_ORGANISATIE, "Type organisatie", true);
  const typeLocatie = enumOf(l.type_locatie, TYPE_LOCATIE, "Type locatie", true);

  // ── Adres van de locatie: nieuwe vorm (losse velden) of oude vorm (één regel).
  // De website stuurt sinds juli 2026 straat/huisnummer/postcode/plaats; gecachte
  // oudere bundles sturen nog één adres-string. Zodra er één nieuw veld gevuld is
  // geldt de nieuwe vorm (alle vier verplicht, postcode gevalideerd); anders is
  // de oude adres-regel verplicht.
  const straat = str(l.straat, "Straat van de locatie", { max: 200 });
  const huisnummer = str(l.huisnummer, "Huisnummer van de locatie", { max: 20 });
  const postcodeLocatie = str(l.postcode, "Postcode van de locatie", { max: 20 });
  const plaats = str(l.plaats, "Plaats van de locatie", { max: 120 });
  const adresOud = str(l.adres, "Adres van de locatie", { max: 300 });
  const nieuweAdresVorm = Boolean(straat || huisnummer || postcodeLocatie || plaats);
  if (nieuweAdresVorm) {
    if (!straat) throw new BadRequest("Straat van de locatie is verplicht");
    if (!huisnummer) throw new BadRequest("Huisnummer van de locatie is verplicht");
    if (!POSTCODE_RE.test(postcodeLocatie)) throw new BadRequest("Ongeldige postcode");
    if (!plaats) throw new BadRequest("Plaats van de locatie is verplicht");
  } else if (!adresOud) {
    throw new BadRequest("Straat van de locatie is verplicht");
  }

  const aantalRaw = str(s.aantal_laadpunten, "Aantal laadpunten", { verplicht: true, max: 6 });
  if (!/^\d+$/.test(aantalRaw)) throw new BadRequest("Ongeldig aantal laadpunten");
  const aantal = parseInt(aantalRaw, 10);
  if (aantal < 1 || aantal > 999) throw new BadRequest("Ongeldig aantal laadpunten");

  const uitbreiding = enumOf(s.uitbreiding, JA_NEE, "Uitbreiding", false);
  const wieRaw = Array.isArray(l.wie_gaat_laden) ? l.wie_gaat_laden : [];
  const wie = wieRaw.filter((x): x is string => typeof x === "string" && x in WIE_GAAT_LADEN);

  if (!bool(a.privacy_akkoord)) throw new BadRequest("Akkoord met de privacyverklaring is verplicht");

  const aansluitwaardeOnbekend = bool(t.aansluitwaarde_onbekend);

  return {
    organisatie: {
      bedrijfsnaam: str(o.bedrijfsnaam, "Bedrijfsnaam", { verplicht: true, max: 200 }),
      contactpersoon: str(o.contactpersoon, "Contactpersoon", { verplicht: true, max: 200 }),
      functie: str(o.functie, "Functie", { max: 120 }),
      email,
      telefoon: str(o.telefoon, "Telefoonnummer", { verplicht: true, max: 60 }),
      type_organisatie: typeOrganisatie,
      type_organisatie_anders:
        typeOrganisatie === "anders"
          ? str(o.type_organisatie_anders, "Type organisatie (anders)", { verplicht: true, max: 200 })
          : "",
      kvk: str(o.kvk, "KvK-nummer", { max: 20 }),
    },
    locatie: {
      straat,
      huisnummer,
      toevoeging: str(l.toevoeging, "Toevoeging", { max: 20 }),
      postcode: postcodeLocatie,
      plaats,
      // Alleen gevuld bij een inzending van een oude (gecachte) website-bundle.
      adres: nieuweAdresVorm ? "" : adresOud,
      type_locatie: typeLocatie,
      type_locatie_anders:
        typeLocatie === "anders" ? str(l.type_locatie_anders, "Type locatie (anders)", { verplicht: true, max: 200 }) : "",
      eigendom: enumOf(l.eigendom, EIGENDOM, "Eigendom", false),
      bestaand_of_nieuwbouw: enumOf(l.bestaand_of_nieuwbouw, BESTAAND_NIEUWBOUW, "Bestaand of nieuwbouw", false),
      wie_gaat_laden: wie,
    },
    schaal: {
      aantal_laadpunten: String(aantal),
      uitbreiding,
      uitbreiding_aantal: uitbreiding === "ja" ? str(s.uitbreiding_aantal, "Uitbreiding aantal", { max: 10 }) : "",
      // laadtype is juli 2026 van de website verwijderd (alleen AC-aanbod);
      // een oude payload mag het veld nog sturen, het wordt genegeerd.
    },
    techniek: {
      foto_meterkast: files(t.foto_meterkast, "Foto meterkast"),
      situatie_media: files(t.situatie_media, "Situatiefoto's"),
      aansluitwaarde: aansluitwaardeOnbekend ? "" : str(t.aansluitwaarde, "Aansluitwaarde", { max: 120 }),
      aansluitwaarde_onbekend: aansluitwaardeOnbekend,
    },
    afronden: {
      opmerkingen: str(a.opmerkingen, "Opmerkingen", { max: OPMERKINGEN_MAX }),
      privacy_akkoord: true as const,
      updates_opt_in: bool(a.updates_opt_in),
    },
  };
}

/** Eén leesbare adresregel, ongeacht of de aanvraag de oude of nieuwe vorm had. */
export function locatieAdresRegel(l: ZakelijkData["locatie"]): string {
  return l.straat
    ? `${l.straat} ${combineHuisnummer(l.huisnummer, l.toevoeging)}, ${l.postcode} ${l.plaats}`
    : l.adres;
}

/* ──────────────────────────────── triage ──────────────────────────────── */

export function computeTriage(flow: Flow, data: ParticulierData | ZakelijkData): Triage {
  if (flow === "particulier") {
    return (data as ParticulierData).aantal_laadpalen >= 2 ? "opname_op_locatie" : "remote_opname";
  }
  const d = data as ZakelijkData;
  const aantal = parseInt(d.schaal.aantal_laadpunten, 10) || 0;

  if (
    d.organisatie.type_organisatie === "projectontwikkelaar" ||
    d.locatie.bestaand_of_nieuwbouw === "nieuwbouw_renovatie" ||
    aantal >= 10
  ) {
    return "project";
  }

  const capaciteitBekend = d.techniek.aansluitwaarde.trim() !== "" && !d.techniek.aansluitwaarde_onbekend;
  if (
    aantal >= 4 ||
    d.organisatie.type_organisatie === "vve" ||
    d.locatie.type_locatie === "parkeergarage" ||
    d.locatie.type_locatie === "vve_parkeerplaatsen" ||
    d.locatie.eigendom === "huurder" ||
    !capaciteitBekend
  ) {
    return "middel_complex";
  }
  return "klein_simpel";
}

/* ────────────────────────── bestanden en samenvatting ────────────────────────── */

export type FileRef = UploadedFile & { label: string; kind: string };

/** Alle bestanden plat, met een label zodat het dashboard ze kan groeperen. */
export function collectFiles(flow: Flow, data: ParticulierData | ZakelijkData): FileRef[] {
  const out: FileRef[] = [];
  if (flow === "particulier") {
    const d = data as ParticulierData;
    d.meterkast.fotos.forEach((f) => out.push({ ...f, label: "Meterkast", kind: "meterkast" }));
    d.laadpalen.forEach((lp, i) => {
      lp.foto_plek.forEach((f) => out.push({ ...f, label: `Laadpaal ${i + 1}: plek`, kind: "plek" }));
      lp.route_media.forEach((f) => out.push({ ...f, label: `Laadpaal ${i + 1}: route`, kind: "route" }));
    });
  } else {
    const d = data as ZakelijkData;
    d.techniek.foto_meterkast.forEach((f) => out.push({ ...f, label: "Meterkast", kind: "meterkast" }));
    d.techniek.situatie_media.forEach((f) => out.push({ ...f, label: "Situatie of plattegrond", kind: "situatie" }));
  }
  return out;
}

const regel = (k: string, v: string) => (v ? `${k}: ${v}\n` : "");

/** Leesbare samenvatting; belandt in leads.message_body en in beide mails. */
export function buildSummary(flow: Flow, data: ParticulierData | ZakelijkData, triage: Triage): string {
  const kop = `TRIAGE: ${TRIAGE_LABEL[triage].toUpperCase()}\n`;

  if (flow === "particulier") {
    const d = data as ParticulierData;
    const g = d.gegevens;
    let s = `${kop}\n── Offerteaanvraag particulier ──\n\nUW GEGEVENS\n`;
    s += regel("Naam", g.naam);
    s += regel("Adres", `${g.straat} ${combineHuisnummer(g.huisnummer, g.toevoeging)}, ${g.postcode} ${g.plaats}`);
    s += regel("E-mail", g.email);
    s += regel("Telefoon", g.telefoon);

    s += `\nMETERKAST\n`;
    s += regel(
      "Foto meterkast",
      d.meterkast.fotos.length
        ? `${d.meterkast.fotos.length} toegevoegd`
        : d.meterkast.fotos_overgeslagen
          ? "overgeslagen door de aanvrager"
          : "niet toegevoegd",
    );
    s += regel("Kruipruimte", label(JA_NEE_WEET_NIET, d.meterkast.kruipruimte));
    s += regel("Huidige aansluiting", label(AANSLUITING, d.meterkast.aansluiting));
    s += regel("Verzwaring naar 3-fase", label(JA_NEE_WEET_NIET, d.meterkast.verzwaring_3fase));
    s += regel("Verwachte verzwaring", maandLabel(d.meterkast.verzwaring_maand));

    d.laadpalen.forEach((lp, i) => {
      s += `\nLAADPAAL ${i + 1}\n`;
      s += regel(
        "Foto plek",
        lp.foto_plek.length
          ? `${lp.foto_plek.length} toegevoegd`
          : lp.foto_plek_overgeslagen
            ? "overgeslagen door de aanvrager"
            : "niet toegevoegd",
      );
      s += regel(
        "Route meterkast naar plek",
        lp.route_media.length
          ? `${lp.route_media.length} toegevoegd`
          : lp.route_overgeslagen
            ? "overgeslagen door de aanvrager"
            : "niet toegevoegd",
      );
      s += regel(
        "Vaste kabel",
        lp.vaste_kabel === "ja" ? `Ja, ${label(KABEL_LENGTE, lp.kabel_lengte)}` : label(JA_NEE, lp.vaste_kabel),
      );
      s += regel("Kleur front cover", label(KLEUR_FRONT, lp.kleur_front));
    });

    s += `\nLADEN EN VERREKENEN\n`;
    s += regel("Laadpas werkgever of zakelijk verrekenen", label(JA_NEE, d.verrekenen.zakelijk_verrekenen));
    s += regel("Dynamisch energiecontract", label(JA_NEE_WEET_NIET, d.verrekenen.dynamisch_contract));
    s += regel("Gewenst laadtarief", label(LAADTARIEF, d.verrekenen.laadtarief));
    s += regel(
      "Gemiddelde stroomkosten",
      d.verrekenen.stroomkosten_cent === null ? "" : `${d.verrekenen.stroomkosten_cent} cent per kWh`,
    );
    s += regel(
      "Gewenste marge",
      d.verrekenen.marge_cent === null ? "" : `${d.verrekenen.marge_cent} cent per kWh`,
    );

    s += `\nAFRONDEN\n`;
    s += regel(
      "Gewenste plaatsing",
      d.afronden.plaatsing === "specifieke_maand"
        ? maandLabel(d.afronden.plaatsing_maand)
        : label(PLAATSING, d.afronden.plaatsing),
    );
    s += regel("Opmerkingen", d.afronden.opmerkingen);
    s += regel("Nieuwsbrief-opt-in", d.afronden.updates_opt_in ? "Ja" : "Nee");
    return s.trimEnd();
  }

  const d = data as ZakelijkData;
  const o = d.organisatie;
  let s = `${kop}\n── Offerteaanvraag zakelijk ──\n\nORGANISATIE\n`;
  s += regel("Bedrijfsnaam", o.bedrijfsnaam);
  s += regel("Contactpersoon", o.functie ? `${o.contactpersoon} (${o.functie})` : o.contactpersoon);
  s += regel("E-mail", o.email);
  s += regel("Telefoon", o.telefoon);
  s += regel(
    "Type organisatie",
    o.type_organisatie === "anders" ? `Anders: ${o.type_organisatie_anders}` : label(TYPE_ORGANISATIE, o.type_organisatie),
  );
  s += regel("KvK-nummer", o.kvk);

  s += `\nLOCATIE\n`;
  s += regel("Adres", locatieAdresRegel(d.locatie));
  s += regel(
    "Type locatie",
    d.locatie.type_locatie === "anders" ? `Anders: ${d.locatie.type_locatie_anders}` : label(TYPE_LOCATIE, d.locatie.type_locatie),
  );
  s += regel("Eigenaar of huurder", label(EIGENDOM, d.locatie.eigendom));
  s += regel("Bestaand of nieuwbouw", label(BESTAAND_NIEUWBOUW, d.locatie.bestaand_of_nieuwbouw));
  s += regel("Wie gaat er laden", d.locatie.wie_gaat_laden.map((w) => label(WIE_GAAT_LADEN, w)).join(", "));

  s += `\nSCHAAL\n`;
  s += regel("Laadpunten nu", d.schaal.aantal_laadpunten);
  s += regel(
    "Uitbreiding verwacht",
    d.schaal.uitbreiding === "ja"
      ? `Ja${d.schaal.uitbreiding_aantal ? `, ongeveer ${d.schaal.uitbreiding_aantal} extra` : ""}`
      : label(JA_NEE, d.schaal.uitbreiding),
  );

  s += `\nTECHNIEK\n`;
  s += regel("Foto meterkast", d.techniek.foto_meterkast.length ? `${d.techniek.foto_meterkast.length} toegevoegd` : "niet toegevoegd");
  s += regel("Situatie of plattegrond", d.techniek.situatie_media.length ? `${d.techniek.situatie_media.length} toegevoegd` : "niet toegevoegd");
  s += regel("Aansluitwaarde", d.techniek.aansluitwaarde_onbekend ? "Onbekend" : d.techniek.aansluitwaarde);

  s += `\nAFRONDEN\n`;
  s += regel("Opmerkingen", d.afronden.opmerkingen);
  s += regel("Nieuwsbrief-opt-in", d.afronden.updates_opt_in ? "Ja" : "Nee");
  return s.trimEnd();
}
