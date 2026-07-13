import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Calculator } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuote } from "@/hooks/useQuotes";
import { useQuoteCalculation, useSaveQuoteCalculation } from "@/hooks/useQuoteCalculation";
import { useCatalogProducts, netCost, sellPrice, type CatalogProduct } from "@/hooks/useCatalogProducts";
import { useOrganization } from "@/hooks/useAdminData";
import {
  commercialPriceFor,
  computeTotals,
  GEEN_COMMERCIELE_PRIJS_KEUZE,
  restoreCommercialPriceChoice,
  sortLinesBySection,
  type CalcHeaderDraft,
  type CalcLineDraft,
  type CalcSection,
  type CalcSummary,
  type CommercialPriceChoice,
} from "@/services/calcTypes";
import { CalcSheet } from "@/components/sales/calc/CalcSheet";
import { CalcTotalsCard } from "@/components/sales/calc/CalcTotalsCard";
import { CalcMarginCard } from "@/components/sales/calc/CalcMarginCard";
import { nextUid } from "@/components/sales/calc/uid";
import { applyCalcToQuote } from "@/services/calcPrefill";
import { scopeFromFlags, SCOPE_LABEL } from "@/lib/quoteScope";
import { supabase } from "@/integrations/supabase/client";
import { calcRetourKm, resolveQuoteAddress } from "@/services/calcDistance";

// Pure terugval — de arbeidstarieven komen normaal uit de org-standaardwaarden
// (Instellingen → Standaardwaarden).
const DEFAULT_HEADER: CalcHeaderDraft = {
  hourly_rate: 75,
  labor_cost_rate: 50,
  km_price: 0.75,
  retour_km: 0,
  travel_days: 1,
  stelpost_graafwerk: 0,
  stelpost_note: "",
};

