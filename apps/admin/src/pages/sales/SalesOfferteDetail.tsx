import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { ArrowLeft, Building2, Eye, Loader2, Send, Target, Trash2, PenLine, User, UserPlus } from "lucide-react";
import { useQuote, useUpdateQuote, useSendQuote, useRequestSignoff, useDeleteQuote, useInternalSignLink, lineItemsOf } from "@/hooks/useQuotes";
import { useCompany, usePerson } from "@/hooks/useContacts";
import { useLead } from "@/hooks/useLeads";
import { useConfiguratorSettings } from "@/hooks/useConfiguratorSettings";
import { useAuth } from "@/hooks/useAuth";
import { useSignableAdmins } from "@/hooks/useSignableAdmins";
import { SignerStatusPanel } from "@/components/sales/SignerStatusPanel";
import { CreateClientFromQuoteDialog } from "@/components/sales/CreateClientFromQuoteDialog";
import { ScopeSelector } from "@/components/sales/ScopeSelector";
import { OfferPreview } from "@/components/sales/OfferPreview";
import { CompanyPicker } from "@/components/contacts/CompanyPicker";
import { PersonPicker } from "@/components/contacts/PersonPicker";
import { LeadPicker } from "@/components/contacts/LeadPicker";
import { offerPdfBlob, offerPdfBase64, type OfferPdfData, type OfferSignature } from "@/services/offerPdf";
import { DEFAULT_LEVERING_TEXT } from "@/services/offerTemplate";
import { DEFAULT_OFFER_EMAIL, type OfferDetails, type OfferTemplateValues } from "@/services/offerTypes";
import { supabase } from "@/integrations/supabase/client";

