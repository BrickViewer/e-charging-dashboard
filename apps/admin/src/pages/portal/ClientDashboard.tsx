import { useEffect, useMemo, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import {
  useClientProfile,
  useClientKPIs,
  usePortalDashboardKpis,
  periodLabel,
  DEFAULT_ERE_RATE_PER_KWH,
  type DashboardPeriod,
  type PortalDashboardKpiRow,
} from "@/hooks/useClientData";
import { CockpitGauge } from "@/components/portal/CockpitGauge";
import { niceQuarterMax } from "@/components/portal/gaugeUtils";
import { WarningLight } from "@/components/portal/WarningLight";
import { PeriodStepper } from "@/components/portal/PeriodStepper";

// Mobiel: de XL-vergoedingsgauge (index 2) staat bij openen in het midden;
// links ervan energie + uitbetaald, rechts CO₂ + ERE — zelfde ordening als desktop.
const MOBILE_START_SLIDE = 2;

const fmtKwh = (v: number) => v.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Euros altijd op 2 decimalen (geen afronding naar gehele euro)
const fmtEuro = (v: number) => v.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtKg = (v: number) => Math.round(v).toLocaleString("nl-NL");

// Bouw een chronologische lijst selecteerbare periodes: per jaar (oplopend) eerst
// "Heel {jaar}", dan ALLE 12 maanden (jan–dec). Jaren = jaren-met-data ∪ huidig jaar,
// zodat je door elke maand kunt scrollen, ook maanden zonder laaddata.
function buildOrderedPeriods(rows: Array<{ year: number; month: number }>, currentYear: number): DashboardPeriod[] {
  const years = new Set<number>(rows.map((r) => r.year));
  years.add(currentYear);
  const out: DashboardPeriod[] = [];
  for (const y of [...years].sort((a, b) => a - b)) {
    out.push({ type: "year", year: y });
    for (let m = 1; m <= 12; m++) {
      out.push({ type: "month", year: y, month: m });
    }
  }
  return out;
}

// Index van de meest recente maand MÉT data (zodat het dashboard niet op een lege maand opent).
function latestDataMonthIndex(periods: DashboardPeriod[], rows: Array<{ year: number; month: number }>): number {
  const dataMonths = new Set(rows.map((r) => `${r.year}-${r.month}`));
  for (let i = periods.length - 1; i >= 0; i--) {
    const p = periods[i];
    if (p.type === "month" && dataMonths.has(`${p.year}-${p.month}`)) return i;
  }
  return Math.max(0, periods.length - 1);
}

export default function ClientDashboard() {
  const { data: client, isLoading } = useClientProfile();
  const { data: dashRows } = usePortalDashboardKpis(client?.id);
  const currentYear = new Date().getUTCFullYear();
  const rows = useMemo(() => dashRows ?? [], [dashRows]);
  const orderedPeriods = useMemo(() => buildOrderedPeriods(rows, currentYear), [rows, currentYear]);

  // -1 = nog geen keuze gemaakt → default naar de meest recente maand MÉT data.
  const [chosenIndex, setChosenIndex] = useState<number>(-1);
  const defaultIndex = useMemo(() => latestDataMonthIndex(orderedPeriods, rows), [orderedPeriods, rows]);
  const effectiveIndex =
    chosenIndex >= 0 && chosenIndex < orderedPeriods.length ? chosenIndex : defaultIndex;
  const selectedPeriod: DashboardPeriod = orderedPeriods[effectiveIndex] ?? { type: "ttm" };
  const kpis = useClientKPIs(client?.id, selectedPeriod, client?.calculate_ere_enabled ?? false);

  // Mobiele gauge-carousel: één gauge per slide, native swipe met snap (embla)
  const [emblaRef, emblaApi] = useEmblaCarousel({ startIndex: MOBILE_START_SLIDE, align: "center" });
  const [activeSlide, setActiveSlide] = useState(MOBILE_START_SLIDE);
  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setActiveSlide(emblaApi.selectedScrollSnap());
    emblaApi.on("select", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi]);

  if (isLoading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Laden...</div>;
  }

  // Stabiele, ronde gauge-schaal o.b.v. de PIEKMAAND (hoogste maandwaarde tot nu toe).
  // Elke maand deelt dezelfde max per metric, zodat je maanden eerlijk kunt vergelijken
  // (juni vs mei op één schaal). Piek €775 -> max 1000; schaalt mee naar €10.000+.
  // Bij "Heel jaar" een eigen ronde schaal o.b.v. het jaartotaal.
  const isMonth = selectedPeriod.type === "month";
  const peak = (selector: (r: PortalDashboardKpiRow) => number) =>
    rows.reduce((m, r) => Math.max(m, Number(selector(r) || 0)), 0);
  const peakKwh = peak((r) => r.total_kwh);
  const peakPayout = peak((r) => r.estimated_client_yield);
  const peakCo2 = peak((r) => r.co2_kg_avoided);
  const peakEre = kpis.calculateEreEnabled ? peakKwh * DEFAULT_ERE_RATE_PER_KWH : 0;

  const kwhMax = niceQuarterMax(isMonth ? peakKwh : kpis.ttmKwh);
  const vergoedingMax = niceQuarterMax(isMonth ? peakPayout : kpis.ttmCustomerCashflow);
  const ereCo2Max = niceQuarterMax(isMonth ? peakCo2 : kpis.ttmEreCo2);
  const ereRevMax = niceQuarterMax(isMonth ? peakEre : kpis.ttmEreClientEstimate);
  // "Totaal uitbetaald" is een levenslang totaal -> eigen ronde schaal.
  const totalPaidOutMax = niceQuarterMax(kpis.totalPaidOut);
  const periodFilter =
    orderedPeriods.length > 0 ? (
      <PeriodStepper
        label={periodLabel(selectedPeriod)}
        index={effectiveIndex}
        count={orderedPeriods.length}
        onIndexChange={setChosenIndex}
      />
    ) : null;

  // Gauges eenmaal gedefinieerd, gebruikt door zowel het desktop-grid als de
  // mobiele carousel (twee losse render-trees, CSS-gegate op lg).
  const gaugeKwh = (
    <CockpitGauge
      value={kpis.ttmKwh}
      max={kwhMax}
      label="Energie geleverd via laadpalen"
      sublabel="kWh"
      color="red"
      size="md"
      formatValue={fmtKwh}
    />
  );
  const gaugePaidOut = (
    <CockpitGauge
      value={kpis.totalPaidOut}
      max={totalPaidOutMax}
      label="Totaal uitbetaald"
      sublabel="EUR"
      color="red"
      size="md"
      formatValue={fmtEuro}
    />
  );
  const gaugeMain = (
    <CockpitGauge
      value={kpis.ttmCustomerCashflow}
      max={vergoedingMax}
      label={`Uw vergoeding - ${kpis.periodLabel}`}
      sublabel="EUR"
      color="blue"
      size="xl"
      formatValue={fmtEuro}
    />
  );
  const gaugeCo2 = (
    <CockpitGauge
      value={kpis.ttmEreCo2}
      max={ereCo2Max}
      label="± kg CO₂ vermeden"
      sublabel="ERE's"
      color="green"
      size="md"
      formatValue={fmtKg}
    />
  );
  const gaugeEre = (
    <CockpitGauge
      value={kpis.ttmEreClientEstimate}
      max={ereRevMax}
      label="Geschatte ERE's"
      sublabel="EUR"
      color="green"
      size="md"
      formatValue={fmtEuro}
    />
  );

  const mobileSlides = [
    { key: "kwh", label: "Energie geleverd via laadpalen", el: gaugeKwh },
    { key: "uitbetaald", label: "Totaal uitbetaald", el: gaugePaidOut },
    { key: "vergoeding", label: "Uw vergoeding", el: gaugeMain },
    { key: "co2", label: "CO₂ vermeden", el: gaugeCo2 },
    { key: "ere", label: "Geschatte ERE's", el: gaugeEre },
  ];

  return (
    <div className="portal-dashboard-root animate-fade-in h-full flex flex-col overflow-hidden overscroll-none">
      {/* Storinglampjes — desktop: fixed gepositioneerd in de gap tussen XL en small gauges */}
      <div className="hidden lg:block">
        <div className="fixed top-[24vh] left-[calc(37.5vw_-_13vh_+_32px)] -translate-x-1/2 -translate-y-1/2 z-50">
          <WarningLight count={kpis.offlineCount} variant="offline" />
        </div>
        <div className="fixed top-[24vh] left-[calc(62.5vw_+_13vh_-_32px)] -translate-x-1/2 -translate-y-1/2 z-50">
          <WarningLight count={kpis.chargePointsOnline} variant="online" />
        </div>
      </div>

      {/* Desktop: vijf gauges — XL center, zij-kolommen links/rechts */}
      <div className="hidden lg:grid flex-1 grid-cols-12 gap-x-6 gap-y-4 items-center min-h-0">
        <div className="col-span-3 flex flex-col items-center gap-12 order-1 fixed top-[calc(50%+2vh)] -translate-x-1/2 -translate-y-1/2 left-[calc(25vw_-_clamp(460px,_67vh,_760px)/8)]">
          {gaugeKwh}
          {gaugePaidOut}
        </div>

        <div className="col-span-6 flex flex-col items-center justify-center order-2">
          <div className="w-fit pt-4 fixed top-[calc(50%+18px+2vh)] left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
            {gaugeMain}
            <div className="mt-10 translate-y-[clamp(28px,4vh,42px)]">
              {periodFilter}
            </div>
          </div>
        </div>

        <div className="col-span-3 flex flex-col items-center gap-12 order-3 fixed top-[calc(50%+2vh)] -translate-x-1/2 -translate-y-1/2 left-[calc(75vw_+_clamp(460px,_67vh,_760px)/8)]">
          {gaugeCo2}
          {gaugeEre}
        </div>
      </div>

      {/* Mobiel/tablet (<lg): storingslampjes vast onder de kap + fullscreen
          swipe-carousel — één gauge per slide, hoofdgauge gecentreerd bij openen.
          De lampjes staan búiten de carousel zodat ze blijven staan bij het swipen. */}
      <div className="lg:hidden flex-1 min-h-0 flex flex-col">
        <div className="flex items-center justify-between px-6 pt-1">
          <WarningLight count={kpis.offlineCount} variant="offline" showCount />
          <WarningLight count={kpis.chargePointsOnline} variant="online" showCount />
        </div>

        <div className="portal-gauge-carousel flex-1 min-h-0 overflow-hidden" ref={emblaRef}>
          <div className="flex h-full items-center">
            {mobileSlides.map((slide) => (
              <div
                key={slide.key}
                className="min-w-0 flex-[0_0_100%] h-full flex items-center justify-center px-4"
                aria-label={slide.label}
              >
                {slide.el}
              </div>
            ))}
          </div>
        </div>

        {/* Slide-indicator: tikbare dots (44px tapzone, kleine visuele punt) */}
        <div className="flex items-center justify-center -mt-1">
          {mobileSlides.map((slide, i) => (
            <button
              key={slide.key}
              type="button"
              aria-label={`Ga naar ${slide.label}`}
              aria-current={i === activeSlide}
              onClick={() => emblaApi?.scrollTo(i)}
              className="w-11 h-11 flex items-center justify-center"
            >
              <span
                className={
                  i === activeSlide
                    ? "h-2 w-5 rounded-full bg-[hsl(var(--gauge-green))] transition-all duration-300"
                    : "h-2 w-2 rounded-full bg-muted-foreground/30 transition-all duration-300"
                }
              />
            </button>
          ))}
        </div>

        <div className="pb-2">{periodFilter}</div>
      </div>

    </div>
  );
}
