import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { EmailBodyEditor } from "@/components/sales/EmailBodyEditor";
import { toast } from "sonner";
import { ArrowLeft, Building2, Calculator, Eye, EyeOff, FilePlus2, Loader2, MapPin, MoreHorizontal, Send, Target, Trash2, PenLine, User, UserPlus, XCircle } from "lucide-react";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useQuote, useUpdateQuote, useSendQuote, useRequestSignoff, useDeleteQuote, useInternalSignLink, useReviseQuote, lineItemsOf, rejectCategoryLabel, type QuoteRevisionFields, type QuoteRejectFields } from "@/hooks/useQuotes";
import { useQuoteCalculation } from "@/hooks/useQuoteCalculation";
import { RejectQuoteDialog } from "@/components/sales/RejectQuoteDialog";
import { useProjectLocation } from "@/hooks/useProjectLocations";
import { formatObjectAddress } from "@/lib/objectLabel";
import { useCompany, usePerson, splitName } from "@/hooks/useContacts";
import { useLead } from "@/hooks/useLeads";
import { useConfiguratorSettings } from "@/hooks/useConfiguratorSettings";
import { useAuth } from "@/hooks/useAuth";
import { useSignableAdmins } from "@/hooks/useSignableAdmins";
import { SignerStatusPanel } from "@/components/sales/SignerStatusPanel";
import { CreateClientFromQuoteDialog } from "@/components/sales/CreateClientFromQuoteDialog";
import { ScopeSelector } from "@/components/sales/ScopeSelector";
import { OfferPreview } from "@/components/sales/OfferPreview";
import { SignaturePad } from "@/components/SignaturePad";
import { CompanyPicker } from "@/components/contacts/CompanyPicker";
import { PersonPicker } from "@/components/contacts/PersonPicker";
import { LeadPicker } from "@/components/contacts/LeadPicker";
import { ObjectPicker } from "@/components/contacts/ObjectPicker";
import { offerPdfBlob, offerPdfBase64, echargingSignature, type OfferPdfData, type OfferSignature } from "@/services/offerPdf";
import { DEFAULT_LEVERING_TEXT, defaultBeheerIntro, offerSections, offerPhrases, OFFER_SECTIONS, OFFER_PHRASES } from "@/services/offerTemplate";
import { OFFER_SECTION_LABELS, OFFER_SECTION_WARNINGS, offerSectionLabel } from "@/services/offerSectionLabels";
import { OFFER_PHRASE_KINDS, OFFER_PHRASE_NOTES, phraseSnippet } from "@/services/offerPhraseLabels";
import { commercialMargin } from "@/services/calcTypes";
import { formatPercent } from "@/services/calculations";
import { DEFAULT_OFFER_EMAIL, defaultOfferEmail, type OfferDetails, type OfferTemplateValues } from "@/services/offerTypes";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const euro = (n: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(n);
const numOr = (v: string): number | null => { const n = Number(String(v).replace(",", ".")); return v.trim() !== "" && Number.isFinite(n) ? n : null; };
const STATUS_LABEL: Record<string, string> = { concept: "Concept", intern_ter_ondertekening: "Ter ondertekening", verstuurd: "Verstuurd", getekend: "Getekend", verlopen: "Verlopen", afgewezen: "Afgewezen", vervangen: "Vervangen" };

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {hint ? <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

export default function SalesOfferteDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const quoteQ = useQuote(id);
  const settingsQ = useConfiguratorSettings();
  const update = useUpdateQuote();
  const send = useSendQuote();
  const requestSignoff = useRequestSignoff();
  const internalSignLink = useInternalSignLink();
  const del = useDeleteQuote();
  const revise = useReviseQuote();
  const { user, isSuperadmin } = useAuth();
  const adminsQ = useSignableAdmins();
  const quote = quoteQ.data;
  const tpl = settingsQ.data?.offerTemplate;
  const admins = adminsQ.data ?? [];
  // Interne calculatie (indien aanwezig): bron van de prijs + klantregels
  const calcQ = useQuoteCalculation(id);
  const calc = calcQ.data?.calc ?? null;
  const hasFinalizedCalc = calc?.status === "afgerond";
  // Kerncijfers voor de kaart: dezelfde marge-formule als de Marge-kaart in de
  // calculator, uit de opgeslagen totalen (labor_cost is een generated kolom).
  const calcPrijs = hasFinalizedCalc ? Number(calc!.offer_price_rounded ?? calc!.total_sell) : null;
  const calcMarge = calcPrijs == null
    ? null
    : commercialMargin(calcPrijs, Number(calc!.material_cost), Number(calc!.labor_cost ?? 0), Number(calc!.travel_sell));
  // Eén prijs i.p.v. losse offerteregels — calculatie gebeurt in Excel.
  const [price, setPrice] = useState("");
  const [email, setEmail] = useState("");
  const [withManagement, setWithManagement] = useState(true);
  const [withInstallation, setWithInstallation] = useState(true);
  const [chargeRate, setChargeRate] = useState("");
  const [idleFee, setIdleFee] = useState("");
  const [idleGrace, setIdleGrace] = useState("");
  const [numChargePoints, setNumChargePoints] = useState("");
  const [od, setOd] = useState<OfferDetails>({});
  const [signerUserId, setSignerUserId] = useState<string | null>(null);
  const [drawnSelfSig, setDrawnSelfSig] = useState<string | null>(null);
  // Eén voortgangs-/busy-vlag over de héle verzendketen → geen dubbele verzending.
  const [busy, setBusy] = useState<string | null>(null);
  const [createClientOpen, setCreateClientOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [mobilePreview, setMobilePreview] = useState(false);
  // Aanhef van de klant-mail (eerste regel). Leeg = automatisch "Beste {contact},".
  const [emailGreeting, setEmailGreeting] = useState("");
  // Aanpasbare body-tekst van de klant-offertemail (voorgevuld met de standaardtekst).
  const [emailMessage, setEmailMessage] = useState(DEFAULT_OFFER_EMAIL);
  // Laatst automatisch ingevulde default-mailtekst — zo weten we of de operator 'm zelf heeft aangepast
  // (dan niet meer auto-bijwerken bij scope/aantal-wijziging).
  const lastDefaultRef = useRef("");
  // Ondertekening van de klant-mail (na "Met vriendelijke groet,"). Leeg = naam ondertekenaar.
  const [emailClosing, setEmailClosing] = useState("");
  // Ruwe invoertekst van numerieke od-velden, zodat je vrij kunt typen (komma, tussenstanden, 0,60).
  const [numDraft, setNumDraft] = useState<Record<string, string>>({});
  // Bewerkbare koppelingen (bedrijf/persoon/lead) — id + label, geseed uit de quote.
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [personId, setPersonId] = useState<string | null>(null);
  const [personName, setPersonName] = useState("");
  const [leadId, setLeadId] = useState<string | null>(null);
  const [leadName, setLeadName] = useState("");
  const [objectId, setObjectId] = useState<string | null>(null);
  const [objectLabel, setObjectLabel] = useState("");
  // Display-/detailgegevens volgen de lokale ids (KvK via company, e-mail via person, lead-naam).
  const company = useCompany(companyId ?? undefined).data;
  const person = usePerson(personId ?? undefined).data;
  const lead = useLead(leadId ?? undefined).data;
  // Gekoppeld object (project_location): bron voor het live briefkop-adres (incl. huisnummer/toevoeging).
  const object = useProjectLocation(objectId ?? undefined).data;
  const addrFromObject: Partial<OfferDetails> = object
    ? { addressStreet: [object.address_street, object.house_number].filter(Boolean).join(" ") || null, addressPostalCode: object.postal_code ?? null, addressCity: object.city ?? null }
    : {};
  useEffect(() => { if (lead) setLeadName(lead.company_name || lead.contact_name || ""); }, [lead]);

  // Levering & installatie-tekstveld groeit automatisch mee met de inhoud (geen vaste grote bak).
  const leveringRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = leveringRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [od.leveringText, withInstallation]);

  useEffect(() => {
    if (quote) {
      // Begin-prijs: de totaalkolommen zijn leidend (bij een calculatie kan de
      // handmatig bijgestelde prijs afwijken van de regel-som); regel-som als fallback.
      const liSum = lineItemsOf(quote).reduce((s, i) => s + (Number(i.total) || 0), 0);
      const totalsSum = (Number(quote.total_hardware_cost) || 0) + (Number(quote.total_installation_cost) || 0);
      const initial = totalsSum || liSum;
      // BEVROREN: een verstuurde/getekende offerte krijgt GEEN defaults meer opgedrongen. Wat hier
      // staat moet gelijk zijn aan het document dat de klant heeft ontvangen — anders drift het
      // scherm weg van de PDF (dat gebeurde met activatiekostenPerSocket: het formulier vulde stil
      // 18,50 in terwijl de verstuurde beheer-offerte € 0,00 zei).
      const seedDefaults = quote.status === "concept";
      // Beheer-only: activatiekosten standaard 18,50 per paal (bewerkbaar) wanneer er nog geen totaal is.
      const beheerOnly = quote.with_installation === false;
      const activationTotal = 18.5 * (Number(quote.num_charge_points) || 0);
      setPrice(initial ? String(initial) : (seedDefaults && beheerOnly && activationTotal > 0 ? String(activationTotal) : ""));
      setEmail(quote.prospect_email ?? "");
      setWithManagement(quote.with_management !== false);
      setWithInstallation(quote.with_installation !== false);
      setChargeRate(quote.charge_rate_per_kwh != null ? String(quote.charge_rate_per_kwh) : "");
      const td = (quote.tariff_data ?? {}) as Record<string, unknown>;
      setIdleFee(td.idleFeePerMinute != null ? String(td.idleFeePerMinute) : "");
      setIdleGrace(td.idleGraceMinutes != null ? String(td.idleGraceMinutes) : "");
      setNumChargePoints(quote.num_charge_points != null ? String(quote.num_charge_points) : "");
      const odLoaded = ((quote as unknown as { offer_details?: OfferDetails }).offer_details ?? {}) as OfferDetails;
      // Voorgevulde defaults als echte (witte) waarden i.p.v. grijze placeholders — alleen als nog leeg.
      const lastName = splitName(quote.prospect_contact ?? "").last_name;
      const oTpl = settingsQ.data?.offerTemplate;
      setOd(seedDefaults ? {
        ...odLoaded,
        aanhef: odLoaded.aanhef && String(odLoaded.aanhef).trim() ? odLoaded.aanhef : `Geachte heer/mevrouw${lastName ? " " + lastName : ""},`,
        tav: odLoaded.tav ?? (quote.prospect_contact || null),
        onzeReferentie: odLoaded.onzeReferentie ?? (quote.quote_number || null),
        // Contract (particulier + alleen beheer): eigen betreft-default; anders het org-sjabloon.
        betreft: odLoaded.betreft ?? (((quote.is_private ?? !(quote.prospect_company ?? "").trim()) && quote.with_installation === false && quote.with_management !== false)
          ? `Beheercontract ${(quote.num_charge_points ?? 1) >= 2 ? "laadpalen" : "laadpaal"}`
          : (oTpl?.defaultBetreftTemplate || "Offerte laadinfrastructuur")),
        activatiekostenPerSocket: odLoaded.activatiekostenPerSocket ?? (oTpl?.activatiekostenPerSocket || 18.5),
      } : odLoaded);
      setNumDraft({});
      setEmailGreeting(odLoaded.emailGreeting ?? "");
      const seededEmail = defaultOfferEmail({
        withInstallation: quote.with_installation, withManagement: quote.with_management, chargePoints: quote.num_charge_points,
        isContract: (quote.is_private ?? !(quote.prospect_company ?? "").trim()) && quote.with_installation === false && quote.with_management !== false,
      });
      setEmailMessage(odLoaded.emailMessage ?? seededEmail);
      lastDefaultRef.current = odLoaded.emailMessage ? "" : seededEmail;
      setEmailClosing(odLoaded.emailClosingName ?? "");
      // Default de interne ondertekenaar op de ingelogde gebruiker, zodat de preview meteen een
      // echte ondertekenaar (naam + handtekening) toont i.p.v. de settings-default. Te wijzigen
      // via de dropdown; een reeds gekozen ondertekenaar op de quote wint.
      setSignerUserId(quote.internal_signer_user_id ?? user?.id ?? null);
      setCompanyId(quote.company_id ?? null);
      setCompanyName(quote.prospect_company ?? "");
      setPersonId(quote.person_id ?? null);
      setPersonName(quote.prospect_contact ?? "");
      setLeadId(quote.lead_id ?? null);
      setLeadName("");
      setObjectId(quote.project_location_id ?? null);
      setObjectLabel("");
    }
  }, [quote]);

  // Locatie-briefkopregel standaard = object-adres zonder objectnummer ("Bleekstraat 3D, Eindhoven").
  // Eenmalig per offerte, zodra het object geladen is en het veld nog leeg is.
  const locSeedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!quote || !object || locSeedRef.current === quote.id) return;
    locSeedRef.current = quote.id;
    setOd((prev) => (prev.object != null && String(prev.object).trim() ? prev : { ...prev, object: formatObjectAddress(object) }));
  }, [quote, object]);

  // Compacte setters voor de offerte-velden (overrides; leeg = standaard uit instellingen).
  const odStr = (k: keyof OfferDetails) => (od[k] == null ? "" : String(od[k]));
  const setStr = (k: keyof OfferDetails, v: string) => setOd((o) => ({ ...o, [k]: v.trim() === "" ? null : v }));
  // Numeriek veld: toon de ruwe draft-tekst (vrij typen, komma) en bewaar de geparste waarde in od.
  const numVal = (k: keyof OfferDetails) => numDraft[k as string] ?? (od[k] == null ? "" : String(od[k]).replace(".", ","));
  const setNum = (k: keyof OfferDetails, v: string) => { setNumDraft((d) => ({ ...d, [k as string]: v })); setOd((o) => ({ ...o, [k]: numOr(v) })); };
  const dateVal = (k: keyof OfferDetails) => { const v = od[k]; return typeof v === "string" ? v.slice(0, 10) : ""; };
  const setDate = (k: keyof OfferDetails, v: string) => setOd((o) => ({ ...o, [k]: v || null }));
  // Tariefregels: volgorde + zichtbaarheid via één geordende lijst (od.tariffOrder). In de lijst = zichtbaar;
  // laatst aangezette regel komt bovenaan. Default = klassieke regels in vaste volgorde (twee nieuwe uit).
  const TARIFF_KEYS: Array<[string, string]> = [
    ["laadkosten", "Laadkosten"], ["laadkostenGasten", "Laadkosten gasten"], ["laadkostenEigenGebruik", "Laadkosten eigen gebruik"],
    ["blokkeertarief", "Blokkeertarief"], ["starttarief", "Starttarief"], ["uurtarief", "Tarief per uur"],
  ];
  const tariffDefaultOrder = (): string[] => {
    const base = ["laadkosten", "blokkeertarief", "starttarief"];
    const u = numOr(numVal("perHourFeePerHour")); if (u != null && u > 0) base.push("uurtarief");
    return base;
  };
  const tariffOrder = Array.isArray(od.tariffOrder) ? od.tariffOrder : tariffDefaultOrder();
  const tariffShown = (k: string): boolean => tariffOrder.includes(k);
  const setTariffShown = (k: string, on: boolean) => {
    const cur = Array.isArray(od.tariffOrder) ? od.tariffOrder : tariffDefaultOrder();
    const next = on ? [k, ...cur.filter((x) => x !== k)] : cur.filter((x) => x !== k); // aanzetten = bovenaan
    setOd((o) => ({ ...o, tariffOrder: next }));
  };
  // Toon de toggles in de offerte-volgorde: actieve regels (in volgorde) eerst, dan de inactieve.
  const orderedTariffRows = [
    ...tariffOrder.filter((k) => TARIFF_KEYS.some(([key]) => key === k)),
    ...TARIFF_KEYS.map(([k]) => k).filter((k) => !tariffOrder.includes(k)),
  ];

  const isConcept = quote?.status === "concept";
  const dynamicCharge = od.chargeTariffDynamic === true;
  const grandTotal = numOr(price) ?? 0;

  const save = async () => {
    if (!quote) return;
    const p = grandTotal;
    // Zonder calculatie: één samenvattende regel; totaal in total_installation_cost zodat
    // de offertelijst + E-Group-handoff het juiste bedrag tonen. MET afgeronde calculatie
    // (en installatie-scope) blijven de calc-regels staan — de calculator is dan de bron.
    // Zolang de calc-query nog laadt/faalt is de bron onbekend: dan line_items niet
    // aanraken, anders zou een vroege save de calc-regels stil vernietigen.
    const calcKnown = !calcQ.isLoading && !calcQ.isError;
    const keepCalcLines = hasFinalizedCalc && withInstallation;
    const lineItems = calcKnown && !keepCalcLines
      ? [{ description: withInstallation ? "Levering & installatie" : "Activatie & onboarding beheer", qty: 1, unit_price: p, total: p }]
      : null;
    const tariffData = withManagement && (numOr(chargeRate) != null || numOr(idleFee) != null || numOr(idleGrace) != null)
      ? { chargeTariffPerKwh: numOr(chargeRate), idleFeePerMinute: numOr(idleFee), idleGraceMinutes: numOr(idleGrace) }
      : null;
    try {
      await update.mutateAsync({
        id: quote.id,
        patch: {
          ...(lineItems ? { line_items: lineItems as unknown as never } : {}),
          total_hardware_cost: 0,
          total_installation_cost: p,
          num_charge_points: numOr(numChargePoints) ?? undefined,
          prospect_email: email.trim() || null,
          prospect_company: companyName.trim() || null,
          prospect_contact: personName.trim() || null,
          company_id: companyId,
          person_id: personId,
          lead_id: leadId,
          project_location_id: objectId,
          with_management: withManagement,
          with_installation: withInstallation,
          charge_rate_per_kwh: withManagement ? numOr(chargeRate) : null,
          tariff_data: tariffData as unknown as never,
          offer_details: { ...od, ...(isConcept ? addrFromObject : {}), emailGreeting: emailGreeting.trim() || null, emailMessage: emailMessage.trim() || null, emailClosingName: emailClosing.trim() || null } as unknown as never,
          internal_signer_user_id: signerUserId,
        },
      });
      toast.success("Offerte opgeslagen");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Opslaan mislukt"); }
  };

  // Particulier: betaaltermijn-placeholders tonen de particuliere default (50/0/50) i.p.v. het
  // org-sjabloon, gelijk aan wat offerTemplate.resolve() zonder override rendert.
  const isParticulier = quote?.is_private ?? !(companyName && companyName.trim());

  const pdfData = (): OfferPdfData => {
    const snap = (quote!.calculation_snapshot ?? {}) as Record<string, unknown>;
    const pi = (snap.pricing_input ?? {}) as Record<string, unknown>;
    const contract = (pi.contract ?? {}) as Record<string, unknown>;
    const td = (quote!.tariff_data ?? {}) as Record<string, unknown>;
    return {
      quoteNumber: quote!.quote_number ?? "",
      date: quote!.sent_at ?? null,
      company: companyName || "",
      // Concept (is_private null) → live afleiden uit het bedrijf; verstuurd → bevroren regime tonen.
      isPrivate: quote!.is_private ?? null,
      contactName: personName || null,
      objectStreet: object ? ([object.address_street, object.house_number].filter(Boolean).join(" ") || null) : null,
      objectPostalCode: object?.postal_code ?? null,
      objectCity: object?.city ?? null,
      numChargePoints: numOr(numChargePoints),
      totalInvestment: numOr(price),
      withManagement,
      withInstallation,
      durationMonths: numOr(String(contract.durationMonths ?? "")),
      noticeMonths: numOr(String(contract.noticePeriodMonths ?? "")),
      chargeTariffPerKwh: numOr(chargeRate),
      idleFeePerMinute: numOr(idleFee),
      startFeePerSession: numOr(String(td.startFeePerSession ?? "")),
      perHourFeePerHour: td.perHourFeeEnabled ? numOr(String(td.perHourFeePerHour ?? "")) : null,
      idleGraceMinutes: numOr(idleGrace),
      validUntil: quote!.valid_until ?? null,
      offerDetails: isConcept ? { ...od, ...addrFromObject } : od,
      // zod's .default() maakt de velden optioneel in het infer-type; runtime is alles gevuld.
      offerTemplate: tpl as OfferTemplateValues | undefined,
    };
  };

  // --- Documentopbouw (uitzonderingspad) ------------------------------------------------
  // Welke onderdelen dít document heeft en welke daarvan buiten de klantversie vallen. Het
  // sjabloon is de bron: zo hoeft hier geen scope-logica gedupliceerd te worden.
  // MOET vóór de early-returns hieronder staan (hooks-vololgorde) én mag niet op `quote!`
  // vertrouwen — quote is bij de eerste render nog undefined.
  const sectionKey = quote ? JSON.stringify(pdfData()) : "";
  const sectionInfo = useMemo(() => {
    try { return quote ? offerSections(pdfData()) : []; } catch { return []; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionKey]);
  // Losse zinnen (fijnere korrel). offerPhrases laat zinnen weg die in een weggelaten sectie
  // zitten, zodat ze niet dubbel meetellen in de waarschuwingen en niet aanvinkbaar blijven.
  const phraseInfo = useMemo(() => {
    try { return quote ? offerPhrases(pdfData()) : []; } catch { return []; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionKey]);
  const omittedPhrases = phraseInfo.filter((p) => p.omitted);
  // Afgeleid uit de werkelijk beschikbare secties, niet uit de ruwe od-sleutel: na een
  // scope-wissel kan er een id in offer_details staan dat dit document niet meer heeft, en
  // dan mag er ook geen waarschuwing verschijnen.
  const omittedSections = sectionInfo.filter((s) => s.omitted);
  const omittedLabels = omittedSections.map((s) => offerSectionLabel(s.id));
  // Toonbaar in de naadstrook zolang de keuze nog niet in de database staat: pdfData() bouwt
  // uit lokale state, en "PDF openen" slaat niet eerst op.
  const savedOd = (quote?.offer_details ?? {}) as OfferDetails;
  const sameList = (a: unknown, b: unknown) =>
    JSON.stringify(Array.isArray(a) ? a : null) === JSON.stringify(Array.isArray(b) ? b : null);
  // Gescheiden houden: sectionNote van de naadstrook hangt aan docSectionsDirty, dus een
  // gewijzigde ZIN mag daar geen "niet opgeslagen" op een al opgeslagen sectie plakken.
  const docSectionsDirty = !sameList(od.docSections, savedOd.docSections);
  const docPhrasesDirty = !sameList(od.docPhrases, savedOd.docPhrases);
  // Eén setter-vorm voor beide lijsten: canoniek gesorteerd op sjabloonvolgorde (anders meldt de
  // dirty-vergelijking eeuwig "niet opgeslagen" na aan/uit/aan) en de sleutel verdwijnt volledig
  // zodra alles weer meegaat — een lege lijst zou onnodig als "aangepast document" blijven staan.
  const toggleInList = <T extends string>(cur: unknown, all: readonly T[], id: string, omit: boolean): T[] | null => {
    const base = Array.isArray(cur) ? (cur as string[]) : [];
    const next = omit ? [...base.filter((x) => x !== id), id] : base.filter((x) => x !== id);
    const ordered = all.filter((k) => next.includes(k));
    return ordered.length ? [...ordered] : null;
  };
  const setSectionOmitted = (id: string, omit: boolean) =>
    setOd((o) => ({ ...o, docSections: toggleInList(o.docSections, OFFER_SECTIONS, id, omit) }));
  const setPhraseOmitted = (id: string, omit: boolean) =>
    setOd((o) => ({ ...o, docPhrases: toggleInList(o.docPhrases, OFFER_PHRASES, id, omit) }));
  // Regel voor de bevestiging vlak vóór verzenden. Dit is het vangnet: ook wie de optie niet
  // kent, ziet hier dat het document is ingekort.
  const omitConfirmParts = [
    omittedSections.length ? `${omittedSections.length === 1 ? "1 onderdeel" : `${omittedSections.length} onderdelen`}: ${omittedLabels.join(", ")}` : "",
    omittedPhrases.length ? `${omittedPhrases.length === 1 ? "1 zin" : `${omittedPhrases.length} zinnen`}: ${omittedPhrases.map((p) => `"${phraseSnippet(p.text, 60)}"`).join(", ")}` : "",
  ].filter(Boolean);
  const omitConfirmLine = omitConfirmParts.length
    ? `\n\nLET OP: dit gaat NIET mee naar de klant — ${omitConfirmParts.join(" · ")}.`
    : "";
  // Weglaten is een uitzonderingshandeling (superadmin, concept). TERUGZETTEN mag iedereen die
  // het concept mag bewerken: een weggelaten zin laat geen naadstrook achter, dus zonder dit pad
  // kan een collega een per ongeluk uitgezette zin nooit meer herstellen.
  const canOmitDoc = isSuperadmin && isConcept && (sectionInfo.some((s) => !s.locked) || phraseInfo.length > 0);
  const canRestoreDoc = isConcept && (omittedSections.length > 0 || omittedPhrases.length > 0);
  const menuSections = canOmitDoc ? sectionInfo.filter((s) => !s.locked) : omittedSections;
  const menuPhrases = canOmitDoc ? phraseInfo : omittedPhrases;
  // Radix unmount't de trigger zodra de conditie omslaat; zonder deze state zou het menu tijdens
  // het herstellen onder je muis verdwijnen bij de laatste regel.
  const [docMenuOpen, setDocMenuOpen] = useState(false);

  const doPreview = async () => {
    if (!quote) return;
    try {
      // Gelijk aan de live preview: toon de gekozen ondertekenaar (naam + handtekening).
      window.open(URL.createObjectURL(await offerPdfBlob(pdfData(), previewSignature)), "_blank");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Preview mislukt"); }
  };

  const selfAdmin = admins.find((a) => a.userId === user?.id) ?? null;
  const selectedAdmin = admins.find((a) => a.userId === signerUserId) ?? null;
  const selfSelected = !!signerUserId && signerUserId === user?.id;

  const echargingFromQuote = (): OfferSignature => ({
    echargingSignatureDataUrl: quote?.internal_signature_data_url ?? null,
    echargingSignerName: quote?.internal_signer_name ?? null,
  });

  // SharePoint-dossier bijwerken met de (getekende) OFF — best-effort, NA de verzending.
  const updateSharepointOff = async (pdfBase64: string, sentLabel: string) => {
    try {
      const { data: spRes, error: spErr } = await supabase.functions.invoke("quote-sharepoint-off", { body: { quote_id: quote!.id, off_pdf_base64: pdfBase64 } });
      if (spErr) throw spErr;
      if ((spRes as { status?: string })?.status === "error") throw new Error((spRes as { message?: string }).message || "SharePoint-dossier mislukt");
    } catch (e) {
      console.error("[SharePoint] OFF-dossier mislukt:", e);
      toast.warning(`${sentLabel}, maar het SharePoint-dossier kon niet worden bijgewerkt.`);
    }
  };

  // Zelf tekenen: stempel eigen handtekening op de PDF en verstuur direct naar de klant.
  const signAndSend = async () => {
    if (busy || !quote || !selfAdmin) return;
    const selfSig = drawnSelfSig ?? selfAdmin.signatureDataUrl;
    if (!selfSig) { toast.error("Teken je handtekening of stel er een in bij Instellingen › Mijn handtekening"); return; }
    if (!email.trim()) { toast.error("Vul een e-mailadres in"); return; }
    if (grandTotal <= 0 && !window.confirm("Het offertetotaal is €0. Toch versturen?")) return;
    if (!window.confirm(`Offerte ${quote.quote_number} ondertekenen en versturen naar ${email.trim()}?\nTotaal: ${euro(grandTotal)}${omitConfirmLine}`)) return;
    try {
      setBusy("Opslaan…");
      await save();
      setBusy("Document voorbereiden…");
      const pdfBase64 = await offerPdfBase64(pdfData(), {
        echargingSignatureDataUrl: selfSig,
        echargingSignerName: selfAdmin.fullName,
      });
      setBusy("Versturen…");
      await send.mutateAsync({ quoteId: quote.id, email: email.trim(), pdfBase64, internalSelfSign: true, internalSignatureDataUrl: drawnSelfSig });
      toast.success(`Ondertekend en verstuurd naar ${email.trim()}`);
      setBusy("Dossier bijwerken…");
      await updateSharepointOff(pdfBase64, "De offerte is verstuurd");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Versturen mislukt"); }
    finally { setBusy(null); }
  };

  // Ander tekent: stuur ter ondertekening (mail met link).
  const sendForSignoff = async () => {
    if (busy || !quote || !selectedAdmin) return;
    // De collega kan zijn handtekening op de tekenlink-pagina zelf zetten; vooraf instellen is niet meer vereist.
    if (!window.confirm(`Offerte ${quote.quote_number} ter ondertekening sturen naar ${selectedAdmin.fullName}?${omitConfirmLine}`)) return;
    try {
      setBusy("Opslaan…");
      await save();
      setBusy("Document voorbereiden…");
      // OFF mét de handtekening van de toegewezen ondertekenaar (naam + handtekening indien
      // opgeslagen) → de SharePoint-OFF is consistent met de preview en de snapshot die
      // quote-request-signoff wegschrijft. Geen default "Willi-Jan Jonkers" meer.
      const offPdfBase64 = await offerPdfBase64(pdfData(), echargingSignature({
        name: selectedAdmin.fullName, signatureDataUrl: selectedAdmin.signatureDataUrl,
      }));
      setBusy("Versturen…");
      await requestSignoff.mutateAsync({ quoteId: quote.id });
      toast.success(`Ter ondertekening gestuurd naar ${selectedAdmin.fullName}`);
      setBusy("Dossier bijwerken…");
      await updateSharepointOff(offPdfBase64, "Ter ondertekening gestuurd");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Versturen mislukt"); }
    finally { setBusy(null); }
  };

  // Opnieuw naar de klant versturen (offerte is al intern getekend).
  const resendToCustomer = async () => {
    if (busy || !quote) return;
    if (!email.trim()) { toast.error("Vul een e-mailadres in"); return; }
    if (!window.confirm(`Offerte ${quote.quote_number} opnieuw versturen naar ${email.trim()}?${omitConfirmLine}`)) return;
    try {
      setBusy("Document voorbereiden…");
      const pdfBase64 = await offerPdfBase64(pdfData(), { ...echargingFromQuote() });
      setBusy("Versturen…");
      await send.mutateAsync({ quoteId: quote.id, email: email.trim(), pdfBase64 });
      toast.success(`Offerte opnieuw verstuurd naar ${email.trim()}`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Versturen mislukt"); }
    finally { setBusy(null); }
  };

  // Opnieuw ter ondertekening sturen (zelfde of nieuwe ondertekenaar).
  const resendSignoff = async () => {
    if (busy || !quote) return;
    if (!window.confirm(`Offerte ${quote.quote_number} opnieuw ter ondertekening sturen?`)) return;
    try {
      setBusy("Versturen…");
      await requestSignoff.mutateAsync({ quoteId: quote.id });
      toast.success("Opnieuw ter ondertekening gestuurd");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Versturen mislukt"); }
    finally { setBusy(null); }
  };

  // Toegewezen ondertekenaar opent zijn eigen ondertekenlink (waar je tekent of wijzigt).
  const openSignLink = async () => {
    if (busy || !quote) return;
    try {
      setBusy("Link openen…");
      const token = await internalSignLink.mutateAsync({ quoteId: quote.id });
      window.open(`/offerte/intern/${token}`, "_blank", "noopener");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Ondertekenlink openen mislukt"); }
    finally { setBusy(null); }
  };

  // Nieuwe versie (revisie): concept-kopie met een nieuw nummer in dezelfde reeks. De huidige
  // offerte blijft geldig totdat de nieuwe versie wordt verstuurd (dan → 'vervangen').
  const doRevise = async () => {
    if (busy || !quote) return;
    if (!window.confirm(`Nieuwe versie maken van offerte ${quote.quote_number}?\n\nJe krijgt een concept-kopie met een nieuw nummer om aan te passen. Deze offerte blijft geldig en wordt pas vervangen (en de ondertekenlink ingetrokken) zodra je de nieuwe versie verstuurt.`)) return;
    try {
      setBusy("Nieuwe versie maken…");
      const res = await revise.mutateAsync(quote.id);
      toast.success(`Nieuwe versie ${res.quoteNumber} aangemaakt`);
      navigate(`/sales/offertes?quote=${res.quoteId}`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Nieuwe versie maken mislukt"); }
    finally { setBusy(null); }
  };

  const doDelete = async () => {
    if (!quote) return;
    if (!window.confirm(`Offerte ${quote.quote_number} definitief verwijderen? Dit kan niet ongedaan worden gemaakt.`)) return;
    try {
      await del.mutateAsync(quote.id);
      toast.success("Offerte verwijderd");
      navigate("/sales/offertes");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Verwijderen mislukt"); }
  };

  const backBtn = (
    <Button variant="ghost" size="sm" onClick={() => navigate("/sales/offertes")} className="-ml-2 text-muted-foreground hover:text-foreground">
      <ArrowLeft className="mr-1.5 h-4 w-4" /> Offertes
    </Button>
  );

  if (quoteQ.isLoading) {
    return <div className="space-y-4 animate-fade-in">{backBtn}<Skeleton className="h-8 w-64" /><Skeleton className="h-[60vh] w-full" /></div>;
  }
  if (!quote) {
    return (
      <div className="space-y-4 animate-fade-in">
        {backBtn}
        <p className="text-sm text-muted-foreground">Offerte niet gevonden.</p>
      </div>
    );
  }

  // In concept: toon de gekozen interne ondertekenaar (naam + handtekening) live in de
  // preview — naam altijd, handtekening indien opgeslagen. Valt terug op de ingelogde gebruiker
  // wanneer er nog niets gekozen is. Verzonden/getekend gebruikt de snapshot uit de quote.
  const effectiveSigner = selectedAdmin ?? selfAdmin;
  const previewSignature: OfferSignature | undefined = isConcept
    ? echargingSignature({ name: effectiveSigner?.fullName, signatureDataUrl: effectiveSigner?.signatureDataUrl })
    : echargingSignature({ name: quote?.internal_signer_name, signatureDataUrl: quote?.internal_signature_data_url });

  return (
    <div className="animate-fade-in">
      {backBtn}

      {/* Kop */}
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">Offerte {quote.quote_number ?? ""}</h1>
            <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium">{STATUS_LABEL[quote.status ?? ""] ?? quote.status}</span>
            {/* Ingekort document: zichtbaar voor ELKE interne gebruiker en in elke status — het
                signaal hangt bewust niet aan de (afgeschermde) bediening. */}
            {(omittedSections.length > 0 || omittedPhrases.length > 0) && (
              <span
                className="shrink-0 text-muted-foreground"
                title={`Wordt niet meegestuurd: ${[...omittedLabels, ...omittedPhrases.map((p) => `"${phraseSnippet(p.text, 50)}"`)].join(", ")}${(docSectionsDirty || docPhrasesDirty) ? " · nog niet opgeslagen" : ""}`}
                aria-label="Ingekort document"
              >
                <EyeOff className="h-4 w-4" />
              </span>
            )}
          </div>
        </div>
        <Button variant="outline" size="sm" className="lg:hidden" onClick={() => setMobilePreview((v) => !v)}>
          <Eye className="mr-1.5 h-4 w-4" /> {mobilePreview ? "Verberg voorbeeld" : "Toon voorbeeld"}
        </Button>
      </div>

      {/* Intern afgewezen: alleen-lezen, met de vastgelegde reden (voor analyse). */}
      {quote.status === "afgewezen" && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <span className="font-medium">Afgewezen — {rejectCategoryLabel((quote as unknown as QuoteRejectFields).rejected_reason_category)}</span>
          {(quote as unknown as QuoteRejectFields).rejected_reason && <span>: {(quote as unknown as QuoteRejectFields).rejected_reason}</span>}
          {(quote as unknown as QuoteRejectFields).rejected_at && <span className="text-red-500"> · {new Date((quote as unknown as QuoteRejectFields).rejected_at!).toLocaleDateString("nl-NL")}</span>}
        </div>
      )}

      {/* Vervangen door een nieuwere versie (revisie-flow): alleen-lezen archiefexemplaar. */}
      {quote.status === "vervangen" && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
          <span>Deze offerte is vervangen door een nieuwere versie; de ondertekenlink is ingetrokken.</span>
          {(quote as unknown as QuoteRevisionFields).superseded_by_quote_id && (
            <button className="font-medium underline underline-offset-2" onClick={() => navigate(`/sales/offertes?quote=${(quote as unknown as QuoteRevisionFields).superseded_by_quote_id}`)}>
              Bekijk de nieuwe versie
            </button>
          )}
        </div>
      )}

      {/* Mobiel: voorbeeld als toggle */}
      {mobilePreview && (
        <div className="mt-4 lg:hidden">
          <OfferPreview
            data={pdfData()}
            signature={previewSignature}
            className="h-[80vh]"
            sections={sectionInfo}
            sectionLabels={OFFER_SECTION_LABELS}
            sectionNote={docSectionsDirty ? "niet opgeslagen" : undefined}
            onRestoreSection={isConcept ? (sid) => setSectionOmitted(sid, false) : undefined}
          />
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,540px)] lg:items-start">
        {/* Links: formulier */}
        <div className="min-w-0 space-y-4">
          <Section title="Bedrijf & scope">
            <div className="mb-3">
              <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                {companyName || personName || "—"}
                {!(companyName && companyName.trim()) ? <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Particulier</span> : null}
              </p>
              {companyId ? <p className="text-[11px] text-muted-foreground">{personName || ""}</p> : null}
              {company && (company.kvk || company.btw_number || company.website) ? (
                <div className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                  {company.kvk ? <p>KvK: {company.kvk}</p> : null}
                  {company.btw_number ? <p>BTW: {company.btw_number}</p> : null}
                  {company.website ? <p className="truncate">{company.website}</p> : null}
                </div>
              ) : null}
            </div>
            <ScopeSelector
              withInstallation={withInstallation}
              withManagement={withManagement}
              disabled={!isConcept}
              onChange={({ withInstallation: wi, withManagement: wm }) => {
                setWithInstallation(wi); setWithManagement(wm);
                // Default-mailtekst meeveranderen met de scope, zolang de operator 'm niet zelf heeft aangepast.
                if (emailMessage === lastDefaultRef.current) {
                  const d = defaultOfferEmail({ withInstallation: wi, withManagement: wm, chargePoints: numOr(numChargePoints) });
                  lastDefaultRef.current = d; setEmailMessage(d);
                }
              }}
            />
          </Section>

          <Section title="Koppelingen" hint="Controleer/wijzig aan welke contacten de offerte hangt — bij conversie neemt het systeem deze over.">
            {isConcept ? (
              <div className="space-y-3">
                <div className="space-y-1">
                  <div className="flex items-center justify-between"><Label className="text-xs">Bedrijf</Label>{companyId ? <Link to={`/sales/contacten?company=${companyId}`} className="text-[11px] text-primary hover:underline">bekijken →</Link> : null}</div>
                  <CompanyPicker value={companyId} valueLabel={companyName || null} onChange={(id, c) => { setCompanyId(id); setCompanyName(id ? (c?.name ?? companyName) : ""); }} />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between"><Label className="text-xs">Persoon</Label>{personId ? <Link to={`/sales/contacten?person=${personId}`} className="text-[11px] text-primary hover:underline">bekijken →</Link> : null}</div>
                  <PersonPicker value={personId} valueLabel={personName || null} companyId={companyId} defaults={{
                    // Particulier: objectadres (uitvoerlocatie) = woonadres = factuuradres.
                    address: companyId || !object ? null : { street: object.address_street, houseNumber: object.house_number, postalCode: object.postal_code, city: object.city },
                  }} onChange={(id, p) => { setPersonId(id); setPersonName(id ? (p?.full_name ?? personName) : ""); }} />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between"><Label className="text-xs">Lead</Label>{leadId ? <Link to={`/sales/leads?lead=${leadId}`} className="text-[11px] text-primary hover:underline">bekijken →</Link> : null}</div>
                  <LeadPicker value={leadId} valueLabel={leadName || null} onChange={(id, label) => { setLeadId(id); setLeadName(id ? (label ?? leadName) : ""); }} />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between"><Label className="text-xs">Object</Label>{objectId ? <Link to={`/sales/objecten/${objectId}`} className="text-[11px] text-primary hover:underline">bekijken →</Link> : null}</div>
                  <ObjectPicker value={objectId} valueLabel={objectLabel || object?.display_name || null} onChange={(id, label) => { setObjectId(id); setObjectLabel(id ? (label ?? objectLabel) : ""); }} />
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 rounded-lg border p-2.5 text-sm">
                  <div className="flex min-w-0 items-center gap-2">
                    <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                    {companyId ? (
                      <span className="truncate font-medium text-foreground">{companyName || company?.name || "…"}{company?.kvk ? <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">KvK {company.kvk}</span> : null}</span>
                    ) : <span className="text-muted-foreground">Bedrijf — niet gekoppeld</span>}
                  </div>
                  {companyId ? <Link to={`/sales/contacten?company=${companyId}`} className="shrink-0 text-xs text-primary hover:underline">bekijken →</Link> : null}
                </div>
                <div className="flex items-center justify-between gap-2 rounded-lg border p-2.5 text-sm">
                  <div className="flex min-w-0 items-center gap-2">
                    <User className="h-4 w-4 shrink-0 text-muted-foreground" />
                    {personId ? (
                      <span className="truncate font-medium text-foreground">{personName || person?.full_name || "…"}{person?.email ? <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">{person.email}</span> : null}</span>
                    ) : <span className="text-muted-foreground">Persoon — niet gekoppeld</span>}
                  </div>
                  {personId ? <Link to={`/sales/contacten?person=${personId}`} className="shrink-0 text-xs text-primary hover:underline">bekijken →</Link> : null}
                </div>
                <div className="flex items-center justify-between gap-2 rounded-lg border p-2.5 text-sm">
                  <div className="flex min-w-0 items-center gap-2">
                    <Target className="h-4 w-4 shrink-0 text-muted-foreground" />
                    {leadId ? (
                      <span className="truncate font-medium text-foreground">{leadName || lead?.company_name || lead?.contact_name || "…"}</span>
                    ) : <span className="text-muted-foreground">Lead — niet gekoppeld</span>}
                  </div>
                  {leadId ? <Link to={`/sales/leads?lead=${leadId}`} className="shrink-0 text-xs text-primary hover:underline">bekijken →</Link> : null}
                </div>
                <div className="flex items-center justify-between gap-2 rounded-lg border p-2.5 text-sm">
                  <div className="flex min-w-0 items-center gap-2">
                    <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                    {objectId ? (
                      <span className="truncate font-medium text-foreground">{object?.display_name || objectLabel || "…"}</span>
                    ) : <span className="text-muted-foreground">Object — niet gekoppeld</span>}
                  </div>
                  {objectId ? <Link to={`/sales/objecten/${objectId}`} className="shrink-0 text-xs text-primary hover:underline">bekijken →</Link> : null}
                </div>
              </div>
            )}
          </Section>

          <Section title="Briefkop & adres">
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2 space-y-1">
                <div className="flex items-center justify-between"><Label className="text-xs">Adres <span className="font-normal text-muted-foreground">(uit object)</span></Label>{objectId ? <Link to={`/sales/objecten/${objectId}`} className="text-[11px] text-primary hover:underline">object bewerken →</Link> : null}</div>
                {object ? (
                  <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                    <p>{[object.address_street, object.house_number].filter(Boolean).join(" ") || "—"}</p>
                    <p className="text-muted-foreground">{[object.postal_code, object.city].filter(Boolean).join(" ")}</p>
                  </div>
                ) : (
                  <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">Geen object gekoppeld — kies er een onder Koppelingen.</p>
                )}
              </div>
              <div className="col-span-2 space-y-1"><Label className="text-xs">T.a.v.</Label><Input value={odStr("tav")} disabled={!isConcept} onChange={(e) => setStr("tav", e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">Onze referentie</Label><Input value={odStr("onzeReferentie")} disabled={!isConcept} onChange={(e) => setStr("onzeReferentie", e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">Offertedatum</Label><Input type="date" value={dateVal("offerDate")} disabled={!isConcept} onChange={(e) => setDate("offerDate", e.target.value)} /></div>
              <div className="col-span-2 space-y-1"><Label className="text-xs">Locatie</Label><Input value={odStr("object")} disabled={!isConcept} onChange={(e) => setStr("object", e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">Aantal laadpunten</Label><Input inputMode="numeric" value={numChargePoints} placeholder={quote.num_charge_points != null ? String(quote.num_charge_points) : ""} disabled={!isConcept} onChange={(e) => { setNumChargePoints(e.target.value); if (emailMessage === lastDefaultRef.current) { const d = defaultOfferEmail({ withInstallation, withManagement, chargePoints: numOr(e.target.value) }); lastDefaultRef.current = d; setEmailMessage(d); } }} /></div>
              <div className="col-span-2 space-y-1"><Label className="text-xs">Betreft</Label><Input value={odStr("betreft")} disabled={!isConcept} onChange={(e) => setStr("betreft", e.target.value)} /></div>
              <div className="col-span-2 space-y-1"><Label className="text-xs">Aanhef</Label><Input value={odStr("aanhef")} disabled={!isConcept} onChange={(e) => setStr("aanhef", e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">Witruimte boven datum (px)</Label><Input inputMode="numeric" value={numVal("dateGapPx")} placeholder="96" disabled={!isConcept} onChange={(e) => setNum("dateGapPx", e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">Witruimte boven aanhef (px)</Label><Input inputMode="numeric" value={numVal("aanhefGapPx")} placeholder="84" disabled={!isConcept} onChange={(e) => setNum("aanhefGapPx", e.target.value)} /></div>
              <p className="col-span-2 text-[10px] text-muted-foreground">Standaard 96 / 84 px. Bij lange teksten worden deze automatisch verkleind (tot min. 16 px) zodat het investeringsblok boven de voettekst blijft; een eigen waarde geldt als maximum.</p>
            </div>
          </Section>

          {/* Interne calculatie — nooit zichtbaar voor de klant */}
          <Section title="Interne calculatie" hint="Kostprijs, materialen en uren — alleen intern. Een afgeronde calculatie vult prijs, regels en de leveringstekst voor.">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm">
                <Calculator className="h-4 w-4 text-primary" />
                {calc == null ? (
                  <span className="text-muted-foreground">Nog geen calculatie gemaakt.</span>
                ) : calc.status === "overgeslagen" ? (
                  <span className="text-muted-foreground">Calculatie overgeslagen.</span>
                ) : calc.status === "concept" ? (
                  <span className="text-muted-foreground">Concept-calculatie — nog niet afgerond.</span>
                ) : (
                  <span className="flex flex-wrap items-baseline gap-x-5 gap-y-0.5">
                    <span className="text-muted-foreground">
                      Commerciële prijs <strong className="tabular-nums text-foreground">{euro(calcPrijs ?? 0)}</strong>
                    </span>
                    <span className="text-muted-foreground">
                      Marge{" "}
                      <strong className={`tabular-nums ${(calcMarge?.amount ?? 0) <= 0 ? "text-destructive" : "text-primary"}`}>
                        {euro(calcMarge?.amount ?? 0)}
                      </strong>
                    </span>
                    <span className="text-muted-foreground">
                      Marge %{" "}
                      <strong className={`tabular-nums ${(calcMarge?.amount ?? 0) <= 0 ? "text-destructive" : "text-primary"}`}>
                        {calcMarge?.pct == null ? "—" : formatPercent(calcMarge.pct)}
                      </strong>
                    </span>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {hasFinalizedCalc && calc?.offer_price_rounded != null && numOr(price) != null && Number(calc.offer_price_rounded) !== numOr(price) && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                    Prijs wijkt af van calculatie ({euro(Number(calc.offer_price_rounded))})
                  </span>
                )}
                <Button variant="outline" size="sm" onClick={() => navigate(`/sales/offertes/${id}/calculatie`)}>
                  {calc == null || calc.status === "overgeslagen" ? "Calculatie maken" : isConcept ? "Calculatie openen" : "Calculatie bekijken"}
                </Button>
              </div>
            </div>
          </Section>

          {withInstallation ? (
            <Section title="Levering & installatie" hint="Het belangrijkste, meest variërende deel — alinea's scheiden met een lege regel. De rest van de offerte schuift automatisch mee.">
              <Textarea ref={leveringRef} className="leading-relaxed min-h-[8rem] max-h-[60vh] resize-none overflow-y-auto" value={od.leveringText ?? DEFAULT_LEVERING_TEXT} disabled={!isConcept} onChange={(e) => setStr("leveringText", e.target.value)} />
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="space-y-1"><Label className="text-xs">Prijs (excl. BTW)</Label><Input inputMode="decimal" value={price} placeholder="0" disabled={!isConcept} onChange={(e) => setPrice(e.target.value)} /></div>
                <div className="space-y-1"><Label className="text-xs">Stelpost graafwerk (€)</Label><Input inputMode="decimal" value={numVal("stelpostGraafwerk")} placeholder={String(tpl?.defaultStelpostGraafwerk ?? "")} disabled={!isConcept} onChange={(e) => setNum("stelpostGraafwerk", e.target.value)} /></div>
              </div>
            </Section>
          ) : (
            <>
              {/* Particulier alleen-beheer = contractblad: pagina 1+2 samengevoegd, geen begeleidende
                  tekst meer — het veld verbergen voorkomt bewerken van iets dat niet rendert.
                  De hint citeert bewust NIET de hero-kop: die zin is via de documentopbouw uitzetbaar,
                  en dan zou de hint verwijzen naar iets dat er niet staat. */}
              {!isParticulier && (
                <Section title="Toelichting beheer (pagina 1)" hint="Begeleidende tekst boven aan pagina 1 — alinea's scheiden met een lege regel. Leeg laten = standaardtekst.">
                  <Textarea className="leading-relaxed min-h-[8rem] max-h-[60vh] resize-none overflow-y-auto" value={od.beheerIntroText ?? defaultBeheerIntro({ poles: numOr(numChargePoints), addr1: [object?.address_street, object?.house_number].filter(Boolean).join(" ") || odStr("addressStreet"), addr2: object?.city || odStr("addressCity") }, 2, quote.is_private ?? !companyName.trim())} disabled={!isConcept} onChange={(e) => setStr("beheerIntroText", e.target.value)} />
                </Section>
              )}
              <Section title="Eenmalige kosten" hint="De eenmalige activatie-/onboardingkost voor het beheer van de bestaande laadpalen.">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1"><Label className="text-xs">Activatiekosten (excl. BTW)</Label><Input inputMode="decimal" value={price} placeholder="0" disabled={!isConcept} onChange={(e) => setPrice(e.target.value)} /></div>
                </div>
              </Section>
            </>
          )}

          {withManagement && (
            <Section title="Tarieven & storingen">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Laadtarief / kWh (€)</Label>
                  <Input inputMode="decimal" value={dynamicCharge ? "" : chargeRate} placeholder={dynamicCharge ? "Dynamisch" : undefined} disabled={!isConcept || dynamicCharge} onChange={(e) => setChargeRate(e.target.value)} />
                  <label className="mt-1 flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5">
                    <span className="text-xs text-foreground">Dynamisch (excl. tarief)</span>
                    <Switch checked={dynamicCharge} disabled={!isConcept} onCheckedChange={(v) => { setOd((o) => ({ ...o, chargeTariffDynamic: v ? true : null })); if (v) setChargeRate(""); }} />
                  </label>
                </div>
                <div className="space-y-1"><Label className="text-xs">Blokkeertarief / min (€)</Label><Input inputMode="decimal" value={idleFee} disabled={!isConcept} onChange={(e) => setIdleFee(e.target.value)} /></div>
                <div className="space-y-1"><Label className="text-xs">Starttarief / keer (€)</Label><Input inputMode="decimal" value={numVal("startFeePerSession")} disabled={!isConcept} onChange={(e) => setNum("startFeePerSession", e.target.value)} /></div>
                <div className="space-y-1"><Label className="text-xs">Laadkosten gasten / kWh (€)</Label><Input inputMode="decimal" value={numVal("laadkostenGasten")} disabled={!isConcept} onChange={(e) => setNum("laadkostenGasten", e.target.value)} /></div>
                <div className="space-y-1"><Label className="text-xs">Laadkosten eigen gebruik / kWh (€)</Label><Input inputMode="decimal" value={numVal("laadkostenEigenGebruik")} disabled={!isConcept} onChange={(e) => setNum("laadkostenEigenGebruik", e.target.value)} /></div>
                <div className="space-y-1"><Label className="text-xs">Gratis minuten</Label><Input inputMode="numeric" value={idleGrace} disabled={!isConcept} onChange={(e) => setIdleGrace(e.target.value)} /></div>
                <div className="space-y-1"><Label className="text-xs">Marge / kWh (€)</Label><Input inputMode="decimal" value={numVal("serviceFeePerKwh")} placeholder={String(tpl?.serviceFeePerKwh ?? "")} disabled={!isConcept} onChange={(e) => setNum("serviceFeePerKwh", e.target.value)} /></div>
                <div className="space-y-1"><Label className="text-xs">Servicemonteur / uur (€)</Label><Input inputMode="decimal" value={numVal("servicemonteurPerHour")} placeholder={String(tpl?.servicemonteurPerHour ?? "")} disabled={!isConcept} onChange={(e) => setNum("servicemonteurPerHour", e.target.value)} /></div>
                <div className="space-y-1"><Label className="text-xs">Voorrijkosten / km (€)</Label><Input inputMode="decimal" value={numVal("voorrijkostenPerKm")} placeholder={String(tpl?.voorrijkostenPerKm ?? "")} disabled={!isConcept} onChange={(e) => setNum("voorrijkostenPerKm", e.target.value)} /></div>
                {withInstallation && (
                  <div className="space-y-1"><Label className="text-xs">Toeslag werkuur (€)</Label><Input inputMode="decimal" value={numVal("toeslagWerkuur")} placeholder={String(tpl?.toeslagWerkuur ?? "")} disabled={!isConcept} onChange={(e) => setNum("toeslagWerkuur", e.target.value)} /></div>
                )}
                {/* Activatiekosten horen bij de BEHEER-module, dus ook zichtbaar bij alleen-beheer.
                    Stond eerder achter withInstallation, waardoor het veld bij alleen-beheer wél
                    gevuld werd maar niet te zien of te corrigeren was — en de PDF een ander bedrag
                    printte dan het scherm. */}
                {withManagement && (
                  <div className="space-y-1">
                    <Label className="text-xs">Activatiekosten / laadpunt (€)</Label>
                    <Input inputMode="decimal" value={numVal("activatiekostenPerSocket")} disabled={!isConcept} onChange={(e) => setNum("activatiekostenPerSocket", e.target.value)} />
                    {!withInstallation && (
                      <p className="text-[10px] text-muted-foreground">
                        {(() => {
                          const per = numOr(numVal("activatiekostenPerSocket")) ?? 0;
                          const qty = numOr(numChargePoints) ?? 0;
                          return per > 0 && qty > 0
                            ? `${qty} × ${euro(per)} = ${euro(per * qty)} excl. BTW`
                            : "Vul aantal laadpunten én bedrag in voor de activatieregel";
                        })()}
                      </p>
                    )}
                  </div>
                )}
              </div>
              <div className="mt-4">
                <Label className="text-xs">Toon in offerte</Label>
                <p className="text-[10px] text-muted-foreground">Kies welke tariefregels in het "afgesproken instellingen"-blok verschijnen. De laatst aangezette regel komt bovenaan — zo bepaal je zelf de volgorde.</p>
                <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {orderedTariffRows.map((key) => {
                    const label = TARIFF_KEYS.find(([k]) => k === key)?.[1] ?? key;
                    return (
                      <label key={key} className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5">
                        <span className="text-xs text-foreground">{label}</span>
                        <Switch checked={tariffShown(key)} disabled={!isConcept} onCheckedChange={(v) => setTariffShown(key, v)} />
                      </label>
                    );
                  })}
                </div>
              </div>
            </Section>
          )}

          <Section title="Datums & betaling" hint="Leeg gelaten velden gebruiken automatisch de standaard uit Configurator › Offerte-sjabloon.">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1"><Label className="text-xs">Overleg met</Label><Input value={odStr("overlegNaam")} disabled={!isConcept} onChange={(e) => setStr("overlegNaam", e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">Overleg d.d.</Label><Input type="date" value={dateVal("overlegDatum")} disabled={!isConcept} onChange={(e) => setDate("overlegDatum", e.target.value)} /></div>
            </div>
            {/* Ingangsdatum-veld vervallen: de overeenkomst gaat (v2, alle scopes) in op de dag
                van ondertekening; verstuurde v1-offertes renderen hun opgeslagen datum gewoon. */}
            <p className="mt-1 text-[10px] text-muted-foreground">Leeg gelaten overleg-velden verbergen de regel "Uitgangspunten" op de offerte. De overeenkomst gaat in op de dag van ondertekening.</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <div className="space-y-1"><Label className="text-xs">% bij opdracht</Label><Input inputMode="numeric" value={numVal("betaalBijOpdrachtPct")} placeholder={String(isParticulier ? 50 : tpl?.betaalBijOpdrachtPct ?? "")} disabled={!isConcept} onChange={(e) => setNum("betaalBijOpdrachtPct", e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">% bij start</Label><Input inputMode="numeric" value={numVal("betaalBijStartPct")} placeholder={String(isParticulier ? 0 : tpl?.betaalBijStartPct ?? "")} disabled={!isConcept} onChange={(e) => setNum("betaalBijStartPct", e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">% na werk</Label><Input inputMode="numeric" value={numVal("betaalNaWerkPct")} placeholder={String(isParticulier ? 50 : tpl?.betaalNaWerkPct ?? "")} disabled={!isConcept} onChange={(e) => setNum("betaalNaWerkPct", e.target.value)} /></div>
            </div>
          </Section>

          <Section title="E-mail aan de klant">
            <div className="space-y-3">
              <div className="space-y-1.5"><Label className="text-xs">E-mail ontvanger</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={quote.status === "getekend"} /></div>
              <div className="space-y-1.5">
                <Label className="text-xs">Aanhef</Label>
                <Input value={emailGreeting} placeholder={personName.trim() ? `Beste ${personName.trim()},` : "Geachte heer/mevrouw,"} disabled={!isConcept} onChange={(e) => setEmailGreeting(e.target.value)} />
                <p className="text-[10px] text-muted-foreground">Leeg = automatisch "Beste {personName.trim() || "…"},". Pas aan voor een andere aanspreking.</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">E-mailbericht aan de klant</Label>
                <EmailBodyEditor value={emailMessage} onChange={setEmailMessage} disabled={!isConcept} />
                <p className="text-[10px] text-muted-foreground">Begin je bericht <strong>zónder aanhef</strong> (die staat hierboven). Maak woorden vet met de knop of Ctrl/Cmd+B. De knop "Offerte bekijken en ondertekenen" en de geldigheid worden automatisch toegevoegd; alinea's scheiden met een lege regel.</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Ondertekening (na "Met vriendelijke groet,")</Label>
                <Input value={emailClosing} placeholder={selectedAdmin?.fullName || "Team E-Charging"} disabled={!isConcept} onChange={(e) => setEmailClosing(e.target.value)} />
                <p className="text-[10px] text-muted-foreground">Leeg = de naam van de ondertekenaar (anders "Team E-Charging").</p>
              </div>
            </div>
          </Section>

          <Section title="Ondertekenaars">
            <SignerStatusPanel
              status={quote.status ?? "concept"}
              internalSignerName={quote.internal_signer_name}
              internalSignedAt={quote.internal_signed_at}
              customerCompany={quote.prospect_company}
              customerContact={quote.prospect_contact}
              customerSignerName={quote.signer_name}
              customerSignedAt={quote.signed_at}
              admins={admins}
              signerUserId={signerUserId}
              onSignerChange={setSignerUserId}
              currentUserId={user?.id}
              editable={isConcept}
            />
            {selfSelected && isConcept && (
              <div className="mt-3 space-y-1.5">
                <Label className="text-xs">{selfAdmin?.signatureDataUrl ? "Jouw handtekening (teken hier om je opgeslagen handtekening te vervangen)" : "Jouw handtekening (teken hier - je hebt er nog geen opgeslagen)"}</Label>
                <SignaturePad onChange={setDrawnSelfSig} />
              </div>
            )}
          </Section>

          {/* Acties */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2">
              {isConcept && <Button variant="outline" onClick={save} disabled={!!busy || update.isPending}>Opslaan</Button>}
              <Button variant="outline" onClick={doPreview} disabled={!!busy}><Eye className="mr-1.5 h-4 w-4" /> PDF openen</Button>
            </div>
            <div className="flex items-center gap-2">
              {quote.status === "concept" && (
                <Button onClick={selfSelected ? signAndSend : sendForSignoff} disabled={!!busy || !signerUserId || (selfSelected && !(drawnSelfSig ?? selfAdmin?.signatureDataUrl))}>
                  {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : selfSelected ? <PenLine className="mr-1.5 h-4 w-4" /> : <Send className="mr-1.5 h-4 w-4" />}
                  {busy ?? (selfSelected ? "Onderteken & verstuur" : "Stuur ter ondertekening")}
                </Button>
              )}
              {quote.status === "intern_ter_ondertekening" && (
                quote.internal_signer_user_id === user?.id ? (
                  <>
                    <Button variant="outline" onClick={resendSignoff} disabled={!!busy}><Send className="mr-1.5 h-4 w-4" /> Opnieuw sturen</Button>
                    <Button onClick={openSignLink} disabled={!!busy}>
                      {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <PenLine className="mr-1.5 h-4 w-4" />} {busy ?? "Beoordelen & ondertekenen"}
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="text-xs text-muted-foreground">Wacht op goedkeuring van {quote.internal_signer_name || "—"}</span>
                    <Button variant="outline" onClick={resendSignoff} disabled={!!busy}>
                      {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />} {busy ?? "Opnieuw sturen"}
                    </Button>
                  </>
                )
              )}
              {quote.status === "verstuurd" && (
                <>
                  <Button variant="outline" className="text-red-600 hover:text-red-700" onClick={() => setRejectOpen(true)} disabled={!!busy} title="Klant zegt nee tegen deze offerte? Leg intern de reden vast.">
                    <XCircle className="mr-1.5 h-4 w-4" /> Afwijzen
                  </Button>
                  <Button variant="outline" onClick={doRevise} disabled={!!busy} title="Klant wil wijzigingen? Maak een concept-kopie met een nieuw nummer; deze versie wordt pas vervangen zodra je de nieuwe verstuurt.">
                    <FilePlus2 className="mr-1.5 h-4 w-4" /> Nieuwe versie
                  </Button>
                  <Button onClick={resendToCustomer} disabled={!!busy}>
                    {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />} {busy ?? "Opnieuw versturen"}
                  </Button>
                </>
              )}
              {quote.status === "afgewezen" && (
                <Button variant="outline" onClick={doRevise} disabled={!!busy} title="Toch een nieuw voorstel? Maak een concept-kopie met een nieuw nummer.">
                  <FilePlus2 className="mr-1.5 h-4 w-4" /> Nieuwe versie
                </Button>
              )}
              {quote.status === "getekend" && !quote.client_id && (
                <Button onClick={() => setCreateClientOpen(true)}><UserPlus className="mr-1.5 h-4 w-4" /> Klant account aanmaken</Button>
              )}
            </div>
          </div>
          {!isConcept && <p className="text-right text-xs text-muted-foreground">Geldig tot {quote.valid_until ?? "—"}</p>}

          <div className="group flex items-center justify-end gap-1">
            {/* Documentopbouw — uitzonderingspad, bewust onopvallend: de knop verschijnt pas bij
                hover/focus (idioom uit CalcSheet) en alleen voor een superadmin op een concept.
                Staat er al iets uit, dan is de knop wél gewoon zichtbaar en mag iedereen die het
                concept bewerkt terugzetten — anders kan een collega een per ongeluk uitgezette
                zin nooit meer herstellen (zinnen laten, anders dan secties, geen naadstrook na). */}
            {(canOmitDoc || canRestoreDoc || docMenuOpen) && (
              <DropdownMenu open={docMenuOpen} onOpenChange={setDocMenuOpen}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    title={canRestoreDoc ? "Documentopbouw — er staat iets uit" : "Documentopbouw"}
                    aria-label="Documentopbouw"
                    disabled={!!busy}
                    className={cn(
                      "h-9 w-9 text-muted-foreground transition-opacity data-[state=open]:opacity-100",
                      !canRestoreDoc && "opacity-0 focus-visible:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100",
                    )}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-h-[70vh] w-80 overflow-y-auto">
                  {/* In herstelstand (geen superadmin, of geen concept-rechten) tonen we alleen wat
                      er weggelaten is — terugzetten mag iedereen, weglaten niet. */}
                  {menuSections.length > 0 && (
                    <>
                      <DropdownMenuLabel className="text-xs font-medium">Onderdelen in het klantdocument</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {menuSections.map((s) => (
                        <DropdownMenuCheckboxItem
                          key={s.id}
                          checked={!s.omitted}
                          onSelect={(e) => e.preventDefault()}
                          onCheckedChange={(v) => setSectionOmitted(s.id, !v)}
                          className="items-start"
                        >
                          <span className="block">
                            <span className="block text-xs">{offerSectionLabel(s.id)}</span>
                            {OFFER_SECTION_WARNINGS[s.id] && (
                              <span className="mt-0.5 block whitespace-normal text-[10px] leading-snug text-muted-foreground">{OFFER_SECTION_WARNINGS[s.id]}</span>
                            )}
                          </span>
                        </DropdownMenuCheckboxItem>
                      ))}
                    </>
                  )}
                  {menuPhrases.length > 0 && (
                    <>
                      {menuSections.length > 0 && <DropdownMenuSeparator />}
                      <DropdownMenuLabel className="text-xs font-medium">Zinnen in het klantdocument</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {menuPhrases.map((p) => (
                        <DropdownMenuCheckboxItem
                          key={p.id}
                          checked={!p.omitted}
                          onSelect={(e) => e.preventDefault()}
                          onCheckedChange={(v) => setPhraseOmitted(p.id, !v)}
                          className="items-start"
                        >
                          <span className="block">
                            {/* line-clamp-2 ZONDER `block`: in Tailwind 3.4 komt de display-plugin ná
                                line-clamp, dus `block` zou display:-webkit-box overschrijven en het
                                lange rekenvoorbeeld het menu laten opblazen. */}
                            <span className="line-clamp-2 whitespace-normal text-xs leading-snug">{p.text}</span>
                            <span className="mt-0.5 block whitespace-normal text-[10px] leading-snug text-muted-foreground">
                              {OFFER_PHRASE_KINDS[p.id]}{OFFER_PHRASE_NOTES[p.id] ? ` · ${OFFER_PHRASE_NOTES[p.id]}` : ""}
                            </span>
                          </span>
                        </DropdownMenuCheckboxItem>
                      ))}
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <p className={cn("px-2 py-1.5 text-[10px] leading-snug", (docSectionsDirty || docPhrasesDirty) ? "font-medium text-amber-700" : "text-muted-foreground")}>
                    {(docSectionsDirty || docPhrasesDirty)
                      ? "Nog niet opgeslagen — klik op Opslaan voordat je verstuurt."
                      : "Uitgeschakelde onderdelen en zinnen gaan niet naar de klant — niet in de PDF en niet in de online offerte."}
                  </p>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={doDelete} disabled={!!busy || del.isPending}>
              <Trash2 className="mr-1.5 h-4 w-4" /> Offerte verwijderen
            </Button>
          </div>
        </div>

        {/* Rechts: live preview (sticky, desktop) */}
        <aside className="hidden lg:block lg:sticky lg:top-4">
          {/* Herstellen kan ELKE sales-gebruiker (klik op de naadstrook) — alleen het weglaten
              zelf zit achter het documentopbouw-menu. Anders zou een ingekorte offerte bij een
              collega belanden die 'm niet meer volledig kan maken. */}
          <OfferPreview
            data={pdfData()}
            signature={previewSignature}
            className="h-[calc(100vh-2rem)]"
            sections={sectionInfo}
            sectionLabels={OFFER_SECTION_LABELS}
            sectionNote={docSectionsDirty ? "niet opgeslagen" : undefined}
            onRestoreSection={isConcept ? (sid) => setSectionOmitted(sid, false) : undefined}
          />
        </aside>
      </div>

      <CreateClientFromQuoteDialog quote={quote} open={createClientOpen} onClose={() => setCreateClientOpen(false)} onCreated={() => navigate("/sales/offertes")} />
      <RejectQuoteDialog quoteId={quote.id} quoteNumber={quote.quote_number ?? ""} open={rejectOpen} onClose={() => setRejectOpen(false)} onRejected={() => quoteQ.refetch()} />
    </div>
  );
}
