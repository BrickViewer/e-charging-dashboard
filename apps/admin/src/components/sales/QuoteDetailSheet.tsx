import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Eye, Plus, Send, Trash2 } from "lucide-react";
import { useQuote, useUpdateQuote, useSendQuote, useDeleteQuote, lineItemsOf, type QuoteLineItem } from "@/hooks/useQuotes";
import { useConfiguratorSettings } from "@/hooks/useConfiguratorSettings";
import { offerPdfBlob, offerPdfBase64, type OfferPdfData } from "@/services/offerPdf";
import { DEFAULT_LEVERING_TEXT } from "@/services/offerTemplate";
import type { OfferDetails, OfferTemplateValues } from "@/services/offerTypes";

const euro = (n: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
const numOr = (v: string): number | null => { const n = Number(String(v).replace(",", ".")); return v.trim() !== "" && Number.isFinite(n) ? n : null; };
const STATUS_LABEL: Record<string, string> = { concept: "Concept", verstuurd: "Verstuurd", getekend: "Getekend", verlopen: "Verlopen", afgewezen: "Afgewezen" };

export function QuoteDetailSheet({ quoteId, open, onOpenChange }: { quoteId: string | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const quoteQ = useQuote(open ? quoteId ?? undefined : undefined);
  const settingsQ = useConfiguratorSettings();
  const update = useUpdateQuote();
  const send = useSendQuote();
  const del = useDeleteQuote();
  const quote = quoteQ.data;
  const tpl = settingsQ.data?.offerTemplate;

  const [items, setItems] = useState<QuoteLineItem[]>([]);
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [withManagement, setWithManagement] = useState(true);
  const [chargeRate, setChargeRate] = useState("");
  const [idleFee, setIdleFee] = useState("");
  const [idleGrace, setIdleGrace] = useState("");
  const [od, setOd] = useState<OfferDetails>({});

  useEffect(() => {
    if (quote) {
      setItems(lineItemsOf(quote));
      setEmail(quote.prospect_email ?? "");
      setNotes(quote.notes ?? "");
      setWithManagement(quote.with_management !== false);
      setChargeRate(quote.charge_rate_per_kwh != null ? String(quote.charge_rate_per_kwh) : "");
      const td = (quote.tariff_data ?? {}) as Record<string, unknown>;
      setIdleFee(td.idleFeePerMinute != null ? String(td.idleFeePerMinute) : "");
      setIdleGrace(td.idleGraceMinutes != null ? String(td.idleGraceMinutes) : "");
      setOd(((quote as unknown as { offer_details?: OfferDetails }).offer_details ?? {}) as OfferDetails);
    }
  }, [quote]);

  // Compacte setters voor de offerte-velden (overrides; leeg = standaard uit instellingen).
  const odStr = (k: keyof OfferDetails) => (od[k] == null ? "" : String(od[k]));
  const setStr = (k: keyof OfferDetails, v: string) => setOd((o) => ({ ...o, [k]: v.trim() === "" ? null : v }));
  const setNum = (k: keyof OfferDetails, v: string) => setOd((o) => ({ ...o, [k]: numOr(v) }));
  const dateVal = (k: keyof OfferDetails) => { const v = od[k]; return typeof v === "string" ? v.slice(0, 10) : ""; };
  const setDate = (k: keyof OfferDetails, v: string) => setOd((o) => ({ ...o, [k]: v || null }));

  if (!quoteId) return null;
  const isConcept = quote?.status === "concept";
  const grandTotal = items.reduce((s, i) => s + (Number(i.total) || 0), 0);

  const setItem = (idx: number, patch: Partial<QuoteLineItem>) =>
    setItems((arr) => arr.map((it, i) => {
      if (i !== idx) return it;
      const next = { ...it, ...patch };
      next.total = Math.round((Number(next.qty) || 0) * (Number(next.unit_price) || 0));
      return next;
    }));

  const save = async () => {
    if (!quote) return;
    const hardware = items[0]?.total ?? 0;
    const installation = items.slice(1).reduce((s, i) => s + (Number(i.total) || 0), 0);
    const tariffData = withManagement && (numOr(chargeRate) != null || numOr(idleFee) != null || numOr(idleGrace) != null)
      ? { chargeTariffPerKwh: numOr(chargeRate), idleFeePerMinute: numOr(idleFee), idleGraceMinutes: numOr(idleGrace) }
      : null;
    try {
      await update.mutateAsync({
        id: quote.id,
        patch: {
          line_items: items as unknown as never,
          total_hardware_cost: hardware,
          total_installation_cost: installation,
          prospect_email: email.trim() || null,
          notes: notes.trim() || null,
          with_management: withManagement,
          charge_rate_per_kwh: withManagement ? numOr(chargeRate) : null,
          tariff_data: tariffData as unknown as never,
          offer_details: od as unknown as never,
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
      company: quote!.prospect_company ?? "",
      contactName: quote!.prospect_contact ?? null,
      numChargePoints: quote!.num_charge_points ?? (Number(items[0]?.qty) || null),
      totalInvestment: grandTotal,
      withManagement,
      durationMonths: numOr(String(contract.durationMonths ?? "")),
      noticeMonths: numOr(String(contract.noticePeriodMonths ?? "")),
      chargeTariffPerKwh: numOr(chargeRate),
      idleFeePerMinute: numOr(idleFee),
      startFeePerSession: numOr(String(td.startFeePerSession ?? "")),
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

  const doSend = async () => {
    if (!quote) return;
    if (grandTotal <= 0 && !window.confirm("Het offertetotaal is €0. Toch versturen?")) return;
    if (isConcept) await save();
    if (!email.trim()) { toast.error("Vul een e-mailadres in"); return; }
    try {
      const pdfBase64 = await offerPdfBase64(pdfData());
      await send.mutateAsync({ quoteId: quote.id, email: email.trim(), pdfBase64 });
      toast.success(`Offerte verstuurd naar ${email.trim()}`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Versturen mislukt"); }
  };

  const doDelete = async () => {
    if (!quote) return;
    if (!window.confirm(`Offerte ${quote.quote_number} definitief verwijderen? Dit kan niet ongedaan worden gemaakt.`)) return;
    try {
      await del.mutateAsync(quote.id);
      toast.success("Offerte verwijderd");
      onOpenChange(false);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Verwijderen mislukt"); }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="ec-scroll w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="text-xl">Offerte {quote?.quote_number ?? ""}</SheetTitle>
        </SheetHeader>

        {!quote ? (
          <p className="mt-6 text-sm text-muted-foreground">Laden…</p>
        ) : (
          <div className="mt-5 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">{quote.prospect_company || "—"}</p>
                <p className="text-[11px] text-muted-foreground">{quote.prospect_contact || ""}</p>
              </div>
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">{STATUS_LABEL[quote.status] ?? quote.status}</span>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium text-foreground">Met beheer</p>
                <p className="text-[11px] text-muted-foreground">e-Charging dashboard + opbrengstdeling. Uit = alleen levering &amp; installatie.</p>
              </div>
              <Switch checked={withManagement} onCheckedChange={setWithManagement} disabled={!isConcept} />
            </div>

            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Offerteregels</p>
              <div className="space-y-2">
                {items.map((it, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_56px_84px_84px_auto] items-center gap-2">
                    <Input className="h-9" value={it.description} disabled={!isConcept} onChange={(e) => setItem(idx, { description: e.target.value })} />
                    <Input className="h-9 text-center" inputMode="numeric" value={it.qty} disabled={!isConcept} onChange={(e) => setItem(idx, { qty: Number(e.target.value) || 0 })} />
                    <Input className="h-9 text-right" inputMode="numeric" value={it.unit_price} disabled={!isConcept} onChange={(e) => setItem(idx, { unit_price: Number(e.target.value) || 0 })} />
                    <span className="text-right text-sm font-semibold">{euro(it.total)}</span>
                    {isConcept && (
                      <button className="text-muted-foreground hover:text-red-600" onClick={() => setItems((a) => a.filter((_, i) => i !== idx))}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
                {isConcept && (
                  <Button variant="outline" size="sm" onClick={() => setItems((a) => [...a, { description: "", qty: 1, unit_price: 0, total: 0 }])}>
                    <Plus className="mr-1.5 h-4 w-4" /> Regel toevoegen
                  </Button>
                )}
              </div>
              <div className="mt-3 flex items-center justify-between border-t pt-3">
                <span className="text-sm font-bold text-foreground">Totaal investering</span>
                <span className="text-lg font-extrabold text-foreground">{euro(grandTotal)}</span>
              </div>
            </div>

            <details className="rounded-lg border" open>
              <summary className="cursor-pointer select-none px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Offerte-gegevens</summary>
              <div className="space-y-4 border-t p-3">
                {/* Adres (komt op de cover + briefpagina) */}
                <div>
                  <p className="mb-1.5 text-[11px] font-semibold text-foreground">Adres</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2 space-y-1"><Label className="text-xs">Straat + nr</Label><Input value={odStr("addressStreet")} disabled={!isConcept} onChange={(e) => setStr("addressStreet", e.target.value)} /></div>
                    <div className="space-y-1"><Label className="text-xs">Postcode</Label><Input value={odStr("addressPostalCode")} disabled={!isConcept} onChange={(e) => setStr("addressPostalCode", e.target.value)} /></div>
                    <div className="space-y-1"><Label className="text-xs">Plaats</Label><Input value={odStr("addressCity")} disabled={!isConcept} onChange={(e) => setStr("addressCity", e.target.value)} /></div>
                  </div>
                </div>
                {/* Briefkoppen */}
                <div>
                  <p className="mb-1.5 text-[11px] font-semibold text-foreground">Briefkoppen</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2 space-y-1"><Label className="text-xs">T.a.v.</Label><Input value={odStr("tav")} placeholder={quote.prospect_contact ?? ""} disabled={!isConcept} onChange={(e) => setStr("tav", e.target.value)} /></div>
                    <div className="space-y-1"><Label className="text-xs">Onze referentie</Label><Input value={odStr("onzeReferentie")} placeholder={quote.quote_number ?? ""} disabled={!isConcept} onChange={(e) => setStr("onzeReferentie", e.target.value)} /></div>
                    <div className="space-y-1"><Label className="text-xs">Offertedatum</Label><Input type="date" value={dateVal("offerDate")} disabled={!isConcept} onChange={(e) => setDate("offerDate", e.target.value)} /></div>
                    <div className="col-span-2 space-y-1"><Label className="text-xs">Locatie</Label><Input value={odStr("object")} placeholder={tpl?.defaultObjectTemplate || ""} disabled={!isConcept} onChange={(e) => setStr("object", e.target.value)} /></div>
                    <div className="col-span-2 space-y-1"><Label className="text-xs">Betreft</Label><Input value={odStr("betreft")} placeholder={tpl?.defaultBetreftTemplate || ""} disabled={!isConcept} onChange={(e) => setStr("betreft", e.target.value)} /></div>
                    <div className="col-span-2 space-y-1"><Label className="text-xs">Aanhef</Label><Input value={odStr("aanhef")} placeholder={tpl?.defaultAanhef || ""} disabled={!isConcept} onChange={(e) => setStr("aanhef", e.target.value)} /></div>
                  </div>
                </div>
                {/* Levering en installatie — bewerkbare vrije tekst (standaard = sjabloontekst) */}
                <div>
                  <p className="mb-1.5 text-[11px] font-semibold text-foreground">Levering en installatie (tekst)</p>
                  <Textarea rows={7} className="text-xs leading-relaxed" value={od.leveringText ?? DEFAULT_LEVERING_TEXT} disabled={!isConcept} onChange={(e) => setStr("leveringText", e.target.value)} />
                  <p className="mt-1 text-[10px] text-muted-foreground">Alinea's scheiden met een lege regel. De rest van de offerte schuift automatisch mee.</p>
                </div>
                {/* Investering */}
                <div>
                  <p className="mb-1.5 text-[11px] font-semibold text-foreground">Investering</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2 space-y-1"><Label className="text-xs">Stelpost graafwerk (€)</Label><Input inputMode="decimal" value={odStr("stelpostGraafwerk")} placeholder={String(tpl?.defaultStelpostGraafwerk ?? "")} disabled={!isConcept} onChange={(e) => setNum("stelpostGraafwerk", e.target.value)} /></div>
                  </div>
                </div>
                {/* Portaal-tarieven ("Een laadpaal die voor u werkt") + service-fee + storingstarieven, in één blok. */}
                <div>
                  <p className="mb-1.5 text-[11px] font-semibold text-foreground">Tarieven &amp; storingen</p>
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
                </div>
                {/* Datums + storingstarieven (overrides) */}
                <div>
                  <p className="mb-1.5 text-[11px] font-semibold text-foreground">Afspraken &amp; datums</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1"><Label className="text-xs">Overleg met</Label><Input value={odStr("overlegNaam")} disabled={!isConcept} onChange={(e) => setStr("overlegNaam", e.target.value)} /></div>
                    <div className="space-y-1"><Label className="text-xs">Overleg d.d.</Label><Input type="date" value={dateVal("overlegDatum")} disabled={!isConcept} onChange={(e) => setDate("overlegDatum", e.target.value)} /></div>
                    <div className="space-y-1"><Label className="text-xs">Ingangsdatum</Label><Input type="date" value={dateVal("ingangsdatum")} disabled={!isConcept} onChange={(e) => setDate("ingangsdatum", e.target.value)} /></div>
                  </div>
                </div>
                {/* Betaling & ondertekenaar (overrides) */}
                <div>
                  <p className="mb-1.5 text-[11px] font-semibold text-foreground">Betaling &amp; ondertekenaar</p>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1"><Label className="text-xs">% bij opdracht</Label><Input inputMode="numeric" value={odStr("betaalBijOpdrachtPct")} placeholder={String(tpl?.betaalBijOpdrachtPct ?? "")} disabled={!isConcept} onChange={(e) => setNum("betaalBijOpdrachtPct", e.target.value)} /></div>
                    <div className="space-y-1"><Label className="text-xs">% bij start</Label><Input inputMode="numeric" value={odStr("betaalBijStartPct")} placeholder={String(tpl?.betaalBijStartPct ?? "")} disabled={!isConcept} onChange={(e) => setNum("betaalBijStartPct", e.target.value)} /></div>
                    <div className="space-y-1"><Label className="text-xs">% na werk</Label><Input inputMode="numeric" value={odStr("betaalNaWerkPct")} placeholder={String(tpl?.betaalNaWerkPct ?? "")} disabled={!isConcept} onChange={(e) => setNum("betaalNaWerkPct", e.target.value)} /></div>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div className="space-y-1"><Label className="text-xs">Ondertekenaar (naam)</Label><Input value={odStr("echargingSignerName")} placeholder={tpl?.echargingSignerName || ""} disabled={!isConcept} onChange={(e) => setStr("echargingSignerName", e.target.value)} /></div>
                    <div className="space-y-1"><Label className="text-xs">Ondertekenaar (functie)</Label><Input value={odStr("echargingSignerFunction")} placeholder={tpl?.echargingSignerFunction || ""} disabled={!isConcept} onChange={(e) => setStr("echargingSignerFunction", e.target.value)} /></div>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">Leeg gelaten velden gebruiken automatisch de standaard uit Configurator &gt; Offerte-sjabloon.</p>
              </div>
            </details>

            <div className="space-y-1.5">
              <Label className="text-xs">Notitie (op de offerte)</Label>
              <Textarea rows={2} value={notes} disabled={!isConcept} onChange={(e) => setNotes(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">E-mail ontvanger</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={quote.status === "getekend"} />
            </div>

            <div className="flex items-center justify-between gap-2 border-t pt-4">
              <div className="flex items-center gap-2">
                {isConcept && <Button variant="outline" onClick={save} disabled={update.isPending}>Opslaan</Button>}
                <Button variant="outline" onClick={doPreview}><Eye className="mr-1.5 h-4 w-4" /> Bekijken</Button>
              </div>
              {quote.status !== "getekend" && (
                <Button onClick={doSend} disabled={send.isPending || update.isPending}>
                  <Send className="mr-1.5 h-4 w-4" />
                  {quote.status === "verstuurd" ? "Opnieuw versturen" : "Versturen"}
                </Button>
              )}
            </div>
            {!isConcept && <p className="-mt-3 text-right text-xs text-muted-foreground">Geldig tot {quote.valid_until ?? "—"}</p>}

            <div className="flex justify-end border-t pt-4">
              <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={doDelete} disabled={del.isPending}>
                <Trash2 className="mr-1.5 h-4 w-4" /> Offerte verwijderen
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
