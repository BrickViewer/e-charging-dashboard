import { useEffect, useMemo, useState } from "react";
import {
  configuratorSettingsSchema,
  defaultConfiguratorSettings,
  type ConfiguratorSettings,
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

  const sortedTiers = useMemo(
    () => [...settings.tiers].sort((a, b) => a.minNetReturnPerChargePointMonth - b.minNetReturnPerChargePointMonth),
    [settings.tiers],
  );

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
    try {
      const { data, error } = await supabase.functions.invoke<SessionStartResponse>("configurator-session-start");
      if (error) throw error;
      const url = data?.url ?? `http://localhost:8081/s/local-${Date.now()}/stap/1`;
      window.open(url, "_blank", "noopener,noreferrer,width=1400,height=900");
    } catch {
      const localUrl = `http://localhost:8081/s/local-${Date.now()}/stap/1`;
      toast.warning("Configuratiesessie kon niet via de backend starten. Lokale preview geopend.");
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
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 lg:grid-cols-7">
          <TabsTrigger value="defaults">Defaults</TabsTrigger>
          <TabsTrigger value="tiers">Staffel</TabsTrigger>
          <TabsTrigger value="eflux">E-Flux</TabsTrigger>
          <TabsTrigger value="locations">Locatietypes</TabsTrigger>
          <TabsTrigger value="tariffs">Tarieven</TabsTrigger>
          <TabsTrigger value="investment">ERE &amp; investering</TabsTrigger>
          <TabsTrigger value="ranges">Invoergrenzen</TabsTrigger>
        </TabsList>

        {/* DEFAULTS */}
        <TabsContent value="defaults" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Globale defaults</CardTitle>
              <CardDescription>Basisdoelen en commerciële grenzen.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5 md:grid-cols-3">
              <CurrencyInput label="Target basis netto per paal/maand" value={settings.baseTargetNetEchargingPerChargePointMonth} onChange={(value) => updateSettings((c) => ({ ...c, baseTargetNetEchargingPerChargePointMonth: value }))} />
              <CurrencyInput label="Maximale fee in %" value={settings.maxServiceFeePct * 100} onChange={(value) => updateSettings((c) => ({ ...c, maxServiceFeePct: Math.min(1, Math.max(0, value / 100)) }))} />
              <CurrencyInput label="Default contractduur" value={settings.defaultContractDurationMonths} onChange={(value) => updateSettings((c) => ({ ...c, defaultContractDurationMonths: Math.max(1, Math.round(value)) }))} />
              <CurrencyInput label="Opzegtermijn" value={settings.defaultNoticePeriodMonths} onChange={(value) => updateSettings((c) => ({ ...c, defaultNoticePeriodMonths: Math.max(0, Math.round(value)) }))} />
              <ToggleField label="Staffel gebruiken" description="Uit betekent vast target basis gebruiken." checked={settings.useTieredTarget} onChange={(checked) => updateSettings((c) => ({ ...c, useTieredTarget: checked }))} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* TIERS */}
        <TabsContent value="tiers" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Staffel</CardTitle>
              <CardDescription>Target netto E-Charging per paal per maand op basis van klant-rendement.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {sortedTiers.map((tier, index) => (
                <div key={`${tier.minNetReturnPerChargePointMonth}-${index}`} className="grid gap-3 rounded-xl border p-4 md:grid-cols-[1fr_1fr_1fr_auto]">
                  <CurrencyInput label="Vanaf netto" value={tier.minNetReturnPerChargePointMonth} onChange={(value) => updateSettings((c) => { const next = [...c.tiers]; next[index] = { ...next[index], minNetReturnPerChargePointMonth: value }; return { ...c, tiers: next }; })} />
                  <CurrencyInput label="Tot netto" value={tier.maxNetReturnPerChargePointMonth ?? 0} onChange={(value) => updateSettings((c) => { const next = [...c.tiers]; next[index] = { ...next[index], maxNetReturnPerChargePointMonth: value <= 0 ? null : value }; return { ...c, tiers: next }; })} />
                  <CurrencyInput label="Target netto" value={tier.targetNetEchargingPerChargePointMonth} onChange={(value) => updateSettings((c) => { const next = [...c.tiers]; next[index] = { ...next[index], targetNetEchargingPerChargePointMonth: value }; return { ...c, tiers: next }; })} />
                  <Button variant="outline" size="icon" className="self-end" disabled={settings.tiers.length <= 1} onClick={() => updateSettings((c) => ({ ...c, tiers: c.tiers.filter((_, i) => i !== index) }))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" onClick={() => updateSettings((c) => ({ ...c, tiers: [...c.tiers, { minNetReturnPerChargePointMonth: 600, maxNetReturnPerChargePointMonth: null, targetNetEchargingPerChargePointMonth: 85 }] }))}>
                <Plus className="mr-2 h-4 w-4" />
                Tier toevoegen
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* EFLUX */}
        <TabsContent value="eflux" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>E-Flux kosten</CardTitle>
              <CardDescription>Deze kosten worden meegenomen in de vereiste fee.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5 md:grid-cols-3">
              <CurrencyInput label="Abonnement per socket/mnd" value={settings.efluxSubscriptionPerSocketMonth} onChange={(value) => updateSettings((c) => ({ ...c, efluxSubscriptionPerSocketMonth: value }))} />
              <CurrencyInput label="Opstartkosten per socket" value={settings.efluxSetupPerSocket} onChange={(value) => updateSettings((c) => ({ ...c, efluxSetupPerSocket: value }))} />
              <CurrencyInput label="Afschrijftermijn in maanden" value={settings.efluxSetupAmortizationMonths} onChange={(value) => updateSettings((c) => ({ ...c, efluxSetupAmortizationMonths: Math.max(1, Math.round(value)) }))} />
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
                  <CardContent className="grid gap-5 md:grid-cols-4">
                    <CurrencyInput label="Sessies/paal/mnd" value={usage.sessionsPerChargePointMonth} onChange={(value) => setUsage({ sessionsPerChargePointMonth: value })} />
                    <CurrencyInput label="kWh/paal/mnd" value={usage.kwhPerChargePointMonth} onChange={(value) => setUsage({ kwhPerChargePointMonth: value })} />
                    <CurrencyInput label="Sessieduur uren" value={usage.averageSessionDurationHours} onChange={(value) => setUsage({ averageSessionDurationHours: value })} />
                    <CurrencyInput label="Laadvermogen kW" value={usage.effectiveChargingPowerKw} onChange={(value) => setUsage({ effectiveChargingPowerKw: Math.max(0.1, value) })} />
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
                <CurrencyInput label="Starttarief/sessie" value={settings.defaultStartFeePerSession} onChange={(value) => updateSettings((c) => ({ ...c, defaultStartFeePerSession: value }))} />
                <CurrencyInput label="Blokkeertarief/min" value={settings.defaultIdleFeePerMinute} onChange={(value) => updateSettings((c) => ({ ...c, defaultIdleFeePerMinute: value }))} />
                <CurrencyInput label="Grace in minuten" value={settings.defaultIdleGraceMinutes} onChange={(value) => updateSettings((c) => ({ ...c, defaultIdleGraceMinutes: value }))} />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <ToggleField label="Starttarief standaard aan" checked={settings.defaultStartFeeEnabled} onChange={(checked) => updateSettings((c) => ({ ...c, defaultStartFeeEnabled: checked }))} />
                <ToggleField label="Blokkeertarief standaard aan" checked={settings.defaultIdleFeeEnabled} onChange={(checked) => updateSettings((c) => ({ ...c, defaultIdleFeeEnabled: checked }))} />
              </div>
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
      </Tabs>
    </div>
  );
}
