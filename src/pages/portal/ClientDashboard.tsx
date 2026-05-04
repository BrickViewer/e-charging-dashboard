import { useClientProfile, useClientKPIs, useClientLocations } from "@/hooks/useClientData";
import { useOrganization } from "@/hooks/useAdminData";
import { CockpitGauge, niceGaugeMax } from "@/components/portal/CockpitGauge";
import { ContactIconBar } from "@/components/portal/ContactIconBar";
import { ChargePointStatus } from "@/components/portal/ChargePointStatus";
import { CockpitArc } from "@/components/portal/CockpitArc";
import { Fuel, Euro, Leaf } from "lucide-react";
import { useMemo } from "react";

const fmtKwh = (v: number) => Math.round(v).toLocaleString("nl-NL");
const fmtEuro = (v: number) => Math.round(v).toLocaleString("nl-NL");
const fmtKg = (v: number) => Math.round(v).toLocaleString("nl-NL");

export default function ClientDashboard() {
  const { data: client, isLoading } = useClientProfile();
  const { data: org } = useOrganization();
  const kpis = useClientKPIs(client?.id);
  const { data: locations } = useClientLocations(client?.id);

  const mapsUrl = useMemo(() => {
    if (!locations || locations.length === 0) return null;
    const addresses = locations
      .map((l: any) => [l.address, l.postal_code, l.city].filter(Boolean).join(" "))
      .filter(Boolean);
    if (addresses.length === 0) return null;
    if (addresses.length === 1) {
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addresses[0])}`;
    }
    return `https://www.google.com/maps/dir/${addresses.map(a => encodeURIComponent(a)).join("/")}`;
  }, [locations]);

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
      {/* Header */}
      <div className="text-center sm:text-left mb-2">
        <h1 className="text-2xl font-semibold">
          Welkom{client?.contact_name ? `, ${client.contact_name}` : ""}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Uw cockpit — laatste 12 maanden
        </p>
      </div>

      {/* Cockpit-frame: arc bovenaan, gauges + iconen + status binnen het frame */}
      <div className="relative mt-10 mx-auto max-w-5xl">
        {/* Bovenste boog — windshield */}
        <CockpitArc className="absolute -top-6 left-0 right-0 h-20 sm:h-24" />

        <div className="space-y-10 pt-6">
          {/* Contact-iconen, gecentreerd onder de boog */}
          <ContactIconBar
            phone={org?.phone}
            email={org?.email}
            whatsappPhone={org?.phone}
            mapsUrl={mapsUrl}
          />

          {/* Vijf gauges in 3-kolomslayout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-4 gap-y-10 items-center">
            {/* Linker kolom — rood (energie) */}
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

            {/* Centraal — blauw (totaal-uitbetaling) */}
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

            {/* Rechter kolom — groen (ERE / duurzaamheid) */}
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

          {/* Status indicators — geen separator-lijn boven, gewoon onder de gauges */}
          <ChargePointStatus
            onlineCount={kpis.chargePointsOnline}
            offlineCount={kpis.offlineCount}
            totalCount={kpis.chargePointsTotal}
          />
        </div>
      </div>
    </div>
  );
}
