import { useState } from "react";
import * as Slider from "@radix-ui/react-slider";
import type { ConfiguratorSettings, PricingInput, PricingResult } from "@echarging/pricing-engine";
import { ChevronDown, Minus, Plus } from "lucide-react";
import { euro, number, parseNumber } from "./format";

function Control({ label, value, sub, children }: { label: string; value?: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{label}</span>
        {value && <span className="mono text-sm font-bold text-foreground">{value}</span>}
      </div>
      <div className="mt-2.5">{children}</div>
      {sub && <p className="mt-1.5 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function NativeRange({ value, min, max, step, onChange }: { value: number; min: number; max: number; step: number; onChange: (n: number) => void }) {
  return (
    <input className="range-input" type="range" min={min} max={max} step={step} value={value}
      onChange={(e) => onChange(parseNumber(e.target.value, value))} />
  );
}

function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (n: number) => void }) {
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  return (
    <div className="stepper-sm">
      <button type="button" className="stepper-btn" aria-label="Minder" onClick={() => onChange(clamp(value - 1))}><Minus size={18} /></button>
      <input className="stepper-value" inputMode="numeric" value={value} onChange={(e) => onChange(clamp(parseNumber(e.target.value, value)))} />
      <button type="button" className="stepper-btn" aria-label="Meer" onClick={() => onChange(clamp(value + 1))}><Plus size={18} /></button>
    </div>
  );
}

