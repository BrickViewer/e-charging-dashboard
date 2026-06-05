import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { calculatePricing, defaultConfiguratorSettings } from "@echarging/pricing-engine";
import { Info, Maximize2, Minimize2 } from "lucide-react";
import { configuratorApi } from "../api";
import logoBright from "../assets/logo-bright.svg";
import { useWizardStore } from "./store";
import { TariffControls } from "./TariffControls";
import { FinalizePanel } from "./FinalizePanel";
import { IsometricSite } from "../scene/IsometricSite";
import { useCountUp } from "../scene/useCountUp";
import { euro, jaren, roundToHalf } from "./format";

function EarningsStrip({
  perMonth,
  perYear,
  profitable,
  paybackLoYears,
  paybackHiYears,
  assumptions,
}: {
  perMonth: number;
  perYear: number;
  profitable: boolean;
  paybackLoYears: number | null;
  paybackHiYears: number | null;
  assumptions: { label: string; value: string }[];
}) {
  const m = useCountUp(perMonth);
  const y = useCountUp(perYear);
  const [assumeOpen, setAssumeOpen] = useState(false);

  const payback =
    paybackLoYears === null || paybackHiYears === null
      ? null
      : Math.abs(roundToHalf(paybackLoYears) - roundToHalf(paybackHiYears)) < 0.01
        ? jaren(paybackLoYears)
        : `${jaren(paybackLoYears).replace(" jaar", "")} – ${jaren(paybackHiYears)}`;

  return (
    <div className="cfg-earnings">
      <p className="field-label mb-0">Dit verdient u</p>

      <div className="mt-2 flex items-end gap-4">
        <strong className="mono font-extrabold leading-none tracking-[-0.035em] text-foreground" style={{ fontSize: "clamp(48px, 6vw, 84px)" }}>
          {euro(Math.round(m))}
        </strong>
        <span className="pb-2.5 text-lg font-medium text-muted-foreground">per maand</span>
      </div>

      {profitable ? (
        <div className="mt-5 flex items-stretch gap-6 border-t border-border-soft/60 pt-4">
          <div>
            <p className="field-label mb-1">Per jaar</p>
            <p className="mono text-[22px] font-bold text-gauge-green">{euro(Math.round(y))}</p>
          </div>
          {payback && (
            <>
              <div className="w-px self-stretch bg-border-soft/70" />
              <div className="relative">
                <p className="field-label mb-1">Terugverdiend in</p>
                <p className="mono text-[22px] font-bold text-foreground">{payback}</p>
              </div>
            </>
          )}
          <div className="relative ml-auto self-center">
            <button type="button" className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => setAssumeOpen((v) => !v)} aria-expanded={assumeOpen}>
              <Info size={14} />
              Aannames
            </button>
            {assumeOpen && (
              <div className="absolute bottom-full right-0 z-20 mb-2 w-64 panel p-4">
                <p className="field-label mb-3">Gebaseerd op uw invoer</p>
                <div className="space-y-1.5">
                  {assumptions.map((a) => (
                    <div key={a.label} className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="text-muted-foreground">{a.label}</span>
                      <span className="mono text-right text-foreground">{a.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <p className="mt-5 border-t border-border-soft/60 pt-4 text-sm text-muted-foreground">
          Pas het tarief of het verwachte verbruik aan om het rendement te zien.
        </p>
      )}
      {profitable && payback && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Afhankelijk van de installatiekosten. Daarna volledig rendement.
        </p>
      )}
    </div>
  );
}

export default function WizardPage() {
  const params = useParams({ strict: false }) as { sessionId?: string };
  const sessionId = params.sessionId ?? "local-preview";

  const shellRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const [finalizeResult, setFinalizeResult] = useState<{ clientNumber: number | null; clientId: string } | null>(null);

  const {
    input,
    investmentMinTotal,
    investmentMaxTotal,
    settings,
    settingsVersion,
    sellerMode,
    applySettings,
    updateInput,
    setSockets,
    setInvestmentRange,
    setLocationType,
    ereEnabled,
    setEreEnabled,
    setSellerMode,
  } = useWizardStore();

  const pricing = useMemo(() => calculatePricing(input, settings), [input, settings]);

  const sockets = input.hardware.chargePoints;
  const intensity = Math.min(1, input.usage.kwhPerChargePointMonth / settings.inputRanges.intensityDivisor);
  const active = pricing.totals.netReturnPerMonth > 0;

  // ERE-subsidie komt bovenop het netto klantbedrag (UI-only, niet via de engine).
  const ereMaand = ereEnabled ? settings.ereSubsidyPerKwh * input.usage.kwhPerChargePointMonth * sockets : 0;
  const effectiveMonth = pricing.totals.customerPerMonth + ereMaand;
  const effectiveYear = effectiveMonth * 12;
  const profitable = effectiveMonth > 0;
  const paybackLoYears = profitable ? investmentMinTotal / effectiveMonth / 12 : null;
  const paybackHiYears = profitable ? investmentMaxTotal / effectiveMonth / 12 : null;

  const assumptions = [
    { label: "Laadpunten", value: String(sockets) },
    { label: "Verbruik", value: `${input.usage.kwhPerChargePointMonth.toLocaleString("nl-NL")} kWh p.p./mnd` },
    { label: "Laadtarief", value: `${euro(input.tariffs.chargeTariffPerKwh, 2)} / kWh` },
    { label: "Looptijd", value: `${input.contract.durationMonths} maanden` },
    { label: "Investering", value: `${euro(investmentMinTotal)} – ${euro(investmentMaxTotal)}` },
    ...(ereEnabled ? [{ label: "ERE-subsidie", value: `+ ${euro(settings.ereSubsidyPerKwh, 2)} / kWh` }] : []),
  ];

  const saveSummary = [
    { label: "Laadpunten", value: String(sockets) },
    { label: "Laadtarief", value: `${euro(input.tariffs.chargeTariffPerKwh, 2)} / kWh` },
    { label: "Verwacht verbruik", value: `${input.usage.kwhPerChargePointMonth.toLocaleString("nl-NL")} kWh p.p./mnd` },
    { label: "Totale investering", value: `${euro(investmentMinTotal)} – ${euro(investmentMaxTotal)}` },
    { label: "ERE-subsidie", value: ereEnabled ? `Aan (+ ${euro(settings.ereSubsidyPerKwh, 2)}/kWh)` : "Uit" },
  ];

  const settingsQuery = useQuery({
    queryKey: ["configurator-settings", sessionId],
    queryFn: async () => {
      try {
        return await configuratorApi.getSettings(sessionId);
      } catch {
        return { version: 1, settings: defaultConfiguratorSettings };
      }
    },
    staleTime: 60_000,
  });

  const prefillApplied = useRef(false);
  useEffect(() => {
    if (!settingsQuery.data) return;
    applySettings(settingsQuery.data.settings, settingsQuery.data.version);

    // Eenmalige prefill vanuit de lead (geen dubbele invoer).
    const p = settingsQuery.data.prefill;
    if (p && !prefillApplied.current) {
      prefillApplied.current = true;
      updateInput((draft) => {
        if (p.companyName) draft.customer.companyName = p.companyName;
        if (p.contactName) draft.customer.contactName = p.contactName;
        if (p.contactEmail) draft.customer.contactEmail = p.contactEmail;
        if (p.contactPhone) draft.customer.contactPhone = p.contactPhone;
        if (p.locationAddress) draft.customer.locationAddress = p.locationAddress;
        if (p.postalCode) draft.customer.postalCode = p.postalCode;
        if (p.city) draft.customer.city = p.city;
      });
      if (p.locationType && settingsQuery.data.settings.locationTypes.some((t) => t.key === p.locationType)) {
        setLocationType(p.locationType);
      }
      if (p.sockets && p.sockets > 0) setSockets(p.sockets);
    }
  }, [applySettings, settingsQuery.data, updateInput, setLocationType, setSockets]);

  // Autosave concept (debounce 2s).
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      configuratorApi.saveDraft(sessionId, { input, step: 1 }).catch(() => {});
    }, 2_000);
    return () => window.clearTimeout(timeout);
  }, [input, sessionId]);

  // Fullscreen
  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void shellRef.current?.requestFullscreen?.();
  };

  const finalizeMutation = useMutation({
    mutationFn: () => configuratorApi.finalizeClient(sessionId, {
      input,
      settingsVersion,
      ere: ereEnabled,
      investmentMinTotal,
      investmentMaxTotal,
    }),
    onSuccess: (result) => {
      setFinalizeError(null);
      setFinalizeResult({ clientNumber: result.clientNumber ?? null, clientId: result.clientId });
    },
    onError: (error) => {
      setFinalizeError(error instanceof Error ? error.message : "Voorstel opslaan mislukt.");
    },
  });

  const openSave = () => {
    setFinalizeError(null);
    setSaveOpen(true);
  };

  return (
    <div className="configurator-shell" ref={shellRef}>
      <header className="cfg-header">
        <div className="flex items-center gap-3">
          <img src={logoBright} alt="E-Charging" className="h-6 w-auto" />
          <span className="hidden border-l border-border-soft pl-3 text-sm font-medium text-muted-foreground sm:inline">Configurator</span>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" className="secondary-button !min-h-10 px-4" onClick={toggleFullscreen}
            aria-label={isFullscreen ? "Volledig scherm sluiten" : "Volledig scherm"}>
            {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            <span className="hidden sm:inline">{isFullscreen ? "Verlaten" : "Fullscreen"}</span>
          </button>
          <button type="button" className="primary-button !min-h-10 px-5" onClick={openSave}>Voorstel vastleggen</button>
        </div>
      </header>

      <div className="cfg-body">
        {/* Links: scène + verdienste */}
        <section className="cfg-stage">
          <div className="cfg-scene">
            <IsometricSite sockets={sockets} intensity={intensity} active={active} />
          </div>
          <EarningsStrip
            perMonth={profitable ? effectiveMonth : 0}
            perYear={profitable ? effectiveYear : 0}
            profitable={profitable}
            paybackLoYears={paybackLoYears}
            paybackHiYears={paybackHiYears}
            assumptions={assumptions}
          />
        </section>

        {/* Rechts: instellingen */}
        <aside className="cfg-controls">
          <TariffControls
            input={input}
            pricing={pricing}
            investmentMin={investmentMinTotal}
            investmentMax={investmentMaxTotal}
            setInvestmentRange={setInvestmentRange}
            setSockets={setSockets}
            updateInput={updateInput}
            setLocationType={setLocationType}
            ereEnabled={ereEnabled}
            setEreEnabled={setEreEnabled}
            sellerMode={sellerMode}
            setSellerMode={setSellerMode}
            isFullscreen={isFullscreen}
            settings={settings}
          />
        </aside>
      </div>

      {saveOpen && (
        <FinalizePanel
          input={input}
          updateInput={updateInput}
          monthly={profitable ? effectiveMonth : 0}
          perYear={profitable ? effectiveYear : 0}
          summary={saveSummary}
          onFinalize={() => finalizeMutation.mutate()}
          finalizing={finalizeMutation.isPending}
          finalizeError={finalizeError}
          finalizeResult={finalizeResult}
          onClose={() => setSaveOpen(false)}
        />
      )}
    </div>
  );
}
