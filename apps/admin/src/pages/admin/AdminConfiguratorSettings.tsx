import { useEffect, useState } from "react";
import {
  calculatePricing,
  configuratorSettingsSchema,
  defaultConfiguratorSettings,
  pricingInputSchema,
  type ConfiguratorSettings,
  type PricingResult,
} from "@echarging/pricing-engine";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Plus, Save, Trash2 } from "lucide-react";

type SettingsResponse = {
  version: number;
  settings: ConfiguratorSettings;
};

type SessionStartResponse = {
  sessionId: string;
  url: string;
  expiresAt: string;
};

type UsageDefaults = ConfiguratorSettings["locationTypeDefaults"][string];

const FALLBACK_USAGE: UsageDefaults = {
  sessionsPerChargePointMonth: 12,
  kwhPerChargePointMonth: 200,
  averageSessionDurationHours: 6,
  effectiveChargingPowerKw: 8,
  idleMinutesPerSession: 180,
  idleBillableSharePct: 10,
};

function toNumber(value: string | number, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "type"
  );
}

function uniqueKey(base: string, existing: string[]) {
  let key = base;
  let n = 2;
  while (existing.includes(key)) key = `${base}-${n++}`;
  return key;
}

const eur = (v: number) => `€ ${v.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const minutesLabel = (v: number) => `${Math.round(v).toLocaleString("nl-NL")} min`;

// Rekent de blokkeertarief-opbrengst per laadpunt/maand door met exact dezelfde
// pricing-engine als de configurator, zodat het voorbeeld 1-op-1 klopt. Voor het
// voorbeeld forceren we idleFeeEnabled=true (toont de potentiële opbrengst, ook als
// het blokkeertarief standaard uit staat). Geeft null terug bij tussentijds ongeldige
// invoer (bv. laadvermogen 0), zodat de tabel niet crasht tijdens het typen.
function idlePreview(usage: UsageDefaults, settings: ConfiguratorSettings): PricingResult | null {
  try {
    const input = pricingInputSchema.parse({
      customer: { companyName: "preview", locationType: "workplace" },
      hardware: { chargePoints: 1, socketsPerChargePoint: 1 },
      usage,
      contract: {
        durationMonths: settings.defaultContractDurationMonths,
        noticePeriodMonths: settings.defaultNoticePeriodMonths,
      },
      tariffs: {
        chargeTariffPerKwh: settings.defaultChargeTariffPerKwh,
        energyCostPerKwh: settings.defaultEnergyCostPerKwh,
        startFeeEnabled: settings.defaultStartFeeEnabled,
        startFeePerSession: settings.defaultStartFeePerSession,
        idleFeeEnabled: true,
        idleFeePerMinute: settings.defaultIdleFeePerMinute,
        idleGraceMinutes: settings.defaultIdleGraceMinutes,
      },
    });
    return calculatePricing(input, settings);
  } catch {
    return null;
  }
}

function CurrencyInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input inputMode="decimal" value={String(value)} onChange={(event) => onChange(toNumber(event.target.value, value))} />
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function ToggleField({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border p-4">
      <div>
        <Label>{label}</Label>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

export default function AdminConfiguratorSettings() {
  const { role } = useAuth();
  const [settings, setSettings] = useState<ConfiguratorSettings>(defaultConfiguratorSettings);
  const [version, setVersion] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke<SettingsResponse>("configurator-settings", {
          body: { action: "get" },
        });
        if (error) throw error;
        if (!cancelled && data) {
          setSettings(configuratorSettingsSchema.parse(data.settings));
          setVersion(data.version);
        }
      } catch {
        if (!cancelled) {
          setSettings(defaultConfiguratorSettings);
          setVersion(1);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Tolerante update: geldige edits worden genormaliseerd, tussentijdse ongeldige
  // waarden (bv. leeg label of 0 in een verplicht veld) blijven staan zonder crash.
  // De harde validatie gebeurt bij Opslaan.
  const updateSettings = (updater: (draft: ConfiguratorSettings) => ConfiguratorSettings) => {
    setSettings((current) => {
      const next = updater(current);
      const parsed = configuratorSettingsSchema.safeParse(next);
      return parsed.success ? parsed.data : next;
    });
  };

  const setRange = (field: keyof ConfiguratorSettings["inputRanges"], value: number) =>
    updateSettings((current) => ({ ...current, inputRanges: { ...current.inputRanges, [field]: value } }));

  const setOffer = (patch: Partial<ConfiguratorSettings["offerTemplate"]>) =>
    updateSettings((current) => ({ ...current, offerTemplate: { ...current.offerTemplate, ...patch } }));

  const save = async () => {
    setSaving(true);
    try {
      const parsed = configuratorSettingsSchema.parse(settings);
      const { data, error } = await supabase.functions.invoke<SettingsResponse>("configurator-settings", {
        body: { action: "update", settings: parsed },
      });
      if (error) throw error;
      if (data) {
        setSettings(configuratorSettingsSchema.parse(data.settings));
        setVersion(data.version);
      }
      toast.success("Configurator-instellingen opgeslagen");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Opslaan mislukt");
    } finally {
      setSaving(false);
    }
  };

  const handleNewConfiguration = async () => {
    if (role !== "admin" && role !== "manager") {
      toast.error("Viewer kan geen configuratie starten");
      return;
    }
    // Fallback-basis: lokaal de dev-server, in productie het gekoppelde domein.
    const base = import.meta.env.DEV ? "http://localhost:8081" : "https://configurator.e-charging.nl";
    try {
      const { data, error } = await supabase.functions.invoke<SessionStartResponse>("configurator-session-start");
      if (error) throw error;
      const url = data?.url ?? `${base}/s/local-${Date.now()}/stap/1`;
      window.open(url, "_blank", "noopener,noreferrer,width=1400,height=900");
    } catch {
      const localUrl = `${base}/s/local-${Date.now()}/stap/1`;
      toast.warning("Configuratiesessie kon niet via de backend starten. Preview geopend.");
      window.open(localUrl, "_blank", "noopener,noreferrer,width=1400,height=900");
    }
  };

  if (role !== "admin") {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Configuratie</h1>
            <p className="mt-1 text-sm text-muted-foreground">Beheer de calculator en start klantconfiguraties.</p>
          </div>
          {role === "manager" && (
            <Button variant="outline" onClick={handleNewConfiguration}>
              <Plus className="mr-2 h-4 w-4" />
              Nieuwe configuratie
            </Button>
          )}
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Calculatorinstellingen</CardTitle>
            <CardDescription>
              Globale instellingen worden door een admin beheerd. Managers kunnen wel nieuwe klantconfiguraties starten.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Configuratie</h1>
          <p className="mt-1 text-sm text-muted-foreground">Volledige controle over de cijfers van de klant-configurator.</p>
          <p className="mt-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">Versie {version}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleNewConfiguration}>
            <Plus className="mr-2 h-4 w-4" />
            Nieuwe configuratie
          </Button>
          <Button onClick={save} disabled={saving}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Opslaan..." : "Opslaan"}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="defaults">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          <TabsTrigger value="defaults">Defaults</TabsTrigger>
          <TabsTrigger value="locations">Locatietypes</TabsTrigger>
          <TabsTrigger value="tariffs">Tarieven</TabsTrigger>
          <TabsTrigger value="investment">ERE &amp; investering</TabsTrigger>
          <TabsTrigger value="ranges">Invoergrenzen</TabsTrigger>
          <TabsTrigger value="offer">Offerte-sjabloon</TabsTrigger>
        </TabsList>

        {/* DEFAULTS */}
        <TabsContent value="defaults" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Contract-defaults</CardTitle>
              <CardDescription>Startwaarden voor de contractduur bij een nieuwe configuratie.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5 md:grid-cols-3">
              <CurrencyInput label="Default contractduur" value={settings.defaultContractDurationMonths} onChange={(value) => updateSettings((c) => ({ ...c, defaultContractDurationMonths: Math.max(1, Math.round(value)) }))} />
              <CurrencyInput label="Opzegtermijn" value={settings.defaultNoticePeriodMonths} onChange={(value) => updateSettings((c) => ({ ...c, defaultNoticePeriodMonths: Math.max(0, Math.round(value)) }))} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* LOCATIONS (CRUD) */}
        <TabsContent value="locations" className="mt-6">
          <div className="space-y-4">
            {settings.locationTypes.map((entry, index) => {
              const usage = settings.locationTypeDefaults[entry.key] ?? FALLBACK_USAGE;
              const setUsage = (patch: Partial<UsageDefaults>) =>
                updateSettings((c) => ({
                  ...c,
                  locationTypeDefaults: {
                    ...c.locationTypeDefaults,
                    [entry.key]: { ...(c.locationTypeDefaults[entry.key] ?? FALLBACK_USAGE), ...patch },
                  },
                }));
              return (
                <Card key={entry.key}>
                  <CardHeader>
                    <div className="flex items-end justify-between gap-3">
                      <div className="flex-1">
                        <TextField label="Naam locatietype" value={entry.label} onChange={(label) => updateSettings((c) => { const next = [...c.locationTypes]; next[index] = { ...next[index], label }; return { ...c, locationTypes: next }; })} />
                        <p className="mt-1 text-xs text-muted-foreground">Key: {entry.key}</p>
                      </div>
                      <Button
                        variant="outline"
                        size="icon"
                        disabled={settings.locationTypes.length <= 1}
                        onClick={() => updateSettings((c) => ({
                          ...c,
                          locationTypes: c.locationTypes.filter((_, i) => i !== index),
                          locationTypeDefaults: Object.fromEntries(Object.entries(c.locationTypeDefaults).filter(([k]) => k !== entry.key)),
                        }))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="grid gap-5 md:grid-cols-3">
                    <CurrencyInput label="Sessies/paal/mnd" value={usage.sessionsPerChargePointMonth} onChange={(value) => setUsage({ sessionsPerChargePointMonth: value })} />
                    <CurrencyInput label="kWh/paal/mnd" value={usage.kwhPerChargePointMonth} onChange={(value) => setUsage({ kwhPerChargePointMonth: value })} />
                    <CurrencyInput label="Sessieduur uren" value={usage.averageSessionDurationHours} onChange={(value) => setUsage({ averageSessionDurationHours: value })} />
                    <CurrencyInput label="Laadvermogen kW" value={usage.effectiveChargingPowerKw} onChange={(value) => setUsage({ effectiveChargingPowerKw: Math.max(0.1, value) })} />
                    <CurrencyInput label="Gem. stilstaande min/sessie" value={usage.idleMinutesPerSession} onChange={(value) => setUsage({ idleMinutesPerSession: Math.max(0, value) })} />
                    <CurrencyInput label="% sessies dat blokkeert. betaalt" value={usage.idleBillableSharePct} onChange={(value) => setUsage({ idleBillableSharePct: Math.min(100, Math.max(0, value)) })} />
                  </CardContent>
                </Card>
              );
            })}
            <Button
              variant="outline"
              onClick={() => updateSettings((c) => {
                const key = uniqueKey(slugify("nieuw type"), c.locationTypes.map((t) => t.key));
                return {
                  ...c,
                  locationTypes: [...c.locationTypes, { key, label: "Nieuw type" }],
                  locationTypeDefaults: { ...c.locationTypeDefaults, [key]: FALLBACK_USAGE },
                };
              })}
            >
              <Plus className="mr-2 h-4 w-4" />
              Locatietype toevoegen
            </Button>
          </div>
        </TabsContent>

        {/* TARIFFS */}
        <TabsContent value="tariffs" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Standaard tariefdefaults</CardTitle>
              <CardDescription>Startwaarden voor nieuwe configuraties.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-5 md:grid-cols-3">
                <CurrencyInput label="Laadtarief/kWh" value={settings.defaultChargeTariffPerKwh} onChange={(value) => updateSettings((c) => ({ ...c, defaultChargeTariffPerKwh: value }))} />
                <CurrencyInput label="Stroom-inkoop/kWh" value={settings.defaultEnergyCostPerKwh} onChange={(value) => updateSettings((c) => ({ ...c, defaultEnergyCostPerKwh: value }))} />
                <CurrencyInput label="E-charging marge/kWh" value={settings.echargingMarginPerKwh} onChange={(value) => updateSettings((c) => ({ ...c, echargingMarginPerKwh: Math.max(0, value) }))} />
                <CurrencyInput label="Starttarief/sessie" value={settings.defaultStartFeePerSession} onChange={(value) => updateSettings((c) => ({ ...c, defaultStartFeePerSession: value }))} />
                <CurrencyInput label="Blokkeertarief/min" value={settings.defaultIdleFeePerMinute} onChange={(value) => updateSettings((c) => ({ ...c, defaultIdleFeePerMinute: value }))} />
                <CurrencyInput label="Grace in minuten" value={settings.defaultIdleGraceMinutes} onChange={(value) => updateSettings((c) => ({ ...c, defaultIdleGraceMinutes: value }))} />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <ToggleField label="Starttarief standaard aan" description="Standaard uit; per nieuwe configuratie aan/uit te zetten." checked={settings.defaultStartFeeEnabled} onChange={(checked) => updateSettings((c) => ({ ...c, defaultStartFeeEnabled: checked }))} />
                <ToggleField label="Blokkeertarief standaard aan" description="Standaard uit; per nieuwe configuratie aan/uit te zetten." checked={settings.defaultIdleFeeEnabled} onChange={(checked) => updateSettings((c) => ({ ...c, defaultIdleFeeEnabled: checked }))} />
              </div>
            </CardContent>
          </Card>

          {/* BLOKKEERTARIEF — BEREKENING & OPBRENGST */}
          <Card className="mt-4">
            <CardHeader>
              <CardTitle>Blokkeertarief — berekening &amp; opbrengst</CardTitle>
              <CardDescription>
                Zo rekent de configurator de opbrengst van het blokkeertarief uit. De waarden hierboven
                (blokkeertarief per minuut en gratis minuten) plus per locatietype de gem. stilstaande
                minuten en het % sessies dat betaalt (tab Locatietypes) bepalen het resultaat.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-1.5 rounded-lg border bg-muted/40 p-4 text-sm">
                <p className="font-medium">Berekening per laadpunt</p>
                <p className="text-muted-foreground">1. Gem. stilstaande minuten per sessie = instelbaar per locatietype (onderzoek-gebaseerd), NIET afgeleid van de sessieduur (nacht-/langparkeren vertekent dat).</p>
                <p className="text-muted-foreground">2. Na grace = stilstaande minuten min gratis minuten, minimaal 0</p>
                <p className="text-muted-foreground">3. Belaste minuten = na grace × % sessies dat blokkeertarief betaalt (dag/nacht-venster + incidentie)</p>
                <p className="text-muted-foreground">4. Opbrengst per laadpunt/maand = belaste minuten × sessies/maand × blokkeertarief per minuut</p>
                <p className="pt-1 text-xs">
                  Huidige waarden: <span className="font-medium">{eur(settings.defaultIdleFeePerMinute)} per minuut</span>, gratis{" "}
                  <span className="font-medium">{minutesLabel(settings.defaultIdleGraceMinutes)}</span>.
                  {!settings.defaultIdleFeeEnabled && " Let op: blokkeertarief staat standaard uit; het voorbeeld toont de potentiele opbrengst."}
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">Locatietype</th>
                      <th className="px-3 py-2 text-right font-medium">Stilstaand/sessie</th>
                      <th className="px-3 py-2 text-right font-medium">Na grace</th>
                      <th className="px-3 py-2 text-right font-medium">% betaalt</th>
                      <th className="px-3 py-2 text-right font-medium">Belast/sessie</th>
                      <th className="px-3 py-2 text-right font-medium">Sessies/mnd</th>
                      <th className="py-2 pl-3 text-right font-medium">Opbrengst/laadpunt/mnd</th>
                    </tr>
                  </thead>
                  <tbody>
                    {settings.locationTypes.map((entry) => {
                      const usage = settings.locationTypeDefaults[entry.key] ?? FALLBACK_USAGE;
                      const preview = idlePreview(usage, settings);
                      return (
                        <tr key={entry.key} className="border-b last:border-0">
                          <td className="py-2 pr-3">{entry.label}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{preview ? minutesLabel(preview.idleMinutesPerSession) : "-"}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{preview ? minutesLabel(preview.billableIdleMinutesPerSession) : "-"}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{Math.round(usage.idleBillableSharePct)}%</td>
                          <td className="px-3 py-2 text-right tabular-nums">{preview ? `${preview.effectiveBillableIdleMinutesPerSession.toLocaleString("nl-NL", { maximumFractionDigits: 1 })} min` : "-"}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{Math.round(usage.sessionsPerChargePointMonth)}</td>
                          <td className="py-2 pl-3 text-right font-medium tabular-nums">{preview ? eur(preview.idleFeeRevenuePerChargePointMonth) : "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground">
                Opbrengst is per laadpunt per maand en stijgt mee met het aantal laadpunten in de configuratie.
                Pas het tarief of de gratis minuten hierboven aan en de voorbeeld-opbrengst verandert direct mee.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ERE & INVESTERING */}
        <TabsContent value="investment" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>ERE &amp; investering</CardTitle>
              <CardDescription>ERE-subsidie en de investeringsschatting per laadpunt (stuurt de terugverdientijd).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-5 md:grid-cols-3">
                <CurrencyInput label="ERE-subsidie per kWh" value={settings.ereSubsidyPerKwh} onChange={(value) => updateSettings((c) => ({ ...c, ereSubsidyPerKwh: value }))} />
                <ToggleField label="ERE standaard aan" description="Of ERE bij een nieuwe configuratie al aanstaat." checked={settings.ereEnabledByDefault} onChange={(checked) => updateSettings((c) => ({ ...c, ereEnabledByDefault: checked }))} />
                <CurrencyInput label="Standaard aantal laadpunten" value={settings.defaultSocketCount} onChange={(value) => updateSettings((c) => ({ ...c, defaultSocketCount: Math.max(1, Math.round(value)) }))} />
              </div>
              <div className="grid gap-5 md:grid-cols-3">
                <CurrencyInput label="Investering per laadpunt — laag" value={settings.investmentPerSocketLow} onChange={(value) => updateSettings((c) => ({ ...c, investmentPerSocketLow: value }))} />
                <CurrencyInput label="Investering per laadpunt — hoog" value={settings.investmentPerSocketHigh} onChange={(value) => updateSettings((c) => ({ ...c, investmentPerSocketHigh: value }))} />
                <CurrencyInput label="Investering per laadpunt — slidermax" value={settings.investmentPerSocketMax} onChange={(value) => updateSettings((c) => ({ ...c, investmentPerSocketMax: value }))} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* INVOERGRENZEN */}
        <TabsContent value="ranges" className="mt-6">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Slider-grenzen</CardTitle>
                <CardDescription>Min, max en stapgrootte van de invoer-sliders in de configurator.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-5 md:grid-cols-3">
                  <CurrencyInput label="Laadtarief min" value={settings.inputRanges.chargeTariffMin} onChange={(v) => setRange("chargeTariffMin", v)} />
                  <CurrencyInput label="Laadtarief max" value={settings.inputRanges.chargeTariffMax} onChange={(v) => setRange("chargeTariffMax", v)} />
                  <CurrencyInput label="Laadtarief stap" value={settings.inputRanges.chargeTariffStep} onChange={(v) => setRange("chargeTariffStep", Math.max(0.001, v))} />
                  <CurrencyInput label="Stroominkoop min" value={settings.inputRanges.energyCostMin} onChange={(v) => setRange("energyCostMin", v)} />
                  <CurrencyInput label="Stroominkoop max" value={settings.inputRanges.energyCostMax} onChange={(v) => setRange("energyCostMax", v)} />
                  <CurrencyInput label="Stroominkoop stap" value={settings.inputRanges.energyCostStep} onChange={(v) => setRange("energyCostStep", Math.max(0.001, v))} />
                  <CurrencyInput label="kWh min" value={settings.inputRanges.kwhMin} onChange={(v) => setRange("kwhMin", v)} />
                  <CurrencyInput label="kWh max" value={settings.inputRanges.kwhMax} onChange={(v) => setRange("kwhMax", v)} />
                  <CurrencyInput label="kWh stap" value={settings.inputRanges.kwhStep} onChange={(v) => setRange("kwhStep", Math.max(1, v))} />
                  <CurrencyInput label="Sessies min" value={settings.inputRanges.sessionsMin} onChange={(v) => setRange("sessionsMin", v)} />
                  <CurrencyInput label="Sessies max" value={settings.inputRanges.sessionsMax} onChange={(v) => setRange("sessionsMax", v)} />
                  <CurrencyInput label="Sessies stap" value={settings.inputRanges.sessionsStep} onChange={(v) => setRange("sessionsStep", Math.max(1, v))} />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Laadpunten &amp; investering</CardTitle>
                <CardDescription>Grenzen voor de laadpunt-stepper en de investeringsslider.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-5 md:grid-cols-3">
                <CurrencyInput label="Laadpunten min" value={settings.inputRanges.socketsMin} onChange={(v) => setRange("socketsMin", Math.max(1, Math.round(v)))} />
                <CurrencyInput label="Laadpunten max" value={settings.inputRanges.socketsMax} onChange={(v) => setRange("socketsMax", Math.max(1, Math.round(v)))} />
                <CurrencyInput label="Investeringsslider — vloer (max)" value={settings.inputRanges.investmentSliderFloor} onChange={(v) => setRange("investmentSliderFloor", v)} />
                <CurrencyInput label="Investeringsslider — stap" value={settings.inputRanges.investmentSliderStep} onChange={(v) => setRange("investmentSliderStep", Math.max(1, v))} />
                <CurrencyInput label="Intensiteit-deler (scène-flow)" value={settings.inputRanges.intensityDivisor} onChange={(v) => setRange("intensityDivisor", Math.max(1, v))} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* OFFERTE-SJABLOON */}
        <TabsContent value="offer" className="mt-6">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Investering-standaard</CardTitle>
                <CardDescription>De "Levering en installatie"-tekst is vaste sjabloontekst. Alleen de stelpost graafwerk is een standaardbedrag (per offerte aan te passen).</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-5 md:grid-cols-3">
                <CurrencyInput label="Stelpost graafwerk (€)" value={settings.offerTemplate.defaultStelpostGraafwerk} onChange={(v) => setOffer({ defaultStelpostGraafwerk: Math.max(0, v) })} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Tarieven (offerte)</CardTitle>
                <CardDescription>Service-fee en storingstarieven die in de offerte-voorwaarden komen te staan.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-5 md:grid-cols-3">
                <CurrencyInput label="Service-fee / kWh (€)" value={settings.offerTemplate.serviceFeePerKwh} onChange={(v) => setOffer({ serviceFeePerKwh: Math.max(0, v) })} />
                <CurrencyInput label="Servicemonteur / uur (€)" value={settings.offerTemplate.servicemonteurPerHour} onChange={(v) => setOffer({ servicemonteurPerHour: Math.max(0, v) })} />
                <CurrencyInput label="Voorrijkosten / km (€)" value={settings.offerTemplate.voorrijkostenPerKm} onChange={(v) => setOffer({ voorrijkostenPerKm: Math.max(0, v) })} />
                <CurrencyInput label="Toeslag per werkuur (€)" value={settings.offerTemplate.toeslagWerkuur} onChange={(v) => setOffer({ toeslagWerkuur: Math.max(0, v) })} />
                <CurrencyInput label="Activatiekosten / socket (€)" value={settings.offerTemplate.activatiekostenPerSocket} onChange={(v) => setOffer({ activatiekostenPerSocket: Math.max(0, v) })} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Betaalregeling</CardTitle>
                <CardDescription>Percentages levering en installatie. Samen idealiter 100%.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-5 md:grid-cols-3">
                <CurrencyInput label="% bij opdracht" value={settings.offerTemplate.betaalBijOpdrachtPct} onChange={(v) => setOffer({ betaalBijOpdrachtPct: Math.min(100, Math.max(0, v)) })} />
                <CurrencyInput label="% bij start werkzaamheden" value={settings.offerTemplate.betaalBijStartPct} onChange={(v) => setOffer({ betaalBijStartPct: Math.min(100, Math.max(0, v)) })} />
                <CurrencyInput label="% na werkzaamheden" value={settings.offerTemplate.betaalNaWerkPct} onChange={(v) => setOffer({ betaalNaWerkPct: Math.min(100, Math.max(0, v)) })} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Ondertekenaar &amp; teksten</CardTitle>
                <CardDescription>Ondertekenaar namens E-Charging en de standaard briefkoppen.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-5 md:grid-cols-2">
                <TextField label="Ondertekenaar (naam)" value={settings.offerTemplate.echargingSignerName} onChange={(v) => setOffer({ echargingSignerName: v })} />
                <TextField label="Ondertekenaar (functie)" value={settings.offerTemplate.echargingSignerFunction} onChange={(v) => setOffer({ echargingSignerFunction: v })} />
                <TextField label="Standaard 'Locatie'" value={settings.offerTemplate.defaultObjectTemplate} onChange={(v) => setOffer({ defaultObjectTemplate: v })} />
                <TextField label="Standaard 'Betreft'" value={settings.offerTemplate.defaultBetreftTemplate} onChange={(v) => setOffer({ defaultBetreftTemplate: v })} />
                <TextField label="Standaard aanhef" value={settings.offerTemplate.defaultAanhef} onChange={(v) => setOffer({ defaultAanhef: v })} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
