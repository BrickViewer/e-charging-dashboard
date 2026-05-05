import { useClientProfile, useClientKPIs } from "@/hooks/useClientData";
import { CockpitGauge, niceGaugeMax } from "@/components/portal/CockpitGauge";
import { ChargePointStatus } from "@/components/portal/ChargePointStatus";
import { Fuel, Euro, Leaf } from "lucide-react";

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
  const ereRevMax = niceGaugeMax(kpis.ttmEreClientRevenue);

  return (
    <div className="animate-fade-in">
      {/* Welkom-tekst */}
      <div className="text-center sm:text-left mb-10">
        <h1 className="text-2xl font-semibold">
          Welkom{client?.contact_name ? `, ${client.contact_name}` : ""}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Uw cockpit — laatste 12 maanden
        </p>
      </div>

      {/* Vijf gauges */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-4 gap-y-10 items-center mb-10">
        <div className="lg:col-span-3 flex flex-col items-center gap-10 lg:order-1">
          <CockpitGauge
            value={kpis.ttmKwh}
            max={kwhMax}
            label="Energie geleverd via laadpalen"
            sublabel="kWh"
            icon={<Fuel className="w-7 h-7" strokeWidth={1.6} />}
            color="red"
            size="md"
            formatValue={fmtKwh}
          />
          <CockpitGauge
            value={kpis.ttmGross}
            max={grossMax}
            label="Bruto laadopbrengsten"
            sublabel="EUR"
            icon={<Euro className="w-7 h-7" strokeWidth={1.6} />}
            color="red"
            size="md"
            formatValue={fmtEuro}
          />
        </div>

        <div className="lg:col-span-6 flex justify-center lg:order-2">
          <CockpitGauge
            value={kpis.ttmPayout}
            max={payoutMax}
            label="Uw opbrengsten — laatste 12 maanden"
            sublabel="EUR"
            icon={<Euro className="w-9 h-9" strokeWidth={1.5} />}
            color="blue"
            size="xl"
            formatValue={fmtEuro}
          />
        </div>

        <div className="lg:col-span-3 flex flex-col items-center gap-10 lg:order-3">
          <CockpitGauge
            value={kpis.ttmEreCo2}
            max={ereCo2Max}
            label="± kg CO₂ vermeden"
            sublabel="ERE's"
            icon={<Leaf className="w-7 h-7" strokeWidth={1.6} />}
            color="green"
            size="md"
            formatValue={fmtKg}
          />
          <CockpitGauge
            value={kpis.ttmEreClientRevenue}
            max={ereRevMax}
            label="Opbrengsten ERE-s"
            sublabel="EUR"
            icon={<Euro className="w-7 h-7" strokeWidth={1.6} />}
            color="green"
            size="md"
            formatValue={fmtEuro}
          />
        </div>
      </div>

      {/* Status indicators */}
      <ChargePointStatus
        onlineCount={kpis.chargePointsOnline}
        offlineCount={kpis.offlineCount}
        totalCount={kpis.chargePointsTotal}
      />
    </div>
  );
}
