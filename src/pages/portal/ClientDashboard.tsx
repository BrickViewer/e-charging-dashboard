import { useClientProfile, useClientKPIs } from "@/hooks/useClientData";
import { CockpitGauge, niceGaugeMax } from "@/components/portal/CockpitGauge";
import { WarningLight } from "@/components/portal/WarningLight";

const fmtKwh = (v: number) => Math.round(v).toLocaleString("nl-NL");
const fmtEuro = (v: number) => Math.round(v).toLocaleString("nl-NL");
const fmtKg = (v: number) => Math.round(v).toLocaleString("nl-NL");

export default function ClientDashboard() {
  const { data: client, isLoading } = useClientProfile();
  const kpis = useClientKPIs(client?.id);

  if (isLoading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Laden...</div>;
  }

  const kwhMax = niceGaugeMax(kpis.ttmKwh, kpis.ttmKwh * 1.2);
  const grossMax = niceGaugeMax(kpis.ttmGross);
  const payoutMax = niceGaugeMax(kpis.ttmPayout);
  const ereCo2Max = niceGaugeMax(kpis.ttmEreCo2);
  const ereRevMax = niceGaugeMax(kpis.ttmEreClientEstimate);

  return (
    <div className="animate-fade-in h-full flex flex-col overflow-hidden">
      {/* Storinglampjes — op desktop fixed gepositioneerd in de gap tussen XL en small gauges.
          Op mobile worden ze inline gerenderd binnen de XL wrapper (zie verderop) */}
      <div className="hidden lg:block">
        <div className="fixed top-[22vh] left-[calc(37.5vw_-_14vh_+_32px)] -translate-x-1/2 -translate-y-1/2 z-10">
          <WarningLight count={kpis.offlineCount} variant="offline" />
        </div>
        <div className="fixed top-[22vh] left-[calc(62.5vw_+_14vh_-_32px)] -translate-x-1/2 -translate-y-1/2 z-10">
          <WarningLight count={kpis.chargePointsOnline} variant="online" />
        </div>
      </div>

      {/* Vijf gauges — XL center, zij-kolommen links/rechts */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-x-6 gap-y-4 items-center min-h-0">
        <div className="lg:col-span-3 flex flex-col items-center gap-10 lg:order-1 lg:fixed lg:top-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2 lg:left-[calc(25vw_-_clamp(480px,_72vh,_1320px)/5)]">
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
            value={kpis.ttmGross}
            max={grossMax}
            label="Bruto laadopbrengsten"
            sublabel="EUR"
            color="red"
            size="md"
            formatValue={fmtEuro}
          />
        </div>

        <div className="lg:col-span-6 flex flex-col items-center justify-center lg:order-2">
          <div className="relative w-fit pt-12 lg:fixed lg:top-[calc(50%-53px)] lg:left-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2 lg:z-10">
            <div className="absolute top-[27px] left-[8%] z-10 lg:hidden">
              <WarningLight
                count={kpis.offlineCount}
                variant="offline"
              />
            </div>
            <div className="absolute top-[27px] right-[8%] z-10 lg:hidden">
              <WarningLight
                count={kpis.chargePointsOnline}
                variant="online"
              />
            </div>
            <CockpitGauge
              value={kpis.ttmPayout}
              max={payoutMax}
              label="Uw opbrengsten — laatste 12 maanden"
              sublabel="EUR"
              color="blue"
              size="xl"
              formatValue={fmtEuro}
            />
          </div>
        </div>

        <div className="lg:col-span-3 flex flex-col items-center gap-10 lg:order-3 lg:fixed lg:top-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2 lg:left-[calc(75vw_+_clamp(480px,_72vh,_1320px)/5)]">
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
            label="Geschatte ERE — via Laadbeloning"
            sublabel="EUR (indicatief)"
            color="green"
            size="md"
            formatValue={fmtEuro}
          />
        </div>
      </div>

    </div>
  );
}
