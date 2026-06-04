import { useEffect, useMemo, useState } from "react";
import {
  configuratorSettingsSchema,
  defaultConfiguratorSettings,
  type ConfiguratorSettings,
  type LocationType,
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

const locationLabels: Record<LocationType, string> = {
  workplace: "Werkplek/kantoor",
  destination: "Bestemming",
  fleet: "Vlootlocatie/depot",
  public: "Publieke straat",
  other: "Anders",
};

function toNumber(value: string | number, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
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
      <Input
        inputMode="decimal"
        value={String(value)}
        onChange={(event) => onChange(toNumber(event.target.value, value))}
      />
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

  const updateSettings = (updater: (draft: ConfiguratorSettings) => ConfiguratorSettings) => {
    setSettings((current) => configuratorSettingsSchema.parse(updater(current)));
  };

  const save = async () => {
    setSaving(true);
    try {
      const parsed = configuratorSettingsSchema.parse(settings);
      const { data, error } = await supabase.functions.invoke<SettingsResponse>("configurator-settings", {
        body: { action: "update", settings: parsed },
      });
      if (error) throw error;
      if (data) {
        setSettings(data.settings);
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
            <p className="mt-1 text-sm text-muted-foreground">
              Beheer de calculator en start klantconfiguraties.
            </p>
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
          <p className="mt-1 text-sm text-muted-foreground">
            Beheer de calculator en start klantconfiguraties.
          </p>
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
        <TabsList className="grid w-full grid-cols-2 lg:grid-cols-5">
          <TabsTrigger value="defaults">Defaults</TabsTrigger>
          <TabsTrigger value="tiers">Staffel</TabsTrigger>
          <TabsTrigger value="eflux">E-Flux kosten</TabsTrigger>
          <TabsTrigger value="locations">Locatietypes</TabsTrigger>
          <TabsTrigger value="tariffs">Tarieven</TabsTrigger>
        </TabsList>

        <TabsContent value="defaults" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Globale defaults</CardTitle>
              <CardDescription>Basisdoelen en commerciële grenzen.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5 md:grid-cols-3">
              <CurrencyInput
                label="Target basis netto per paal/maand"
                value={settings.baseTargetNetEchargingPerChargePointMonth}
                onChange={(value) => updateSettings((current) => ({ ...current, baseTargetNetEchargingPerChargePointMonth: value }))}
              />
              <CurrencyInput
                label="Maximale fee in %"
                value={settings.maxServiceFeePct * 100}
                onChange={(value) => updateSettings((current) => ({ ...current, maxServiceFeePct: value / 100 }))}
              />
              <CurrencyInput
                label="Default contractduur"
                value={settings.defaultContractDurationMonths}
                onChange={(value) => updateSettings((current) => ({ ...current, defaultContractDurationMonths: Math.round(value) }))}
              />
              <CurrencyInput
                label="Opzegtermijn"
                value={settings.defaultNoticePeriodMonths}
                onChange={(value) => updateSettings((current) => ({ ...current, defaultNoticePeriodMonths: Math.round(value) }))}
              />
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <Label>Staffel gebruiken</Label>
                  <p className="text-xs text-muted-foreground">Uit betekent vast target basis gebruiken.</p>
                </div>
                <Switch
                  checked={settings.useTieredTarget}
                  onCheckedChange={(checked) => updateSettings((current) => ({ ...current, useTieredTarget: checked }))}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tiers" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Staffel</CardTitle>
              <CardDescription>Target netto E-Charging per paal per maand op basis van klant-rendement.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {sortedTiers.map((tier, index) => (
                <div key={`${tier.minNetReturnPerChargePointMonth}-${index}`} className="grid gap-3 rounded-xl border p-4 md:grid-cols-[1fr_1fr_1fr_auto]">
                  <CurrencyInput
                    label="Vanaf netto"
                    value={tier.minNetReturnPerChargePointMonth}
                    onChange={(value) => updateSettings((current) => {
                      const next = [...current.tiers];
                      next[index] = { ...next[index], minNetReturnPerChargePointMonth: value };
                      return { ...current, tiers: next };
                    })}
                  />
                  <CurrencyInput
                    label="Tot netto"
                    value={tier.maxNetReturnPerChargePointMonth ?? 0}
                    onChange={(value) => updateSettings((current) => {
                      const next = [...current.tiers];
                      next[index] = { ...next[index], maxNetReturnPerChargePointMonth: value <= 0 ? null : value };
                      return { ...current, tiers: next };
                    })}
                  />
                  <CurrencyInput
                    label="Target netto"
                    value={tier.targetNetEchargingPerChargePointMonth}
                    onChange={(value) => updateSettings((current) => {
                      const next = [...current.tiers];
                      next[index] = { ...next[index], targetNetEchargingPerChargePointMonth: value };
                      return { ...current, tiers: next };
                    })}
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    className="self-end"
                    disabled={settings.tiers.length <= 1}
                    onClick={() => updateSettings((current) => ({ ...current, tiers: current.tiers.filter((_, tierIndex) => tierIndex !== index) }))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                onClick={() => updateSettings((current) => ({
                  ...current,
                  tiers: [
                    ...current.tiers,
                    {
                      minNetReturnPerChargePointMonth: 600,
                      maxNetReturnPerChargePointMonth: null,
                      targetNetEchargingPerChargePointMonth: 85,
                    },
                  ],
                }))}
              >
                <Plus className="mr-2 h-4 w-4" />
                Tier toevoegen
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="eflux" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>E-Flux kosten</CardTitle>
              <CardDescription>Deze kosten worden meegenomen in de vereiste fee.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5 md:grid-cols-3">
              <CurrencyInput label="Abonnement per socket/mnd" value={settings.efluxSubscriptionPerSocketMonth} onChange={(value) => updateSettings((current) => ({ ...current, efluxSubscriptionPerSocketMonth: value }))} />
              <CurrencyInput label="Opstartkosten per socket" value={settings.efluxSetupPerSocket} onChange={(value) => updateSettings((current) => ({ ...current, efluxSetupPerSocket: value }))} />
              <CurrencyInput label="Afschrijftermijn in maanden" value={settings.efluxSetupAmortizationMonths} onChange={(value) => updateSettings((current) => ({ ...current, efluxSetupAmortizationMonths: Math.max(1, Math.round(value)) }))} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="locations" className="mt-6">
          <div className="space-y-4">
            {(Object.keys(locationLabels) as LocationType[]).map((type) => {
              const defaults = settings.locationTypeDefaults[type];
              return (
                <Card key={type}>
                  <CardHeader>
                    <CardTitle>{locationLabels[type]}</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-5 md:grid-cols-4">
                    <CurrencyInput label="Sessies/paal/mnd" value={defaults.sessionsPerChargePointMonth} onChange={(value) => updateSettings((current) => ({ ...current, locationTypeDefaults: { ...current.locationTypeDefaults, [type]: { ...defaults, sessionsPerChargePointMonth: value } } }))} />
                    <CurrencyInput label="kWh/paal/mnd" value={defaults.kwhPerChargePointMonth} onChange={(value) => updateSettings((current) => ({ ...current, locationTypeDefaults: { ...current.locationTypeDefaults, [type]: { ...defaults, kwhPerChargePointMonth: value } } }))} />
                    <CurrencyInput label="Sessieduur uren" value={defaults.averageSessionDurationHours} onChange={(value) => updateSettings((current) => ({ ...current, locationTypeDefaults: { ...current.locationTypeDefaults, [type]: { ...defaults, averageSessionDurationHours: value } } }))} />
                    <CurrencyInput label="Laadvermogen kW" value={defaults.effectiveChargingPowerKw} onChange={(value) => updateSettings((current) => ({ ...current, locationTypeDefaults: { ...current.locationTypeDefaults, [type]: { ...defaults, effectiveChargingPowerKw: Math.max(0.1, value) } } }))} />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="tariffs" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Standaard tariefdefaults</CardTitle>
              <CardDescription>Startwaarden voor nieuwe configuraties.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5 md:grid-cols-3">
              <CurrencyInput label="Laadtarief/kWh" value={settings.defaultChargeTariffPerKwh} onChange={(value) => updateSettings((current) => ({ ...current, defaultChargeTariffPerKwh: value }))} />
              <CurrencyInput label="Stroom-inkoop/kWh" value={settings.defaultEnergyCostPerKwh} onChange={(value) => updateSettings((current) => ({ ...current, defaultEnergyCostPerKwh: value }))} />
              <CurrencyInput label="Starttarief" value={settings.defaultStartFeePerSession} onChange={(value) => updateSettings((current) => ({ ...current, defaultStartFeePerSession: value }))} />
              <CurrencyInput label="Blokkeertarief/min" value={settings.defaultIdleFeePerMinute} onChange={(value) => updateSettings((current) => ({ ...current, defaultIdleFeePerMinute: value }))} />
              <CurrencyInput label="Grace in minuten" value={settings.defaultIdleGraceMinutes} onChange={(value) => updateSettings((current) => ({ ...current, defaultIdleGraceMinutes: value }))} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
