import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Calculator, ChevronsUpDown, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useQuote } from "@/hooks/useQuotes";
import { useQuoteCalculation, useSaveQuoteCalculation } from "@/hooks/useQuoteCalculation";
import { useCatalogProducts, netCost, sellPrice, catalogCategoryLabel, type CatalogProduct } from "@/hooks/useCatalogProducts";
import { computeTotals, lineTotals, type CalcHeaderDraft, type CalcLineDraft, type CalcSummary } from "@/services/calcTypes";
import { applyCalcToQuote } from "@/services/calcPrefill";
import { scopeFromFlags, SCOPE_LABEL } from "@/lib/quoteScope";
import { supabase } from "@/integrations/supabase/client";
import { formatEuro as euro } from "@/services/calculations";
import { calcRetourKm, resolveQuoteAddress } from "@/services/calcDistance";

const num = (s: string | number) => {
  const n = Number(String(s).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

const DEFAULT_HEADER: CalcHeaderDraft = {
  hourly_rate: 60,
  km_price: 0.75,
  retour_km: 0,
  travel_days: 1,
  stelpost_graafwerk: 0,
  stelpost_note: "",
};

/** Numeriek invoerveld dat lokaal typwerk (komma's, lege string) tolereert. */
function NumField({ value, onCommit, className, disabled }: { value: number; onCommit: (n: number) => void; className?: string; disabled?: boolean }) {
  const [text, setText] = useState(String(value));
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setText(String(value));
  }, [value]);
  return (
    <Input
      inputMode="decimal"
      className={className}
      value={text}
      disabled={disabled}
      onFocus={() => (editing.current = true)}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        editing.current = false;
        onCommit(num(text));
      }}
    />
  );
}