const euro = (n: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
const numOr = (v: string): number | null => { const n = Number(String(v).replace(",", ".")); return v.trim() !== "" && Number.isFinite(n) ? n : null; };
const STATUS_LABEL: Record<string, string> = { concept: "Concept", intern_ter_ondertekening: "Ter ondertekening", verstuurd: "Verstuurd", getekend: "Getekend", verlopen: "Verlopen", afgewezen: "Afgewezen" };

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
  const { user } = useAuth();
  const adminsQ = useSignableAdmins();
  const quote = quoteQ.data;
  const tpl = settingsQ.data?.offerTemplate;
  const admins = adminsQ.data ?? [];
  // Eén prijs i.p.v. losse offerteregels — calculatie gebeurt in Excel.
  const [price, setPrice] = useState("");
  const [email, setEmail] = useState("");
  const [withManagement, setWithManagement] = useState(true);
  const [withInstallation, setWithInstallation] = useState(true);
  const [chargeRate, setChargeRate] = useState("");
  const [idleFee, setIdleFee] = useState("");
  const [idleGrace, setIdleGrace] = useState("");
  const [od, setOd] = useState<OfferDetails>({});
  const [signerUserId, setSignerUserId] = useState<string | null>(null);
  // Eén voortgangs-/busy-vlag over de héle verzendketen → geen dubbele verzending.
  const [busy, setBusy] = useState<string | null>(null);
  const [createClientOpen, setCreateClientOpen] = useState(false);
  const [mobilePreview, setMobilePreview] = useState(false);
  // Aanpasbare body-tekst van de klant-offertemail (voorgevuld met de standaardtekst).
  const [emailMessage, setEmailMessage] = useState(DEFAULT_OFFER_EMAIL);
  // Bewerkbare koppelingen (bedrijf/persoon/lead) — id + label, geseed uit de quote.
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [personId, setPersonId] = useState<string | null>(null);
  const [personName, setPersonName] = useState("");
  const [leadId, setLeadId] = useState<string | null>(null);
  const [leadName, setLeadName] = useState("");
  // Display-/detailgegevens volgen de lokale ids (KvK via company, e-mail via person, lead-naam).
  const company = useCompany(companyId ?? undefined).data;
  const person = usePerson(personId ?? undefined).data;
  const lead = useLead(leadId ?? undefined).data;
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
      // Begin-prijs afleiden uit bestaande regels (som), anders uit de totaalkolommen.
      const liSum = lineItemsOf(quote).reduce((s, i) => s + (Number(i.total) || 0), 0);
      const totalsSum = (Number(quote.total_hardware_cost) || 0) + (Number(quote.total_installation_cost) || 0);
      const initial = liSum || totalsSum;
      setPrice(initial ? String(initial) : "");
      setEmail(quote.prospect_email ?? "");
      setWithManagement(quote.with_management !== false);
      setWithInstallation(quote.with_installation !== false);
      setChargeRate(quote.charge_rate_per_kwh != null ? String(quote.charge_rate_per_kwh) : "");
      const td = (quote.tariff_data ?? {}) as Record<string, unknown>;
      setIdleFee(td.idleFeePerMinute != null ? String(td.idleFeePerMinute) : "");
      setIdleGrace(td.idleGraceMinutes != null ? String(td.idleGraceMinutes) : "");
      const odLoaded = ((quote as unknown as { offer_details?: OfferDetails }).offer_details ?? {}) as OfferDetails;
      setOd(odLoaded);
      setEmailMessage(odLoaded.emailMessage ?? DEFAULT_OFFER_EMAIL);
      setSignerUserId(quote.internal_signer_user_id ?? null);
      setCompanyId(quote.company_id ?? null);
      setCompanyName(quote.prospect_company ?? "");
      setPersonId(quote.person_id ?? null);
      setPersonName(quote.prospect_contact ?? "");
      setLeadId(quote.lead_id ?? null);
      setLeadName("");
    }
  }, [quote]);

  // Compacte setters voor de offerte-velden (overrides; leeg = standaard uit instellingen).
  const odStr = (k: keyof OfferDetails) => (od[k] == null ? "" : String(od[k]));
  const setStr = (k: keyof OfferDetails, v: string) => setOd((o) => ({ ...o, [k]: v.trim() === "" ? null : v }));
  const setNum = (k: keyof OfferDetails, v: string) => setOd((o) => ({ ...o, [k]: numOr(v) }));
  const dateVal = (k: keyof OfferDetails) => { const v = od[k]; return typeof v === "string" ? v.slice(0, 10) : ""; };
  const setDate = (k: keyof OfferDetails, v: string) => setOd((o) => ({ ...o, [k]: v || null }));

  const isConcept = quote?.status === "concept";
  const grandTotal = numOr(price) ?? 0;

  const save = async () => {
    if (!quote) return;
    const p = grandTotal;
    // Eén samenvattende regel (calculatie in Excel); totaal in total_installation_cost zodat
    // de offertelijst + E-Group-handoff het juiste bedrag tonen.
    const lineItems = [{ description: withInstallation ? "Levering & installatie" : "Activatie & onboarding beheer", qty: 1, unit_price: p, total: p }];
    const tariffData = withManagement && (numOr(chargeRate) != null || numOr(idleFee) != null || numOr(idleGrace) != null)
      ? { chargeTariffPerKwh: numOr(chargeRate), idleFeePerMinute: numOr(idleFee), idleGraceMinutes: numOr(idleGrace) }
      : null;
    try {
      await update.mutateAsync({
        id: quote.id,
        patch: {
          line_items: lineItems as unknown as never,
          total_hardware_cost: 0,
          total_installation_cost: p,
          prospect_email: email.trim() || null,
          prospect_company: companyName.trim() || null,
          prospect_contact: personName.trim() || null,
          company_id: companyId,
          person_id: personId,
          lead_id: leadId,
          with_management: withManagement,
          with_installation: withInstallation,
          charge_rate_per_kwh: withManagement ? numOr(chargeRate) : null,
          tariff_data: tariffData as unknown as never,
          offer_details: { ...od, emailMessage: emailMessage.trim() || null } as unknown as never,
          internal_signer_user_id: signerUserId,
        },
      });
      toast.success("Offerte opgeslagen");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Opslaan mislukt"); }
  };

  const pdfData = (): OfferPdfData => {
    const snap = (quote!.calculation_snapshot ?? {}) as Record<string, unknown>;
    const pi = (snap.pricing_input ?? {}) as Record<string, unknown>;
    const contract = (pi.contract ?? {}) as Record<string, unknown>;
    const td = (quote!.tariff_data ?? {}) as Record<string, unknown>;
    return {
      quoteNumber: quote!.quote_number ?? "",
      date: quote!.sent_at ?? null,
      company: companyName || "",
      contactName: personName || null,
      numChargePoints: quote!.num_charge_points ?? null,
      totalInvestment: grandTotal,
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
      offerDetails: od,
      // zod's .default() maakt de velden optioneel in het infer-type; runtime is alles gevuld.
      offerTemplate: tpl as OfferTemplateValues | undefined,
    };
  };

  const doPreview = async () => {
    if (!quote) return;
    try {
      window.open(URL.createObjectURL(await offerPdfBlob(pdfData())), "_blank");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Preview mislukt"); }
  };

  const selfAdmin = admins.find((a) => a.userId === user?.id) ?? null;
  const selectedAdmin = admins.find((a) => a.userId === signerUserId) ?? null;
  const selfSelected = !!signerUserId && signerUserId === user?.id;

  const echargingFromQuote = (): OfferSignature => ({
    echargingSignatureDataUrl: quote?.internal_signature_data_url ?? null,
    echargingSignerName: quote?.internal_signer_name ?? null,
    echargingSignerFunction: quote?.internal_signer_function ?? null,
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
    if (!selfAdmin.signatureDataUrl) { toast.error("Stel eerst je handtekening in bij Instellingen › Mijn handtekening"); return; }
    if (!email.trim()) { toast.error("Vul een e-mailadres in"); return; }
    if (grandTotal <= 0 && !window.confirm("Het offertetotaal is €0. Toch versturen?")) return;
    if (!window.confirm(`Offerte ${quote.quote_number} ondertekenen en versturen naar ${email.trim()}?\nTotaal: ${euro(grandTotal)}`)) return;
    try {
      setBusy("Opslaan…");
      await save();
      setBusy("Document voorbereiden…");
      const pdfBase64 = await offerPdfBase64(pdfData(), {
        echargingSignatureDataUrl: selfAdmin.signatureDataUrl,
        echargingSignerName: selfAdmin.fullName,
        echargingSignerFunction: selfAdmin.signerTitle,
      });
      setBusy("Versturen…");
      await send.mutateAsync({ quoteId: quote.id, email: email.trim(), pdfBase64, internalSelfSign: true });
      toast.success(`Ondertekend en verstuurd naar ${email.trim()}`);
      setBusy("Dossier bijwerken…");
      await updateSharepointOff(pdfBase64, "De offerte is verstuurd");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Versturen mislukt"); }
    finally { setBusy(null); }
  };

  // Ander tekent: stuur ter ondertekening (mail met link).
  const sendForSignoff = async () => {
    if (busy || !quote || !selectedAdmin) return;
    if (!selectedAdmin.hasSignature) { toast.error(`${selectedAdmin.fullName} heeft nog geen handtekening ingesteld`); return; }
    if (!window.confirm(`Offerte ${quote.quote_number} ter ondertekening sturen naar ${selectedAdmin.fullName}?`)) return;
    try {
      setBusy("Opslaan…");
      await save();
      setBusy("Document voorbereiden…");
      const offPdfBase64 = await offerPdfBase64(pdfData());
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
    if (!window.confirm(`Offerte ${quote.quote_number} opnieuw versturen naar ${email.trim()}?`)) return;
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

  const previewSignature = isConcept ? undefined : echargingFromQuote();

  return (
    <div className="animate-fade-in">
      {backBtn}

      {/* Kop */}
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">Offerte {quote.quote_number ?? ""}</h1>
            <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium">{STATUS_LABEL[quote.status ?? ""] ?? quote.status}</span>
          </div>
          {quote.project_location_id ? (
            <Link to={`/sales/objecten/${quote.project_location_id}`} className="text-xs text-primary hover:underline">Object / locatie bekijken →</Link>
          ) : null}
        </div>
        <Button variant="outline" size="sm" className="lg:hidden" onClick={() => setMobilePreview((v) => !v)}>
          <Eye className="mr-1.5 h-4 w-4" /> {mobilePreview ? "Verberg voorbeeld" : "Toon voorbeeld"}
        </Button>
      </div>

      {/* Mobiel: voorbeeld als toggle */}
      {mobilePreview && (
        <div className="mt-4 lg:hidden">
          <OfferPreview data={pdfData()} signature={previewSignature} className="h-[80vh]" />
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,540px)] lg:items-start">
        {/* Links: formulier */}
        <div className="min-w-0 space-y-4">
          <Section title="Bedrijf & scope">
            <div className="mb-3">
              <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                {companyName || personName || "—"}
                {!companyId ? <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Particulier</span> : null}
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
              onChange={({ withInstallation: wi, withManagement: wm }) => { setWithInstallation(wi); setWithManagement(wm); }}
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
                  <PersonPicker value={personId} valueLabel={personName || null} companyId={companyId} onChange={(id, p) => { setPersonId(id); setPersonName(id ? (p?.full_name ?? personName) : ""); }} />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between"><Label className="text-xs">Lead</Label>{leadId ? <Link to={`/sales/leads?lead=${leadId}`} className="text-[11px] text-primary hover:underline">bekijken →</Link> : null}</div>
                  <LeadPicker value={leadId} valueLabel={leadName || null} onChange={(id, label) => { setLeadId(id); setLeadName(id ? (label ?? leadName) : ""); }} />
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
              </div>
            )}
          </Section>

          <Section title="Briefkop & adres">
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2 space-y-1"><Label className="text-xs">Straat + nr</Label><Input value={odStr("addressStreet")} disabled={!isConcept} onChange={(e) => setStr("addressStreet", e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">Postcode</Label><Input value={odStr("addressPostalCode")} disabled={!isConcept} onChange={(e) => setStr("addressPostalCode", e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">Plaats</Label><Input value={odStr("addressCity")} disabled={!isConcept} onChange={(e) => setStr("addressCity", e.target.value)} /></div>
              <div className="col-span-2 space-y-1"><Label className="text-xs">T.a.v.</Label><Input value={odStr("tav")} placeholder={quote.prospect_contact ?? ""} disabled={!isConcept} onChange={(e) => setStr("tav", e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">Onze referentie</Label><Input value={odStr("onzeReferentie")} placeholder={quote.quote_number ?? ""} disabled={!isConcept} onChange={(e) => setStr("onzeReferentie", e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">Offertedatum</Label><Input type="date" value={dateVal("offerDate")} disabled={!isConcept} onChange={(e) => setDate("offerDate", e.target.value)} /></div>
              <div className="col-span-2 space-y-1"><Label className="text-xs">Locatie</Label><Input value={odStr("object")} placeholder={tpl?.defaultObjectTemplate || ""} disabled={!isConcept} onChange={(e) => setStr("object", e.target.value)} /></div>
              <div className="col-span-2 space-y-1"><Label className="text-xs">Betreft</Label><Input value={odStr("betreft")} placeholder={tpl?.defaultBetreftTemplate || ""} disabled={!isConcept} onChange={(e) => setStr("betreft", e.target.value)} /></div>
              <div className="col-span-2 space-y-1"><Label className="text-xs">Aanhef</Label><Input value={odStr("aanhef")} placeholder={tpl?.defaultAanhef || ""} disabled={!isConcept} onChange={(e) => setStr("aanhef", e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">Witruimte boven datum (px)</Label><Input inputMode="numeric" value={odStr("dateGapPx")} placeholder="96" disabled={!isConcept} onChange={(e) => setNum("dateGapPx", e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">Witruimte boven aanhef (px)</Label><Input inputMode="numeric" value={odStr("aanhefGapPx")} placeholder="84" disabled={!isConcept} onChange={(e) => setNum("aanhefGapPx", e.target.value)} /></div>
              <p className="col-span-2 text-[10px] text-muted-foreground">Standaard 96 / 84 px. Bij lange teksten worden deze automatisch verkleind (tot min. 16 px) zodat het investeringsblok boven de voettekst blijft; een eigen waarde geldt als maximum.</p>
            </div>
          </Section>

          {withInstallation ? (
            <Section title="Levering & installatie" hint="Het belangrijkste, meest variërende deel — alinea's scheiden met een lege regel. De rest van de offerte schuift automatisch mee.">
              <Textarea ref={leveringRef} className="leading-relaxed min-h-[8rem] max-h-[60vh] resize-none overflow-y-auto" value={od.leveringText ?? DEFAULT_LEVERING_TEXT} disabled={!isConcept} onChange={(e) => setStr("leveringText", e.target.value)} />
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="space-y-1"><Label className="text-xs">Prijs (excl. BTW)</Label><Input inputMode="decimal" value={price} placeholder="0" disabled={!isConcept} onChange={(e) => setPrice(e.target.value)} /></div>
                <div className="space-y-1"><Label className="text-xs">Stelpost graafwerk (€)</Label><Input inputMode="decimal" value={odStr("stelpostGraafwerk")} placeholder={String(tpl?.defaultStelpostGraafwerk ?? "")} disabled={!isConcept} onChange={(e) => setNum("stelpostGraafwerk", e.target.value)} /></div>
              </div>
            </Section>
          ) : (
            <Section title="Eenmalige kosten" hint="De eenmalige activatie-/onboardingkost voor het beheer van de bestaande laadpalen.">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1"><Label className="text-xs">Activatiekosten (excl. BTW)</Label><Input inputMode="decimal" value={price} placeholder="0" disabled={!isConcept} onChange={(e) => setPrice(e.target.value)} /></div>
              </div>
            </Section>
          )}

          {withManagement && (
            <Section title="Tarieven & storingen">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1"><Label className="text-xs">Laadtarief / kWh (€)</Label><Input inputMode="decimal" value={chargeRate} disabled={!isConcept} onChange={(e) => setChargeRate(e.target.value)} /></div>
                <div className="space-y-1"><Label className="text-xs">Blokkeertarief / min (€)</Label><Input inputMode="decimal" value={idleFee} disabled={!isConcept} onChange={(e) => setIdleFee(e.target.value)} /></div>
                <div className="space-y-1"><Label className="text-xs">Starttarief / keer (€)</Label><Input inputMode="decimal" value={odStr("startFeePerSession")} disabled={!isConcept} onChange={(e) => setNum("startFeePerSession", e.target.value)} /></div>
                <div className="space-y-1"><Label className="text-xs">Gratis minuten</Label><Input inputMode="numeric" value={idleGrace} disabled={!isConcept} onChange={(e) => setIdleGrace(e.target.value)} /></div>
                <div className="space-y-1"><Label className="text-xs">Service-fee / kWh (€)</Label><Input inputMode="decimal" value={odStr("serviceFeePerKwh")} placeholder={String(tpl?.serviceFeePerKwh ?? "")} disabled={!isConcept} onChange={(e) => setNum("serviceFeePerKwh", e.target.value)} /></div>
                <div className="space-y-1"><Label className="text-xs">Servicemonteur / uur (€)</Label><Input inputMode="decimal" value={odStr("servicemonteurPerHour")} placeholder={String(tpl?.servicemonteurPerHour ?? "")} disabled={!isConcept} onChange={(e) => setNum("servicemonteurPerHour", e.target.value)} /></div>
                <div className="space-y-1"><Label className="text-xs">Voorrijkosten / km (€)</Label><Input inputMode="decimal" value={odStr("voorrijkostenPerKm")} placeholder={String(tpl?.voorrijkostenPerKm ?? "")} disabled={!isConcept} onChange={(e) => setNum("voorrijkostenPerKm", e.target.value)} /></div>
                <div className="space-y-1"><Label className="text-xs">Toeslag werkuur (€)</Label><Input inputMode="decimal" value={odStr("toeslagWerkuur")} placeholder={String(tpl?.toeslagWerkuur ?? "")} disabled={!isConcept} onChange={(e) => setNum("toeslagWerkuur", e.target.value)} /></div>
                <div className="space-y-1"><Label className="text-xs">Activatiekosten / socket (€)</Label><Input inputMode="decimal" value={odStr("activatiekostenPerSocket")} placeholder={String(tpl?.activatiekostenPerSocket ?? "")} disabled={!isConcept} onChange={(e) => setNum("activatiekostenPerSocket", e.target.value)} /></div>
              </div>
            </Section>
          )}

          <Section title="Datums & betaling" hint="Leeg gelaten velden gebruiken automatisch de standaard uit Configurator › Offerte-sjabloon.">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1"><Label className="text-xs">Overleg met</Label><Input value={odStr("overlegNaam")} disabled={!isConcept} onChange={(e) => setStr("overlegNaam", e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">Overleg d.d.</Label><Input type="date" value={dateVal("overlegDatum")} disabled={!isConcept} onChange={(e) => setDate("overlegDatum", e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">Ingangsdatum</Label><Input type="date" value={dateVal("ingangsdatum")} disabled={!isConcept || withInstallation} onChange={(e) => setDate("ingangsdatum", e.target.value)} /></div>
            </div>
            {withInstallation
              ? <p className="mt-1 text-[10px] text-muted-foreground">Bij installatie loopt het contract automatisch vanaf de 1e van de maand na de opleverdatum — ingangsdatum niet nodig.</p>
              : <p className="mt-1 text-[10px] text-muted-foreground">Alleen beheer: vul hier de vaste ingangsdatum in.</p>}
            <div className="mt-2 grid grid-cols-3 gap-2">
              <div className="space-y-1"><Label className="text-xs">% bij opdracht</Label><Input inputMode="numeric" value={odStr("betaalBijOpdrachtPct")} placeholder={String(tpl?.betaalBijOpdrachtPct ?? "")} disabled={!isConcept} onChange={(e) => setNum("betaalBijOpdrachtPct", e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">% bij start</Label><Input inputMode="numeric" value={odStr("betaalBijStartPct")} placeholder={String(tpl?.betaalBijStartPct ?? "")} disabled={!isConcept} onChange={(e) => setNum("betaalBijStartPct", e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">% na werk</Label><Input inputMode="numeric" value={odStr("betaalNaWerkPct")} placeholder={String(tpl?.betaalNaWerkPct ?? "")} disabled={!isConcept} onChange={(e) => setNum("betaalNaWerkPct", e.target.value)} /></div>
            </div>
          </Section>

          <Section title="E-mail aan de klant">
            <div className="space-y-3">
              <div className="space-y-1.5"><Label className="text-xs">E-mail ontvanger</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={quote.status === "getekend"} /></div>
              <div className="space-y-1.5">
                <Label className="text-xs">E-mailbericht aan de klant</Label>
                <Textarea rows={6} className="leading-relaxed" value={emailMessage} disabled={!isConcept} onChange={(e) => setEmailMessage(e.target.value)} />
                <p className="text-[10px] text-muted-foreground">De aanhef, de knop "Offerte bekijken en ondertekenen", de geldigheid en de ondertekening worden automatisch toegevoegd. Alinea's scheiden met een lege regel.</p>
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
          </Section>

          {/* Acties */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2">
              {isConcept && <Button variant="outline" onClick={save} disabled={!!busy || update.isPending}>Opslaan</Button>}
              <Button variant="outline" onClick={doPreview} disabled={!!busy}><Eye className="mr-1.5 h-4 w-4" /> PDF openen</Button>
            </div>
            <div className="flex items-center gap-2">
              {quote.status === "concept" && (
                <Button onClick={selfSelected ? signAndSend : sendForSignoff} disabled={!!busy || !signerUserId || !selectedAdmin?.hasSignature}>
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
                <Button onClick={resendToCustomer} disabled={!!busy}>
                  {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />} {busy ?? "Opnieuw versturen"}
                </Button>
              )}
              {quote.status === "getekend" && !quote.client_id && (
                <Button onClick={() => setCreateClientOpen(true)}><UserPlus className="mr-1.5 h-4 w-4" /> Klant account aanmaken</Button>
              )}
            </div>
          </div>
          {!isConcept && <p className="text-right text-xs text-muted-foreground">Geldig tot {quote.valid_until ?? "—"}</p>}

          <div className="flex justify-end">
            <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={doDelete} disabled={!!busy || del.isPending}>
              <Trash2 className="mr-1.5 h-4 w-4" /> Offerte verwijderen
            </Button>
          </div>
        </div>

        {/* Rechts: live preview (sticky, desktop) */}
        <aside className="hidden lg:block lg:sticky lg:top-4">
          <OfferPreview data={pdfData()} signature={previewSignature} className="h-[calc(100vh-2rem)]" />
        </aside>
      </div>

      <CreateClientFromQuoteDialog quote={quote} open={createClientOpen} onClose={() => setCreateClientOpen(false)} onCreated={() => navigate("/sales/offertes")} />
    </div>
  );
}