function SwitchRow({ title, sub, active, amount, onToggle, onAmount }: {
  title: string; sub: string; active: boolean; amount: number; onToggle: () => void; onAmount: (n: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="truncate text-[11px] text-muted-foreground">{sub}</p>
      </div>
      <div className="flex items-center gap-2">
        {active && (
          <input className="text-input !min-h-9 w-[68px] text-sm" inputMode="decimal" value={amount}
            aria-label={`${title} bedrag`} onChange={(e) => onAmount(parseNumber(e.target.value, amount))} />
        )}
        <button type="button" className="switch-track" data-active={active} onClick={onToggle} aria-pressed={active} aria-label={title}>
          <div className="switch-thumb" />
        </button>
      </div>
    </div>
  );
}

export function TariffControls({
  input,
  pricing,
  investmentMin,
  investmentMax,
  setInvestmentRange,
  setSockets,
  updateInput,
  setLocationType,
  ereEnabled,
  setEreEnabled,
  isFullscreen,
  settings,
}: {
  input: PricingInput;
  pricing: PricingResult;
  investmentMin: number;
  investmentMax: number;
  setInvestmentRange: (min: number, max: number) => void;
  setSockets: (n: number) => void;
  updateInput: (recipe: (draft: PricingInput) => void) => void;
  setLocationType: (lt: string) => void;
  ereEnabled: boolean;
  setEreEnabled: (b: boolean) => void;
  isFullscreen: boolean;
  settings: ConfiguratorSettings;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const sockets = input.hardware.chargePoints;
  const ranges = settings.inputRanges;
  // Slider-plafond schaalt met het aantal laadpunten (schatting per laadpunt + lucht).
  const investMax = Math.max(
    ranges.investmentSliderFloor,
    Math.ceil((sockets * settings.investmentPerSocketMax) / ranges.investmentSliderStep) * ranges.investmentSliderStep,
  );
  const ereMaand = ereEnabled ? settings.ereSubsidyPerKwh * input.usage.kwhPerChargePointMonth * sockets : 0;

  return (
    <div className="flex h-full flex-col">
      {/* ---- KERN-INSTELLINGEN ---- */}
      <div className="space-y-6">
        <Control label="Type locatie" sub="Bepaalt het gemiddelde gebruik — vrij aan te passen">
          <div className="segmented">
            {settings.locationTypes.map((opt) => (
              <button key={opt.key} type="button" className="segmented-item" data-active={input.customer.locationType === opt.key}
                onClick={() => setLocationType(opt.key)}>
                {opt.label}
              </button>
            ))}
          </div>
        </Control>

        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Aantal laadpunten</span>
          <Stepper value={sockets} min={ranges.socketsMin} max={ranges.socketsMax} onChange={setSockets} />
        </div>

        <Control label="Laadtarief" value={`${euro(input.tariffs.chargeTariffPerKwh, 2)} / kWh`}>
          <NativeRange value={input.tariffs.chargeTariffPerKwh} min={ranges.chargeTariffMin} max={ranges.chargeTariffMax} step={ranges.chargeTariffStep}
            onChange={(n) => updateInput((d) => { d.tariffs.chargeTariffPerKwh = n; })} />
        </Control>

        <Control label="Stroominkoop" value={`${euro(input.tariffs.energyCostPerKwh, 2)} / kWh`}>
          <NativeRange value={input.tariffs.energyCostPerKwh} min={ranges.energyCostMin} max={ranges.energyCostMax} step={ranges.energyCostStep}
            onChange={(n) => updateInput((d) => { d.tariffs.energyCostPerKwh = n; })} />
        </Control>

        <Control label="Verwacht verbruik" value={`${number(input.usage.kwhPerChargePointMonth)} kWh`} sub="per laadpunt / maand">
          <NativeRange value={input.usage.kwhPerChargePointMonth} min={ranges.kwhMin} max={ranges.kwhMax} step={ranges.kwhStep}
            onChange={(n) => updateInput((d) => { d.usage.kwhPerChargePointMonth = n; })} />
        </Control>

        <Control label="Sessies" value={`${number(input.usage.sessionsPerChargePointMonth)} / mnd`} sub="per laadpunt — standaard vanuit het locatietype">
          <NativeRange value={input.usage.sessionsPerChargePointMonth} min={ranges.sessionsMin} max={ranges.sessionsMax} step={ranges.sessionsStep}
            onChange={(n) => updateInput((d) => { d.usage.sessionsPerChargePointMonth = n; })} />
        </Control>

        <Control
          label="Totale investering"
          value={`${euro(investmentMin)} – ${euro(investmentMax)}`}
          sub={`≈ ${euro(Math.round(investmentMin / sockets))} – ${euro(Math.round(investmentMax / sockets))} per laadpunt`}
        >
          <Slider.Root className="rng-root" min={0} max={investMax} step={ranges.investmentSliderStep} minStepsBetweenThumbs={1}
            value={[investmentMin, investmentMax]} onValueChange={([lo, hi]) => setInvestmentRange(lo, hi)}>
            <Slider.Track className="rng-track"><Slider.Range className="rng-range" /></Slider.Track>
            <Slider.Thumb className="rng-thumb" aria-label="Minimale investering" />
            <Slider.Thumb className="rng-thumb" aria-label="Maximale investering" />
          </Slider.Root>
        </Control>
      </div>

      {/* ---- GEAVANCEERD ---- */}
      <div className="mt-5 border-t border-border-soft/60 pt-4">
        <button type="button" className="ghost-row" onClick={() => setAdvancedOpen((v) => !v)} aria-expanded={advancedOpen}>
          <span className="flex flex-col text-left">
            <span className="text-sm font-semibold text-foreground">Geavanceerde instellingen</span>
            <span className="text-[11px] text-muted-foreground">Start- &amp; blokkeertarief, gratis minuten, ERE</span>
          </span>
          <ChevronDown size={18} className="text-muted-foreground transition-transform duration-200" style={{ transform: advancedOpen ? "rotate(180deg)" : "none" }} />
        </button>

        <div className="adv-wrap" data-open={advancedOpen}>
          <div className="adv-inner">
            <div className="space-y-5 pt-4">
              <div className="space-y-3">
                <SwitchRow
                  title="Starttarief"
                  sub="Per sessie"
                  active={input.tariffs.startFeeEnabled}
                  amount={input.tariffs.startFeePerSession}
                  onToggle={() => updateInput((d) => { d.tariffs.startFeeEnabled = !d.tariffs.startFeeEnabled; })}
                  onAmount={(n) => updateInput((d) => { d.tariffs.startFeePerSession = n; })}
                />
                <SwitchRow
                  title="Blokkeertarief"
                  sub={`Per minuut, na ${number(input.tariffs.idleGraceMinutes)} gratis min`}
                  active={input.tariffs.idleFeeEnabled}
                  amount={input.tariffs.idleFeePerMinute}
                  onToggle={() => updateInput((d) => { d.tariffs.idleFeeEnabled = !d.tariffs.idleFeeEnabled; })}
                  onAmount={(n) => updateInput((d) => { d.tariffs.idleFeePerMinute = n; })}
                />
                {input.tariffs.idleFeeEnabled && (
                  <div className="space-y-2.5 rounded-xl border border-border-soft/60 bg-muted/20 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[13px] text-muted-foreground">Gem. stilstaande min / sessie</p>
                      <input className="text-input !min-h-9 w-[68px] text-sm" inputMode="numeric" value={input.usage.idleMinutesPerSession}
                        aria-label="Gemiddelde stilstaande minuten per sessie"
                        onChange={(e) => updateInput((d) => { d.usage.idleMinutesPerSession = parseNumber(e.target.value, d.usage.idleMinutesPerSession); })} />
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[13px] text-muted-foreground">Gratis minuten vóór blokkeertarief</p>
                      <input className="text-input !min-h-9 w-[68px] text-sm" inputMode="numeric" value={input.tariffs.idleGraceMinutes}
                        aria-label="Gratis minuten"
                        onChange={(e) => updateInput((d) => { d.tariffs.idleGraceMinutes = parseNumber(e.target.value, d.tariffs.idleGraceMinutes); })} />
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[13px] text-muted-foreground">% sessies dat blokkeertarief betaalt</p>
                      <input className="text-input !min-h-9 w-[68px] text-sm" inputMode="numeric" value={input.usage.idleBillableSharePct}
                        aria-label="Percentage sessies dat blokkeertarief betaalt"
                        onChange={(e) => updateInput((d) => { d.usage.idleBillableSharePct = parseNumber(e.target.value, d.usage.idleBillableSharePct); })} />
                    </div>
                    {/* Transparante berekening — zo komen we aan de blokkeer-opbrengst. */}
                    <div className="space-y-0.5 border-t border-border-soft/60 pt-2 text-[11px] leading-relaxed text-muted-foreground">
                      <p>
                        max(0, {number(input.usage.idleMinutesPerSession)} − {number(input.tariffs.idleGraceMinutes)}) × {number(input.usage.idleBillableSharePct)}%
                        = <span className="font-semibold text-foreground">{number(pricing.effectiveBillableIdleMinutesPerSession, 1)}</span> belaste min/sessie
                      </p>
                      <p>
                        × {number(input.usage.sessionsPerChargePointMonth)} sessies × {euro(input.tariffs.idleFeePerMinute, 2)}
                        = <span className="font-semibold text-foreground">{euro(pricing.idleFeeRevenuePerChargePointMonth)}</span> / laadpunt / maand
                      </p>
                      <p className="opacity-70">Theoretisch max (sessieduur − laadtijd): {number(pricing.derivedIdleMinutesPerSession)} min/sessie — niet meegerekend.</p>
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between gap-3 border-t border-border-soft/60 pt-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">ERE-subsidie</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      + {euro(settings.ereSubsidyPerKwh, 2)} per kWh{ereEnabled ? ` · +${euro(ereMaand)}/mnd` : ""}
                    </p>
                  </div>
                  <button type="button" className="switch-track" data-active={ereEnabled} onClick={() => setEreEnabled(!ereEnabled)} aria-pressed={ereEnabled} aria-label="ERE-subsidie">
                    <div className="switch-thumb" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