export default function SalesOfferteCalculatie() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const quote = useQuote(id);
  const calcQuery = useQuoteCalculation(id);
  const catalog = useCatalogProducts();
  const save = useSaveQuoteCalculation();

  const [lines, setLines] = useState<CalcLineDraft[]>([]);
  const [header, setHeader] = useState<CalcHeaderDraft>(DEFAULT_HEADER);
  const [summary, setSummary] = useState<CalcSummary>({});
  const [offerPrice, setOfferPrice] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [kmBusy, setKmBusy] = useState(false);
  const [kmHint, setKmHint] = useState<string | null>(null);
  const seeded = useRef(false);
  const kmAutoDone = useRef(false);

  // Bestaande calculatie in de editor laden (eenmalig)
  useEffect(() => {
    if (seeded.current || !calcQuery.data) return;
    seeded.current = true;
    const { calc, lines: dbLines } = calcQuery.data;
    if (!calc) return;
    setHeader({
      hourly_rate: Number(calc.hourly_rate),
      km_price: Number(calc.km_price),
      retour_km: Number(calc.retour_km),
      travel_days: Number(calc.travel_days),
      stelpost_graafwerk: Number(calc.stelpost_graafwerk),
      stelpost_note: calc.stelpost_note ?? "",
    });
    setSummary((calc.summary ?? {}) as CalcSummary);
    setOfferPrice(calc.offer_price_rounded == null ? null : Number(calc.offer_price_rounded));
    setLines(
      dbLines.map((l, i) => ({
        id: l.id,
        line_type: l.line_type as CalcLineDraft["line_type"],
        product_id: l.product_id,
        description: l.description,
        category: l.category,
        supplier: l.supplier,
        order_number: l.order_number,
        unit: l.unit,
        qty: Number(l.qty),
        unit_gross: Number(l.unit_gross),
        unit_cost: Number(l.unit_cost),
        unit_sell: Number(l.unit_sell),
        unit_hours: Number(l.unit_hours),
        position: i,
      })),
    );
  }, [calcQuery.data]);

  const totals = useMemo(() => computeTotals(lines, header), [lines, header]);
  // Effectieve offerteprijs: handmatig afgerond bedrag, anders het voorstel.
  const effectiveOfferPrice = offerPrice ?? totals.suggestedOfferPrice;
  const isConcept = quote.data?.status === "concept";

  // Kilometers automatisch: rijafstand kantoor (Zaltbommel) ↔ projectadres.
  const computeKm = async (manual: boolean) => {
    if (!quote.data) return;
    setKmBusy(true);
    try {
      const address = await resolveQuoteAddress(quote.data);
      if (!address) {
        if (manual) toast.error("Geen projectadres gevonden op de offerte");
        return;
      }
      const result = await calcRetourKm(address);
      if (!result) {
        if (manual) toast.error("Afstand kon niet worden berekend — vul de kilometers handmatig in");
        return;
      }
      setHeader((h) => ({ ...h, retour_km: result.retourKm }));
      setKmHint(`Berekend: kantoor ↔ ${result.targetAddress}`);
    } finally {
      setKmBusy(false);
    }
  };

  // Eénmalig automatisch berekenen bij openen, alleen zolang er nog niets is ingevuld.
  useEffect(() => {
    if (kmAutoDone.current || !quote.data || !calcQuery.data) return;
    if (quote.data.status !== "concept") return;
    kmAutoDone.current = true;
    const existing = calcQuery.data.calc ? Number(calcQuery.data.calc.retour_km) : 0;
    if (existing > 0) return;
    void computeKm(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote.data, calcQuery.data]);
  const scope = quote.data ? scopeFromFlags(quote.data.with_installation !== false, quote.data.with_management !== false) : null;
  const suggestSkip = scope === "alleen_beheer";

  const addProduct = (p: CatalogProduct) => {
    setLines((prev) => [
      ...prev,
      {
        line_type: p.kind === "arbeid" ? "uren" : "product",
        product_id: p.id,
        description: p.name,
        category: p.category,
        supplier: p.supplier,
        order_number: p.order_number,
        unit: p.unit,
        qty: 1,
        unit_gross: Number(p.gross_price),
        unit_cost: netCost(p),
        unit_sell: p.kind === "arbeid" ? 0 : sellPrice(p),
        unit_hours: Number(p.install_time_hours),
        position: prev.length,
      },
    ]);
    setPickerOpen(false);
  };

  const addFree = (type: "vrij" | "uren") =>
    setLines((prev) => [
      ...prev,
      {
        line_type: type,
        product_id: null,
        description: "",
        category: type === "uren" ? "arbeid" : "overig",
        supplier: null,
        order_number: null,
        unit: type === "uren" ? "uur" : "stuk",
        qty: 1,
        unit_gross: 0,
        unit_cost: 0,
        unit_sell: 0,
        unit_hours: type === "uren" ? 1 : 0,
        position: prev.length,
      },
    ]);

  const patchLine = (idx: number, patch: Partial<CalcLineDraft>) =>
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const removeLine = (idx: number) => setLines((prev) => prev.filter((_l, i) => i !== idx));

  const doSave = async (status: "concept" | "afgerond" | "overgeslagen", summaryOverride?: CalcSummary) => {
    if (!quote.data || !id) return null;
    return save.mutateAsync({
      quoteId: id,
      organizationId: quote.data.organization_id,
      status,
      header,
      summary: summaryOverride ?? summary,
      totals,
      offerPriceRounded: status === "overgeslagen" ? null : effectiveOfferPrice,
      lines: status === "overgeslagen" ? [] : lines,
    });
  };

  const onSkip = async () => {
    setBusy(true);
    try {
      await doSave("overgeslagen");
      navigate(`/sales/offertes/${id}`);
    } catch (e) {
      toast.error(`Overslaan mislukt: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  };

  const onSaveConcept = async () => {
    setBusy(true);
    try {
      await doSave("concept");
      toast.success("Calculatie opgeslagen");
    } catch (e) {
      toast.error(`Opslaan mislukt: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  };

  const onFinalize = async () => {
    if (!quote.data || !id) return;
    if (lines.length === 0) {
      toast.error("Voeg eerst regels toe, of kies Overslaan");
      return;
    }
    setBusy(true);
    try {
      // Eerst de offerte voorvullen (verse offer_details; regels/prijs/tekst),
      // daarna pas de calc op 'afgerond' — faalt de tweede stap, dan is
      // her-afronden voldoende om te herstellen (andersom zou de detailpagina
      // een 'afgeronde' calc tonen zonder dat de offerte gevuld is).
      const { nextSummary } = await applyCalcToQuote({
        quoteId: id,
        lines,
        header,
        summary,
        totals,
        offerPrice: effectiveOfferPrice,
      });
      setSummary(nextSummary);
      await doSave("afgerond", nextSummary);
      toast.success("Calculatie afgerond — offerte voorgevuld");

      // Interne CALC-xlsx naar het SharePoint-dossier — best-effort (zoals de
      // OFF-upload): falen blokkeert de flow niet.
      try {
        const { buildCalcXlsx, bytesToBase64 } = await import("@/services/calcXlsx");
        const bytes = await buildCalcXlsx({
          quoteNumber: quote.data.quote_number ?? "",
          projectLabel: quote.data.prospect_company || quote.data.prospect_contact || "",
          header,
          summary: nextSummary,
          totals,
          offerPrice: effectiveOfferPrice,
          lines,
        });
        const { data: up, error: upErr } = await supabase.functions.invoke<{ status: string; skipped?: string; calc_web_url?: string }>(
          "quote-sharepoint-calc",
          { body: { quote_id: id, calc_xlsx_base64: bytesToBase64(bytes) } },
        );
        if (upErr) throw upErr;
        if (up?.status === "ok" && !up.skipped) toast.success("Calculatie-Excel in SharePoint-dossier gezet");
      } catch (e) {
        toast.warning(`Calculatie afgerond, maar SharePoint-upload mislukt: ${e instanceof Error ? e.message : e}`);
      }

      navigate(`/sales/offertes/${id}`);
    } catch (e) {
      toast.error(`Afronden mislukt: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  };

  if (quote.isLoading || calcQuery.isLoading) {
    return <Skeleton className="h-96 w-full rounded-xl" />;
  }
  if (!quote.data) {
    return <div className="p-10 text-center text-muted-foreground">Offerte niet gevonden.</div>;
  }

  const frozen = !isConcept;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/sales/offertes/${id}`)}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Offerte
          </Button>
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold">
              <Calculator className="h-5 w-5 text-primary" /> Calculatie — {quote.data.quote_number}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {quote.data.prospect_company || quote.data.prospect_contact || "—"}
              {scope ? ` · ${SCOPE_LABEL[scope]}` : ""}
              {frozen ? " · bevroren (offerte is niet meer in concept)" : ""}
            </p>
          </div>
        </div>
        {!frozen && (
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onSkip} disabled={busy}>Overslaan</Button>
            <Button variant="outline" onClick={onSaveConcept} disabled={busy}>Opslaan</Button>
            <Button onClick={onFinalize} disabled={busy}>Calculatie afronden</Button>
          </div>
        )}
      </div>

      {suggestSkip && !frozen && (
        <div className="rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Deze offerte is <strong>alleen beheer</strong> — er valt meestal niets te calculeren.{" "}
          <button type="button" className="font-semibold underline underline-offset-2" onClick={onSkip}>
            Calculatie overslaan
          </button>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        {/* Regels */}
        <div className="space-y-4">
          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="border-b bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2.5 font-medium">Artikel / omschrijving</th>
                    <th className="w-20 px-2 py-2.5 text-right font-medium">Aantal</th>
                    <th className="w-24 px-2 py-2.5 text-right font-medium">Kost/eenh.</th>
                    <th className="w-24 px-2 py-2.5 text-right font-medium">Verkoop/eenh.</th>
                    <th className="w-20 px-2 py-2.5 text-right font-medium">Uur/eenh.</th>
                    <th className="w-24 px-2 py-2.5 text-right font-medium">Totaal</th>
                    <th className="w-10 px-2 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, i) => {
                    const t = lineTotals(line);
                    return (
                      <tr key={i} className="border-b align-middle last:border-0">
                        <td className="px-3 py-1.5">
                          <Input
                            className="h-8 border-transparent bg-transparent px-1 focus-visible:border-input"
                            value={line.description}
                            placeholder={line.line_type === "uren" ? "Omschrijving werkzaamheden…" : "Omschrijving…"}
                            disabled={frozen}
                            onChange={(e) => patchLine(i, { description: e.target.value })}
                          />
                          <div className="px-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                            {line.line_type === "uren" ? "Uren" : line.line_type === "vrij" ? "Vrije regel" : catalogCategoryLabel(line.category)}
                            {line.supplier ? ` · ${line.supplier}` : ""}
                            {line.order_number ? ` · ${line.order_number}` : ""}
                            {` · per ${line.unit}`}
                          </div>
                        </td>
                        <td className="px-2 py-1.5">
                          <NumField className="h-8 text-right tabular-nums" value={line.qty} disabled={frozen} onCommit={(n) => patchLine(i, { qty: n })} />
                        </td>
                        <td className="px-2 py-1.5">
                          {line.line_type === "uren" ? (
                            <div className="pr-1 text-right text-muted-foreground">—</div>
                          ) : (
                            <NumField className="h-8 text-right tabular-nums" value={line.unit_cost} disabled={frozen} onCommit={(n) => patchLine(i, { unit_cost: n })} />
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          {line.line_type === "uren" ? (
                            <div className="pr-1 text-right text-muted-foreground">—</div>
                          ) : (
                            <NumField className="h-8 text-right tabular-nums" value={line.unit_sell} disabled={frozen} onCommit={(n) => patchLine(i, { unit_sell: n })} />
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          <NumField className="h-8 text-right tabular-nums" value={line.unit_hours} disabled={frozen} onCommit={(n) => patchLine(i, { unit_hours: n })} />
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {line.line_type === "uren" ? `${t.hours.toLocaleString("nl-NL")} u` : euro(t.sell)}
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          {!frozen && (
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => removeLine(i)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {lines.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                        Nog geen regels — kies een artikel uit de catalogus of voeg een vrije regel toe.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {!frozen && (
            <div className="flex flex-wrap items-center gap-2">
              <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline">
                    <Plus className="mr-2 h-4 w-4" /> Artikel uit catalogus <ChevronsUpDown className="ml-2 h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[420px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Zoek artikel…" />
                    <CommandList>
                      <CommandEmpty>Geen artikelen gevonden.</CommandEmpty>
                      {["laadpalen", "installatiemateriaal", "overig", "arbeid"].map((cat) => {
                        const items = (catalog.data ?? []).filter((p) => p.category === cat);
                        if (items.length === 0) return null;
                        return (
                          <CommandGroup key={cat} heading={catalogCategoryLabel(cat)}>
                            {items.map((p) => (
                              <CommandItem key={p.id} value={`${p.name} ${p.supplier ?? ""} ${p.order_number ?? ""}`} onSelect={() => addProduct(p)}>
                                <span className="flex-1 truncate">{p.name}</span>
                                <span className="ml-2 tabular-nums text-xs text-muted-foreground">
                                  {p.kind === "arbeid" ? `${Number(p.gross_price)}/u` : euro(sellPrice(p))}
                                </span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        );
                      })}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <Button variant="outline" onClick={() => addFree("vrij")}><Plus className="mr-2 h-4 w-4" /> Vrije regel</Button>
              <Button variant="outline" onClick={() => addFree("uren")}><Plus className="mr-2 h-4 w-4" /> Urenregel</Button>
            </div>
          )}

          {/* Offertetekst — vrije tekst van de invuller; wordt bij Afronden de
              "Levering en installatie"-tekst op de offerte (en komt op het
              xlsx-voorblad, zoals het Offertetekst-blok in de oude Excel) */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Offertetekst — Levering en installatie</CardTitle>
              <p className="text-[11px] text-muted-foreground">
                Schrijf hier de tekst zoals hij op de offerte moet komen (alinea's scheiden met een lege regel).
                Bij afronden wordt dit de "Levering en installatie"-tekst; op de offertepagina kun je hem daarna nog bijwerken.
              </p>
            </CardHeader>
            <CardContent>
              <Textarea
                className="min-h-[9rem] leading-relaxed"
                placeholder={"Het leveren, monteren en aansluiten van 2 stuks Zaptec Pro gemonteerd op 1 nieuwe laadpaal.\n\nMeterkast wordt uitgebreid met 2 eindgroepen van 32A."}
                value={summary.leveringText ?? ""}
                disabled={frozen}
                onChange={(e) => setSummary({ ...summary, leveringText: e.target.value })}
              />
            </CardContent>
          </Card>
        </div>

        {/* Kop-parameters + totalen — alles onder elkaar, in rekenvolgorde */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Uren & montage</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">Uurloon (€ per uur)</Label>
                <NumField className="h-8" value={header.hourly_rate} disabled={frozen} onCommit={(n) => setHeader({ ...header, hourly_rate: n })} />
              </div>
              <Row label="Montage-uren (uit de regels)" value={`${totals.hoursTotal.toLocaleString("nl-NL")} u`} muted />
              <Row label="Montagebedrag" value={euro(totals.laborSell)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Voorrijkosten</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">Retour project (km)</Label>
                <div className="flex items-center gap-2">
                  <NumField className="h-8 flex-1" value={header.retour_km} disabled={frozen} onCommit={(n) => { setHeader({ ...header, retour_km: n }); setKmHint(null); }} />
                  {!frozen && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-2.5"
                      title="Afstand kantoor ↔ projectlocatie opnieuw berekenen"
                      disabled={kmBusy}
                      onClick={() => void computeKm(true)}
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${kmBusy ? "animate-spin" : ""}`} />
                    </Button>
                  )}
                </div>
                {kmHint && <p className="text-[11px] text-muted-foreground">{kmHint}</p>}
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Kosten per km (€)</Label>
                <NumField className="h-8" value={header.km_price} disabled={frozen} onCommit={(n) => setHeader({ ...header, km_price: n })} />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Dagen</Label>
                <NumField className="h-8" value={header.travel_days} disabled={frozen} onCommit={(n) => setHeader({ ...header, travel_days: n })} />
              </div>
              <Row label="Voorrijkosten" value={euro(totals.travelSell)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Stelpost graafwerk</CardTitle>
              <p className="text-[11px] text-muted-foreground">Staat als aparte post op de offerte — telt niet mee in de offerteprijs.</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">Bedrag (€)</Label>
                <NumField className="h-8" value={header.stelpost_graafwerk} disabled={frozen} onCommit={(n) => setHeader({ ...header, stelpost_graafwerk: n })} />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Notitie</Label>
                <Input className="h-8" value={header.stelpost_note} disabled={frozen} placeholder="€115 p/u, koppeluren, Slegh Infra…" onChange={(e) => setHeader({ ...header, stelpost_note: e.target.value })} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Totalen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              <Row label="Materiaal (verkoop)" value={euro(totals.materialSell)} />
              <Row label="Materiaal (inkoop netto)" value={euro(totals.materialCost)} muted />
              <Row label="Marge materiaal" value={euro(totals.marginMaterial)} accent />
              <Row label="Montage" value={euro(totals.laborSell)} />
              <Row label="Voorrijkosten" value={euro(totals.travelSell)} />
              <div className="my-2 border-t" />
              <Row label="Totaal calculatie" value={euro(totals.totalSell)} strong />
              {totals.stelpost > 0 && <Row label="Stelpost graafwerk (apart in offerte)" value={euro(totals.stelpost)} muted />}
              <div className="grid gap-1.5 pt-2">
                <Label className="text-xs">Offerteprijs (afgerond)</Label>
                <NumField
                  className="h-9 text-right text-base font-semibold tabular-nums"
                  value={effectiveOfferPrice}
                  disabled={frozen}
                  onCommit={(n) => setOfferPrice(n > 0 ? n : null)}
                />
                <p className="text-[11px] text-muted-foreground">Voorstel: {euro(totals.suggestedOfferPrice)} (naar boven afgerond, zoals op het Excel-voorblad). Leegmaken = terug naar het voorstel. Dit bedrag wordt de offerteprijs.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, muted, strong, accent }: { label: string; value: string; muted?: boolean; strong?: boolean; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={`${muted ? "text-muted-foreground" : ""} ${strong ? "font-semibold" : ""}`}>{label}</span>
      <span className={`tabular-nums ${strong ? "text-base font-semibold" : ""} ${accent ? "font-medium text-primary" : ""} ${muted ? "text-muted-foreground" : ""}`}>{value}</span>
    </div>
  );
}
