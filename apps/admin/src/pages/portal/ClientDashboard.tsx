import { useMemo, useState } from "react";
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

  return (
    <div className="animate-fade-in h-full flex flex-col overflow-hidden overscroll-none">
      {/* Storinglampjes — op desktop fixed gepositioneerd in de gap tussen XL en small gauges.
          Op mobile worden ze inline gerenderd binnen de XL wrapper (zie verderop) */}
      <div className="hidden lg:block">
        <div className="fixed top-[22vh] left-[calc(37.5vw_-_13vh_+_32px)] -translate-x-1/2 -translate-y-1/2 z-50">
          <WarningLight count={kpis.offlineCount} variant="offline" />
        </div>
        <div className="fixed top-[22vh] left-[calc(62.5vw_+_13vh_-_32px)] -translate-x-1/2 -translate-y-1/2 z-50">
          <WarningLight count={kpis.chargePointsOnline} variant="online" />
        </div>
      </div>

      {/* Vijf gauges — XL center, zij-kolommen links/rechts */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-x-6 gap-y-4 items-center min-h-0">
        <div className="lg:col-span-3 flex flex-col items-center gap-10 lg:gap-12 lg:order-1 lg:fixed lg:top-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2 lg:left-[calc(25vw_-_clamp(460px,_67vh,_760px)/8)]">
          <CockpitGauge
            value={kpis.ttmKwh}
            max={kwhMax}
            label="Energie geleverd via laadpalen"
            sublabel="kWh"
            color="red"
            size="md"
            formatValue={fmtKwh}
          />
          <CockpitGauge
            value={kpis.totalPaidOut}
            max={totalPaidOutMax}
            label="Totaal uitbetaald"
            sublabel="EUR"
            color="red"
            size="md"
            formatValue={fmtEuro}
          />
        </div>

        <div className="lg:col-span-6 flex flex-col items-center justify-center lg:order-2">
          <div className="relative w-fit pt-4 lg:fixed lg:top-[calc(50%+18px)] lg:left-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2 lg:z-10">
            <div className="relative">
              <div className="absolute top-[27px] left-[8%] z-50 lg:hidden">
                <WarningLight
                  count={kpis.offlineCount}
                  variant="offline"
                />
              </div>
              <div className="absolute top-[27px] right-[8%] z-50 lg:hidden">
                <WarningLight
                  count={kpis.chargePointsOnline}
                  variant="online"
                />
              </div>
              <CockpitGauge
                value={kpis.ttmCustomerCashflow}
                max={vergoedingMax}
                label={`Uw vergoeding - ${kpis.periodLabel}`}
                sublabel="EUR"
                color="blue"
                size="xl"
                formatValue={fmtEuro}
              />
            </div>
            <div className="mt-5 lg:mt-10 lg:translate-y-[clamp(28px,4vh,42px)]">
              {periodFilter}
            </div>
          </div>
        </div>

        <div className="lg:col-span-3 flex flex-col items-center gap-10 lg:gap-12 lg:order-3 lg:fixed lg:top-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2 lg:left-[calc(75vw_+_clamp(460px,_67vh,_760px)/8)]">
          <CockpitGauge
            value={kpis.ttmEreCo2}
            max={ereCo2Max}
            label="± kg CO₂ vermeden"
            sublabel="ERE's"
            color="green"
            size="md"
            formatValue={fmtKg}
          />
          <CockpitGauge
            value={kpis.ttmEreClientEstimate}
            max={ereRevMax}
            label="Geschatte ERE's"
            sublabel="EUR"
            color="green"
            size="md"
            formatValue={fmtEuro}
          />
        </div>
      </div>

    </div>
  );
}