export default function SalesOfferteCalculatie() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const quote = useQuote(id);
  const calcQuery = useQuoteCalculation(id);
  const catalog = useCatalogProducts();
  const org = useOrganization();
  const save = useSaveQuoteCalculation();

  const [lines, setLines] = useState<CalcLineDraft[]>([]);
  const [header, setHeader] = useState<CalcHeaderDraft>(DEFAULT_HEADER);
  const [summary, setSummary] = useState<CalcSummary>({});
  const [priceChoice, setPriceChoice] = useState<CommercialPriceChoice>(GEEN_COMMERCIELE_PRIJS_KEUZE);
  const [busy, setBusy] = useState(false);
  const [kmBusy, setKmBusy] = useState(false);
  const [kmHint, setKmHint] = useState<string | null>(null);
  const seeded = useRef(false);
  const kmAutoDone = useRef(false);

  // Calculatie in de editor laden (eenmalig). Wacht óók op de organisatie:
  // een nieuwe calculatie start met de org-standaardtarieven, en die mogen
  // niet ná het eerste bewerkbare frame nog onder de gebruiker wijzigen.
  useEffect(() => {
    if (seeded.current || !calcQuery.data || org.isLoading) return;
    seeded.current = true;
    const { calc, lines: dbLines } = calcQuery.data;
    if (!calc) {
      // Nieuwe calculatie: arbeidstarieven uit Instellingen → Standaardwaarden.
      setHeader({
        ...DEFAULT_HEADER,
        hourly_rate: Number(org.data?.default_labor_sell_rate ?? DEFAULT_HEADER.hourly_rate),
        labor_cost_rate: Number(org.data?.default_labor_cost_rate ?? DEFAULT_HEADER.labor_cost_rate),
      });
      return;
    }
    const seededHeader: CalcHeaderDraft = {
      hourly_rate: Number(calc.hourly_rate),
      labor_cost_rate: Number(calc.labor_cost_rate),
      km_price: Number(calc.km_price),
      retour_km: Number(calc.retour_km),
      travel_days: Number(calc.travel_days),
      stelpost_graafwerk: Number(calc.stelpost_graafwerk),
      stelpost_note: calc.stelpost_note ?? "",
    };
    setHeader(seededHeader);
    setSummary((calc.summary ?? {}) as CalcSummary);
    const seededLines = dbLines.map((l, i) => ({
      uid: nextUid(),
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
    }));
    setLines(seededLines);
    // Alleen het bedrag is opgeslagen, niet hoe het gekozen is: viel het op een
    // afrondstap, dan gaat die regel weer meebewegen met de calculatie.
    setPriceChoice(
      restoreCommercialPriceChoice(
        computeTotals(seededLines, seededHeader),
        calc.offer_price_rounded == null ? null : Number(calc.offer_price_rounded),
      ),
    );
  }, [calcQuery.data, org.isLoading, org.data]);

  const totals = useMemo(() => computeTotals(lines, header), [lines, header]);
  // Wat we opslaan is wat je op het blad ziet: regels gegroepeerd per sectie.
  // Dit bepaalt `position`, de volgorde van de offerteregels en het Excel.
  const orderedLines = useMemo(() => sortLinesBySection(lines), [lines]);
  // Een afrondstap beweegt mee met de calculatie; een handmatig bedrag blijft staan.
  const effectiveCommercialPrice = commercialPriceFor(totals, priceChoice);
  const isConcept = quote.data?.status === "concept";

  const pickRoundStep = (step: number) => setPriceChoice({ roundStep: step, manual: null });

  /** NumField commit óók op blur zonder wijziging — dan mag de afrondstap niet
      stilletjes in een bevroren bedrag veranderen. */
  const commitCommercialPrice = (n: number) => {
    if (n === effectiveCommercialPrice) return;
    setPriceChoice({ roundStep: null, manual: n > 0 ? n : null });
  };

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
        uid: nextUid(),
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
  };

  /** Lege regel onder een sectie; de regel erft de categorie van die sectie.
      `init` laat de aanroeper een startwaarde meegeven — de plusknop op de
      Uurloon-regel maakt er zo meteen een benoemde montageregel van. */
  const addFree = (type: "vrij" | "uren", category: CalcSection, init?: Partial<CalcLineDraft>) =>
    setLines((prev) => [
      ...prev,
      {
        uid: nextUid(),
        line_type: type,
        product_id: null,
        description: "",
        category,
        supplier: null,
        order_number: null,
        unit: type === "uren" ? "uur" : "stuk",
        qty: 1,
        unit_gross: 0,
        unit_cost: 0,
        unit_sell: 0,
        unit_hours: type === "uren" ? 1 : 0,
        position: prev.length,
        ...init,
      },
    ]);

  // Op uid, niet op array-index: het blad rendert per sectie een gefilterde
  // subset, en een index uit zo'n subset zou de verkeerde regel raken.
  const patchLine = (uid: string, patch: Partial<CalcLineDraft>) =>
    setLines((prev) => prev.map((l) => (l.uid === uid ? { ...l, ...patch } : l)));
  const removeLine = (uid: string) => setLines((prev) => prev.filter((l) => l.uid !== uid));

  const patchHeader = (patch: Partial<CalcHeaderDraft>) => {
    // Handmatig ingevoerde kilometers: de "berekend"-toelichting klopt dan niet meer.
    if ("retour_km" in patch) setKmHint(null);
    setHeader((h) => ({ ...h, ...patch }));
  };

  const doSave = async (status: "concept" | "afgerond" | "overgeslagen", summaryOverride?: CalcSummary) => {
    if (!quote.data || !id) return null;
    return save.mutateAsync({
      quoteId: id,
      organizationId: quote.data.organization_id,
      status,
      header,
      summary: summaryOverride ?? summary,
      totals,
      commercialPriceRounded: status === "overgeslagen" ? null : effectiveCommercialPrice,
      lines: status === "overgeslagen" ? [] : orderedLines,
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
        lines: orderedLines,
        header,
        summary,
        totals,
        commercialPrice: effectiveCommercialPrice,
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
          commercialPrice: effectiveCommercialPrice,
          lines: orderedLines,
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

  if (quote.isLoading || calcQuery.isLoading || org.isLoading) {
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
        <div className="space-y-4">
          <CalcSheet
            lines={lines}
            header={header}
            totals={totals}
            frozen={frozen}
            catalog={catalog.data ?? []}
            kmBusy={kmBusy}
            kmHint={kmHint}
            onAddProduct={addProduct}
            onAddFree={addFree}
            onPatchLine={patchLine}
            onRemoveLine={removeLine}
            onHeaderChange={patchHeader}
            onRecomputeKm={() => void computeKm(true)}
          />

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

        <div className="space-y-4">
          <CalcTotalsCard
            totals={totals}
            commercialPrice={effectiveCommercialPrice}
            roundStep={priceChoice.roundStep}
            frozen={frozen}
            onCommercialPriceCommit={commitCommercialPrice}
            onPickRoundStep={pickRoundStep}
          />
          <CalcMarginCard totals={totals} commercialPrice={effectiveCommercialPrice} laborCostRate={header.labor_cost_rate} />
        </div>
      </div>
    </div>
  );
}
